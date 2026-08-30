/**
 * Kokoro-82M engine for Node.
 *
 * Rather than using kokoro-js's `generate()`, this drives the model directly.
 * Two reasons:
 *
 *   1. kokoro-js only whitelists 28 English voices. The model itself is
 *      language-agnostic and the style files for all 54 exist on the Hub.
 *   2. `generate()` takes a voice *name*, so there is no way to feed it a
 *      blended style vector. Going direct means any weighted mix of voices
 *      is a usable speaker. That is where the "more voices" comes from.
 *
 * Style data layout: 510 rows x 256 floats. The row is chosen by token
 * count, so a blend must be averaged across the whole array, not one row.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { CATALOG, LANGUAGES, PRESET_BLENDS, type BlendComponent } from "@/lib/catalog";
import { phonemize } from "./phonemize";
import { MODELS_DIR } from "@/lib/paths";

export const SAMPLE_RATE = 24000;
const STYLE_DIM = 256;
const MAX_STYLE_ROWS = 510;
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main/voices`;

export type Dtype = "fp32" | "fp16" | "q8" | "q4";
export type VoiceSpec = string | BlendComponent[];

interface Loaded {
  model: any;
  tokenizer: any;
  dtype: Dtype;
}

let loaded: Loaded | null = null;
let loading: Promise<Loaded> | null = null;
const styleCache = new Map<string, Float32Array>();

export function isLoaded() {
  return loaded !== null;
}

export function loadedDtype() {
  return loaded?.dtype ?? null;
}

/** Drop the model so Node can return the memory to the OS. */
export function unload() {
  loaded = null;
  loading = null;
}

export async function load(dtype: Dtype = "q8"): Promise<Loaded> {
  if (loaded && loaded.dtype === dtype) return loaded;
  if (loaded && loaded.dtype !== dtype) unload();
  if (loading) return loading;

  loading = (async () => {
    const { StyleTextToSpeech2Model, AutoTokenizer, env } =
      await import("@huggingface/transformers");

    // Keep downloaded weights inside the project so the app stays portable.
    env.cacheDir = path.join(MODELS_DIR, "hf");

    const [model, tokenizer] = await Promise.all([
      StyleTextToSpeech2Model.from_pretrained(MODEL_ID, { dtype, device: "cpu" }),
      AutoTokenizer.from_pretrained(MODEL_ID),
    ]);

    loaded = { model, tokenizer, dtype };
    loading = null;
    return loaded;
  })();

  try {
    return await loading;
  } catch (err) {
    loading = null;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Voice style data                                                    */
/* ------------------------------------------------------------------ */

/** Fetch one voice's style array, caching it on disk after the first use. */
async function loadStyle(voiceId: string): Promise<Float32Array> {
  const cached = styleCache.get(voiceId);
  if (cached) return cached;

  const file = path.join(MODELS_DIR, "voices", `${voiceId}.bin`);

  let buffer: ArrayBuffer;
  try {
    const disk = await fs.readFile(file);
    buffer = disk.buffer.slice(disk.byteOffset, disk.byteOffset + disk.byteLength) as ArrayBuffer;
  } catch {
    const res = await fetch(`${VOICE_BASE}/${voiceId}.bin`);
    if (!res.ok) {
      throw new Error(
        `Could not download the voice "${voiceId}" (${res.status}). Check your connection.`,
      );
    }
    buffer = await res.arrayBuffer();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(buffer));
  }

  const data = new Float32Array(buffer);
  const expected = MAX_STYLE_ROWS * STYLE_DIM;
  if (data.length < expected) {
    throw new Error(
      `Voice file for "${voiceId}" is ${data.length} floats, expected ${expected}. ` +
      `Delete data/models/voices/${voiceId}.bin and try again.`,
    );
  }

  styleCache.set(voiceId, data);
  return data;
}

const VALID_IDS = new Set(CATALOG.map((v) => v.id));

/** Resolve a voice id, preset id, or blend spec into one style array. */
export async function resolveStyle(spec: VoiceSpec): Promise<Float32Array> {
  if (typeof spec === "string") {
    if (VALID_IDS.has(spec)) return loadStyle(spec);
    const preset = PRESET_BLENDS.find((p) => p.id === spec);
    if (preset) return resolveStyle(preset.components);
    throw new Error(`Unknown voice: ${spec}`);
  }

  if (!spec.length) throw new Error("A blend needs at least one voice.");

  const total = spec.reduce((sum, c) => sum + Math.max(0, c.weight ?? 1), 0);
  if (total <= 0) throw new Error("Blend weights must add up to more than zero.");

  const mixed = new Float32Array(MAX_STYLE_ROWS * STYLE_DIM);
  for (const component of spec) {
    if (!VALID_IDS.has(component.voice)) {
      throw new Error(`Unknown voice in blend: ${component.voice}`);
    }
    const weight = Math.max(0, component.weight ?? 1) / total;
    const style = await loadStyle(component.voice);
    for (let i = 0; i < mixed.length; i++) mixed[i] += style[i] * weight;
  }
  return mixed;
}

/** eSpeak language for a voice spec; a blend follows its first component. */
export function espeakFor(spec: VoiceSpec, override?: string | null): string {
  if (override) return override;
  const id = typeof spec === "string" ? spec : spec[0]?.voice ?? "af_heart";
  const preset = typeof spec === "string" ? PRESET_BLENDS.find((p) => p.id === spec) : null;
  const resolved = preset ? preset.components[0].voice : id;
  return LANGUAGES[resolved[0]]?.espeak ?? "en-us";
}

/* ------------------------------------------------------------------ */
/* Synthesis                                                           */
/* ------------------------------------------------------------------ */

export interface SynthesizeOptions {
  speed?: number;
  lang?: string | null;
  dtype?: Dtype;
}

/**
 * Render one chunk of text. Returns mono float32 at 24 kHz.
 *
 * Text longer than the model's 510-phoneme window is truncated by the
 * tokenizer, so callers must chunk first. See lib/text/chunker.
 */
export async function synthesize(
  text: string,
  voice: VoiceSpec,
  { speed = 1, lang = null, dtype = "q8" }: SynthesizeOptions = {},
): Promise<Float32Array> {
  if (!text.trim()) return new Float32Array(0);

  const { model, tokenizer } = await load(dtype);
  const { Tensor } = await import("@huggingface/transformers");

  const phonemes = await phonemize(text, espeakFor(voice, lang));
  if (!phonemes) return new Float32Array(0);

  const { input_ids } = tokenizer(phonemes, { truncation: true });

  // The style row is selected by token count (minus the two boundary tokens).
  const tokenCount = Math.min(Math.max(Number(input_ids.dims.at(-1)) - 2, 0), MAX_STYLE_ROWS - 1);
  const style = await resolveStyle(voice);
  const offset = tokenCount * STYLE_DIM;
  const styleRow = style.slice(offset, offset + STYLE_DIM);

  const { waveform } = await model({
    input_ids,
    style: new Tensor("float32", styleRow, [1, STYLE_DIM]),
    speed: new Tensor("float32", [Math.min(2, Math.max(0.5, speed))], [1]),
  });

  return new Float32Array(waveform.data as Float32Array);
}
