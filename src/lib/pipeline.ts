/**
 * The synthesis pipeline: script in, mastered audio plus subtitles out.
 *
 * Engine-agnostic. Kokoro and the clone engine both plug in through
 * `renderChunk`.
 */
import fs from "node:fs/promises";
import path from "node:path";

import * as A from "./audio";
import * as clone from "./engines/clone";
import * as kokoro from "./engines/kokoro";
import { getSettings, withEngine, type EngineName } from "./engines/manager";
import { PRESET_BLENDS, type BlendComponent } from "./catalog";
import { getVoice, type VoiceRow } from "./db";
import { prepare, type Chunk } from "./text/chunker";
import { OUTPUT_DIR } from "./paths";

export interface SynthesisRequest {
  text: string;
  voice: string | BlendComponent[];
  speed: number;
  pitch: number;
  lang: string | null;
  format: "mp3" | "wav";
  bitrate: number;
  loudness: number | null;
  sentencePause: number;
  paragraphPause: number;
  maxChunkChars: number;
  multiSpeaker: boolean;
  speakerVoices: Record<string, string | BlendComponent[]>;
  temperature: number;
  topP: number;
  repetitionPenalty: number;
  seed: number | null;
  subtitles: boolean;
  title: string;
}

export const DEFAULTS: SynthesisRequest = {
  text: "",
  voice: "af_heart",
  speed: 1,
  pitch: 0,
  lang: null,
  format: "mp3",
  bitrate: 192,
  loudness: -14,
  sentencePause: 0.22,
  paragraphPause: 0.45,
  maxChunkChars: 320,
  multiSpeaker: false,
  speakerVoices: {},
  temperature: 0,
  topP: 0.95,
  repetitionPenalty: 1.2,
  seed: null,
  subtitles: false,
  title: "",
};

export interface SynthesisResult {
  audio: Float32Array;
  sampleRate: number;
  duration: number;
  cues: A.Cue[];
  chunkCount: number;
  elapsed: number;
  realtimeFactor: number;
  provenance: Record<string, unknown>;
}

export type ProgressFn = (percent: number, stage: string) => void;

/* ------------------------------------------------------------------ */
/* Time / pitch                                                        */
/* ------------------------------------------------------------------ */

/**
 * Overlap-add time stretch. factor > 1 lengthens the audio.
 *
 * Phase-incoherent OLA is crude next to a phase vocoder, but on speech at
 * the modest factors used here it is transparent enough and costs a
 * fraction of the CPU.
 */
function timeStretch(audio: Float32Array, rate: number, factor: number): Float32Array {
  if (Math.abs(factor - 1) < 0.01 || audio.length === 0) return audio;

  const win = Math.max(256, Math.floor(rate * 0.04));
  if (audio.length < win * 2) return audio;
  const hopIn = Math.floor(win / 4);
  const hopOut = Math.max(1, Math.round(hopIn * factor));

  const window = new Float32Array(win);
  for (let i = 0; i < win; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));

  const frames = Math.max(1, Math.floor((audio.length - win) / hopIn));
  const out = new Float32Array(frames * hopOut + win);
  const norm = new Float32Array(out.length);

  for (let f = 0; f < frames; f++) {
    const src = f * hopIn;
    const dst = f * hopOut;
    for (let i = 0; i < win; i++) {
      out[dst + i] += audio[src + i] * window[i];
      norm[dst + i] += window[i];
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(norm[i], 1e-6);
  return out;
}

/**
 * Pitch shift that preserves duration: stretch by the pitch ratio, then
 * resample by the same ratio. The two cancel in length, leaving only pitch.
 */
function pitchShift(audio: Float32Array, rate: number, semitones: number): Float32Array {
  if (Math.abs(semitones) < 0.01 || audio.length === 0) return audio;
  const ratio = Math.pow(2, semitones / 12);
  return A.resample(timeStretch(audio, rate, ratio), Math.round(rate * ratio), rate);
}

/** Tempo change without touching pitch (speed > 1 = faster). */
function applySpeed(audio: Float32Array, rate: number, speed: number): Float32Array {
  if (Math.abs(speed - 1) < 0.02 || audio.length === 0) return audio;
  return timeStretch(audio, rate, 1 / Math.min(2, Math.max(0.5, speed)));
}

/* ------------------------------------------------------------------ */
/* Voice resolution                                                    */
/* ------------------------------------------------------------------ */

export interface ResolvedVoice {
  engine: EngineName;
  spec: string | BlendComponent[] | VoiceRow;
  label: string;
}

/**
 * Accepts:
 *   "af_heart"                          built-in voice
 *   "blend_hype"                        preset blend
 *   "clone:vc_1a2b" / "vc_1a2b"         saved cloned or blended voice
 *   [{voice, weight}, …]                ad-hoc blend
 */
export function resolveVoice(voice: string | BlendComponent[]): ResolvedVoice {
  if (Array.isArray(voice)) {
    return {
      engine: "kokoro",
      spec: voice,
      label: `Blend (${voice.map((c) => c.voice).join(" + ")})`,
    };
  }

  const id = voice.startsWith("clone:") ? voice.slice(6) : voice;

  const saved = getVoice(id);
  if (saved) {
    if (saved.kind === "blend") {
      return { engine: "kokoro", spec: saved.blend as BlendComponent[], label: saved.name };
    }
    if (!saved.profile_file) {
      throw new Error(`The voice profile for "${saved.name}" is missing. Re-clone it.`);
    }
    return { engine: "clone", spec: saved, label: saved.name };
  }

  const preset = PRESET_BLENDS.find((p) => p.id === id);
  if (preset) return { engine: "kokoro", spec: preset.components, label: preset.name };

  return { engine: "kokoro", spec: id, label: id };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

async function renderChunk(
  chunk: Chunk,
  request: SynthesisRequest,
  resolved: ResolvedVoice,
  profileCache: Map<string, clone.SpeakerProfile>,
  signal?: AbortSignal,
): Promise<Float32Array> {
  let spec = resolved.spec;

  // Dialogue scripts can point each speaker at a different voice.
  if (request.multiSpeaker && chunk.speaker) {
    const override = request.speakerVoices[chunk.speaker];
    if (override) {
      const sub = resolveVoice(override);
      if (sub.engine === resolved.engine) spec = sub.spec;
      else {
        console.warn(
          `[pipeline] speaker "${chunk.speaker}" uses the ${sub.engine} engine but this ` +
          `job runs on ${resolved.engine}; using the job voice for that line.`,
        );
      }
    }
  }

  if (resolved.engine === "kokoro") {
    return kokoro.synthesize(chunk.text, spec as string | BlendComponent[], {
      speed: request.speed,
      lang: request.lang,
      dtype: getSettings().kokoroDtype,
    });
  }

  const record = spec as VoiceRow;
  let profile = profileCache.get(record.id);
  if (!profile) {
    profile = await clone.loadProfile(record.profile_file!);
    profileCache.set(record.id, profile);
  }

  const audio = await clone.synthesize(chunk.text, profile, {
    precision: getSettings().clonePrecision,
    repetitionPenalty: request.repetitionPenalty,
    temperature: request.temperature,
    topP: request.topP,
    seed: request.seed,
    signal,
  });
  // Chatterbox has no speed input, so tempo is applied afterwards.
  return applySpeed(audio, clone.SAMPLE_RATE, request.speed);
}

export async function synthesize(
  input: Partial<SynthesisRequest>,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<SynthesisResult> {
  const request: SynthesisRequest = { ...DEFAULTS, ...input };
  const started = Date.now();
  const report = (p: number, s: string) => onProgress?.(Math.max(0, Math.min(100, p)), s);

  report(2, "Preparing text");
  const script = prepare(request.text, {
    maxChars: request.maxChunkChars,
    paragraphPause: request.paragraphPause,
    multiSpeaker: request.multiSpeaker,
  });
  if (!script.spoken.length) {
    throw new Error("There is nothing to speak because the text is empty after cleanup.");
  }

  const resolved = resolveVoice(request.voice);
  report(5, resolved.engine === "clone" ? "Loading the cloning model" : "Loading Kokoro");

  const rate = resolved.engine === "clone" ? clone.SAMPLE_RATE : kokoro.SAMPLE_RATE;
  const segments: Float32Array[] = [];
  const cues: A.Cue[] = [];
  let cursor = 0;

  await withEngine(resolved.engine, async () => {
    const profileCache = new Map<string, clone.SpeakerProfile>();
    let done = 0;

    for (const chunk of script.chunks) {
      if (signal?.aborted) throw new Error("Cancelled");

      if (!chunk.text.trim()) {
        if (chunk.pauseAfter > 0) {
          segments.push(A.silence(chunk.pauseAfter, rate));
          cursor += chunk.pauseAfter;
        }
        continue;
      }

      report(8 + (done / script.spoken.length) * 82,
             `Speaking part ${done + 1} of ${script.spoken.length}`);

      let piece = await renderChunk(chunk, request, resolved, profileCache, signal);
      done++;
      if (!piece.length) continue;

      piece = A.fade(A.trimSilence(piece, rate, -48, 25), rate, 6);

      const start = cursor;
      cursor += piece.length / rate;
      segments.push(piece);
      cues.push({ start, end: cursor, text: chunk.text });

      const gap = chunk.pauseAfter || request.sentencePause;
      if (gap > 0) {
        segments.push(A.silence(gap, rate));
        cursor += gap;
      }
    }
  });

  if (signal?.aborted) throw new Error("Cancelled");

  report(92, "Assembling");
  let master = A.concat(segments);

  if (Math.abs(request.pitch) > 0.01) {
    report(94, "Adjusting pitch");
    master = pitchShift(master, rate, request.pitch);
  }

  report(96, "Mastering");
  master = request.loudness !== null
    ? A.normaliseLoudness(master, rate, request.loudness)
    : A.normalisePeak(master);

  const elapsed = (Date.now() - started) / 1000;
  const duration = master.length / rate;

  return {
    audio: master,
    sampleRate: rate,
    duration,
    cues,
    chunkCount: script.spoken.length,
    elapsed,
    realtimeFactor: duration > 0.01 ? elapsed / duration : 0,
    provenance: {
      engine: resolved.engine,
      voice: resolved.label,
      model: resolved.engine === "kokoro" ? "Kokoro-82M" : "Chatterbox-Turbo",
      generated: new Date().toISOString(),
      synthetic: true,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Persisting                                                          */
/* ------------------------------------------------------------------ */

export async function saveResult(
  result: SynthesisResult,
  request: Pick<SynthesisRequest, "format" | "bitrate" | "subtitles">,
  jobId: string,
) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const encoded = await A.encode(result.audio, result.sampleRate, request.format, request.bitrate);

  const file = path.join(OUTPUT_DIR, `${jobId}.${encoded.format}`);
  await fs.writeFile(file, encoded.data);

  if (request.subtitles && result.cues.length) {
    await fs.writeFile(path.join(OUTPUT_DIR, `${jobId}.srt`), A.toSrt(result.cues), "utf-8");
    await fs.writeFile(path.join(OUTPUT_DIR, `${jobId}.vtt`), A.toVtt(result.cues), "utf-8");
  }

  return {
    output_file: file,
    output_format: encoded.format,
    bytes: encoded.data.length,
    duration: result.duration,
    has_subs: request.subtitles && result.cues.length ? 1 : 0,
  };
}
