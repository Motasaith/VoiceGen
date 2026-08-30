/**
 * Voice cloning with Chatterbox-Turbo (Resemble AI, MIT) on onnxruntime-node.
 *
 * Four graphs cooperate:
 *   speech_encoder      reference audio -> speaker conditioning
 *   embed_tokens        text ids        -> embeddings
 *   language_model      embeddings      -> discrete speech tokens (autoregressive, KV-cached)
 *   conditional_decoder speech tokens   -> 24 kHz waveform (single step)
 *
 * Two things make this workable on a low-RAM laptop:
 *
 *   1. The speech encoder runs ONCE per speaker, at enrolment. Its outputs are
 *      cached to disk as a voice profile, so generation never loads it again.
 *   2. Sessions are created lazily and released individually.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { MODELS_DIR } from "@/lib/paths";

export const SAMPLE_RATE = 24000;
const START_SPEECH_TOKEN = 6561;
const STOP_SPEECH_TOKEN = 6562;
const SILENCE_TOKEN = 4299;
const NUM_KV_HEADS = 16;
const HEAD_DIM = 64;

const REPO = "ResembleAI/chatterbox-turbo-ONNX";
const COMPONENTS = ["speech_encoder", "embed_tokens", "language_model", "conditional_decoder"] as const;
type Component = (typeof COMPONENTS)[number];

export type ClonePrecision = "q8" | "q4" | "fp16" | "fp32";

/** Mirrors the naming scheme used by the upstream model card. */
function fileFor(component: Component, precision: ClonePrecision): string {
  const suffix = precision === "fp32" ? "" : precision === "q8" ? "_quantized" : `_${precision}`;
  return `${component}${suffix}.onnx`;
}

export function cloneDir(precision: ClonePrecision): string {
  return path.join(MODELS_DIR, "chatterbox", precision);
}

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function isInstalled(precision: ClonePrecision): Promise<boolean> {
  const dir = cloneDir(precision);
  if (!(await exists(path.join(dir, "tokenizer.json")))) return false;
  for (const c of COMPONENTS) {
    if (!(await exists(path.join(dir, fileFor(c, precision))))) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

export interface DownloadProgress {
  label: string;
  received: number;
  total: number;
}

async function download(url: string, dest: string, onProgress?: (p: DownloadProgress) => void, label = "") {
  if (await exists(dest)) return true;
  const res = await fetch(url);
  if (!res.ok) return false;

  const total = Number(res.headers.get("content-length") ?? 0);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body?.getReader();
  if (!reader) return false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.({ label, received, total });
  }

  // Write to a temp name first so a crash cannot leave a half file behind.
  const tmp = `${dest}.part`;
  await fs.writeFile(tmp, Buffer.concat(chunks));
  await fs.rename(tmp, dest);
  return true;
}

export async function install(
  precision: ClonePrecision,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const dir = cloneDir(precision);
  const base = `https://huggingface.co/${REPO}/resolve/main`;

  for (const component of COMPONENTS) {
    const name = fileFor(component, precision);
    const ok = await download(`${base}/onnx/${name}`, path.join(dir, name), onProgress, component);
    if (!ok) throw new Error(`Could not download ${name}. Check your connection and retry.`);

    // Large graphs keep weights in a sibling ".onnx_data" file; small ones do
    // not, so a 404 here is expected and harmless.
    await download(`${base}/onnx/${name}_data`, path.join(dir, `${name}_data`), onProgress, `${component} weights`)
      .catch(() => false);
  }

  const tokenizer = await download(`${base}/tokenizer.json`, path.join(dir, "tokenizer.json"), onProgress, "tokenizer");
  if (!tokenizer) throw new Error("Could not download the tokenizer.");
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

const sessions = new Map<Component, any>();
let tokenizer: any = null;
let activePrecision: ClonePrecision | null = null;

export function isLoaded() {
  return sessions.size > 0;
}

export function unload() {
  sessions.clear();
  tokenizer = null;
  activePrecision = null;
}

async function getSession(component: Component, precision: ClonePrecision) {
  if (activePrecision && activePrecision !== precision) unload();
  activePrecision = precision;

  const existing = sessions.get(component);
  if (existing) return existing;

  if (!(await isInstalled(precision))) {
    throw new Error("The cloning model is not installed yet. Install it from Settings.");
  }

  const ort = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(
    path.join(cloneDir(precision), fileFor(component, precision)),
    {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
      // Holding the arena would keep peak allocation for the process
      // lifetime, which is exactly what we cannot afford here.
      enableCpuMemArena: false,
      enableMemPattern: false,
    },
  );
  sessions.set(component, session);
  return session;
}

async function getTokenizer(precision: ClonePrecision) {
  if (tokenizer) return tokenizer;
  const { PreTrainedTokenizer } = await import("@huggingface/transformers");
  const raw = await fs.readFile(path.join(cloneDir(precision), "tokenizer.json"), "utf-8");
  tokenizer = new PreTrainedTokenizer(JSON.parse(raw), {});
  return tokenizer;
}

/* ------------------------------------------------------------------ */
/* Speaker profiles                                                    */
/* ------------------------------------------------------------------ */

export interface SpeakerProfile {
  condEmb: { data: Float32Array; dims: number[] };
  promptToken: { data: BigInt64Array; dims: number[] };
  speakerEmbeddings: { data: Float32Array; dims: number[] };
  speakerFeatures: { data: Float32Array; dims: number[] };
}

/** Profiles are plain JSON + base64 so they survive a Node upgrade. */
function serialise(profile: SpeakerProfile) {
  const enc = (t: { data: Float32Array | BigInt64Array; dims: number[] }) => ({
    dims: t.dims,
    kind: t.data instanceof Float32Array ? "f32" : "i64",
    b64: Buffer.from(
      t.data instanceof Float32Array
        ? new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength)
        : new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength),
    ).toString("base64"),
  });
  return JSON.stringify({
    condEmb: enc(profile.condEmb),
    promptToken: enc(profile.promptToken),
    speakerEmbeddings: enc(profile.speakerEmbeddings),
    speakerFeatures: enc(profile.speakerFeatures),
  });
}

function deserialise(json: string): SpeakerProfile {
  const raw = JSON.parse(json);
  const dec = (t: any) => {
    const bytes = Buffer.from(t.b64, "base64");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return {
      dims: t.dims,
      data: t.kind === "f32"
        ? new Float32Array(copy.buffer)
        : new BigInt64Array(copy.buffer),
    };
  };
  return {
    condEmb: dec(raw.condEmb) as any,
    promptToken: dec(raw.promptToken) as any,
    speakerEmbeddings: dec(raw.speakerEmbeddings) as any,
    speakerFeatures: dec(raw.speakerFeatures) as any,
  };
}

export async function saveProfile(profile: SpeakerProfile, file: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, serialise(profile), "utf-8");
}

export async function loadProfile(file: string): Promise<SpeakerProfile> {
  return deserialise(await fs.readFile(file, "utf-8"));
}

/** Run the speech encoder once and cache the conditioning it produces. */
export async function enrol(
  reference: Float32Array,
  precision: ClonePrecision = "q8",
): Promise<SpeakerProfile> {
  if (reference.length < SAMPLE_RATE) {
    throw new Error("The reference clip must be at least one second of audio.");
  }

  const ort = await import("onnxruntime-node");
  const encoder = await getSession("speech_encoder", precision);

  const outputs = await encoder.run({
    audio_values: new ort.Tensor("float32", reference, [1, reference.length]),
  });

  const names: string[] = encoder.outputNames;
  const pick = (i: number) => outputs[names[i]];
  const profile: SpeakerProfile = {
    condEmb: { data: pick(0).data as Float32Array, dims: pick(0).dims as number[] },
    promptToken: { data: pick(1).data as BigInt64Array, dims: pick(1).dims as number[] },
    speakerEmbeddings: { data: pick(2).data as Float32Array, dims: pick(2).dims as number[] },
    speakerFeatures: { data: pick(3).data as Float32Array, dims: pick(3).dims as number[] },
  };

  // Free ~45 MB right away; generation never needs the encoder.
  sessions.delete("speech_encoder");
  return profile;
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

function applyRepetitionPenalty(logits: Float32Array, generated: number[], penalty: number) {
  if (penalty <= 1) return;
  for (const token of generated) {
    const v = logits[token];
    logits[token] = v < 0 ? v * penalty : v / penalty;
  }
}

function sampleToken(
  logits: Float32Array,
  temperature: number,
  topP: number,
  rng: () => number,
): number {
  if (temperature <= 0.01) {
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    return best;
  }

  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]);

  const probs = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    probs[i] = Math.exp((logits[i] - max) / temperature);
    sum += probs[i];
  }
  for (let i = 0; i < probs.length; i++) probs[i] /= sum;

  const order = Array.from(probs.keys()).sort((a, b) => probs[b] - probs[a]);
  let cumulative = 0;
  const keep: number[] = [];
  for (const idx of order) {
    keep.push(idx);
    cumulative += probs[idx];
    if (cumulative >= topP) break;
  }

  let mass = 0;
  for (const idx of keep) mass += probs[idx];
  let r = rng() * mass;
  for (const idx of keep) {
    r -= probs[idx];
    if (r <= 0) return idx;
  }
  return keep[keep.length - 1];
}

/** Deterministic PRNG so a seed reproduces a take exactly. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CloneOptions {
  precision?: ClonePrecision;
  maxNewTokens?: number;
  repetitionPenalty?: number;
  temperature?: number;
  topP?: number;
  seed?: number | null;
  signal?: AbortSignal;
}

export async function synthesize(
  text: string,
  profile: SpeakerProfile,
  {
    precision = "q8",
    maxNewTokens = 1000,
    repetitionPenalty = 1.2,
    temperature = 0,
    topP = 0.95,
    seed = null,
    signal,
  }: CloneOptions = {},
): Promise<Float32Array> {
  if (!text.trim()) return new Float32Array(0);

  const ort = await import("onnxruntime-node");
  const tok = await getTokenizer(precision);
  const embed = await getSession("embed_tokens", precision);
  const lm = await getSession("language_model", precision);
  const decoder = await getSession("conditional_decoder", precision);

  const rng = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));

  const encoded = tok(text);
  const idsRaw = Array.from(encoded.input_ids.data as BigInt64Array, (v) => BigInt(v));
  let inputIds = new ort.Tensor("int64", BigInt64Array.from(idsRaw), [1, idsRaw.length]);

  // First step: prepend the speaker conditioning to the text embeddings.
  const embedded = await embed.run({ input_ids: inputIds });
  const textEmb = embedded[embed.outputNames[0]];
  const hidden = textEmb.dims[2] as number;

  const condLen = profile.condEmb.dims[1];
  const textLen = textEmb.dims[1] as number;
  const combined = new Float32Array((condLen + textLen) * hidden);
  combined.set(profile.condEmb.data, 0);
  combined.set(textEmb.data as Float32Array, condLen * hidden);

  let inputsEmbeds = new ort.Tensor("float32", combined, [1, condLen + textLen, hidden]);
  let seqLen = condLen + textLen;

  // KV cache: input names look like "past_key_values.N.key", and the
  // corresponding outputs come back after logits in the same order.
  const pastNames: string[] = lm.inputNames.filter((n: string) => n.includes("past_key_values"));
  const presentNames: string[] = lm.outputNames.filter((n: string) => n !== lm.outputNames[0]);

  const past: Record<string, any> = {};
  for (const name of pastNames) {
    past[name] = new ort.Tensor("float32", new Float32Array(0), [1, NUM_KV_HEADS, 0, HEAD_DIM]);
  }

  let attentionMask = new ort.Tensor("int64", BigInt64Array.from({ length: seqLen }, () => 1n), [1, seqLen]);
  let positionIds = new ort.Tensor("int64", BigInt64Array.from({ length: seqLen }, (_, i) => BigInt(i)), [1, seqLen]);

  const generated: number[] = [];
  let hitStop = false;

  for (let step = 0; step < maxNewTokens; step++) {
    if (signal?.aborted) throw new Error("Cancelled");

    const out = await lm.run({
      inputs_embeds: inputsEmbeds,
      attention_mask: attentionMask,
      position_ids: positionIds,
      ...past,
    });

    const logitsTensor = out[lm.outputNames[0]];
    const vocab = logitsTensor.dims[2] as number;
    const lastOffset = ((logitsTensor.dims[1] as number) - 1) * vocab;
    const logits = (logitsTensor.data as Float32Array).slice(lastOffset, lastOffset + vocab);

    applyRepetitionPenalty(logits, [START_SPEECH_TOKEN, ...generated], repetitionPenalty);
    const next = sampleToken(logits, temperature, topP, rng);

    if (next === STOP_SPEECH_TOKEN) { hitStop = true; break; }
    generated.push(next);

    // Carry the cache forward and advance one position.
    for (let i = 0; i < pastNames.length; i++) past[pastNames[i]] = out[presentNames[i]];

    seqLen += 1;
    attentionMask = new ort.Tensor("int64", BigInt64Array.from({ length: seqLen }, () => 1n), [1, seqLen]);
    positionIds = new ort.Tensor("int64", BigInt64Array.from([BigInt(seqLen - 1)]), [1, 1]);

    inputIds = new ort.Tensor("int64", BigInt64Array.from([BigInt(next)]), [1, 1]);
    const nextEmb = await embed.run({ input_ids: inputIds });
    inputsEmbeds = nextEmb[embed.outputNames[0]];
  }

  if (!hitStop) {
    console.warn(`[clone] hit the ${maxNewTokens}-token cap without a stop token; chunk may be clipped.`);
  }
  if (!generated.length) return new Float32Array(0);

  // prompt tokens + generated speech + a little trailing silence
  const prompt = Array.from(profile.promptToken.data, Number);
  const tokens = [...prompt, ...generated, SILENCE_TOKEN, SILENCE_TOKEN, SILENCE_TOKEN];

  const decoded = await decoder.run({
    speech_tokens: new ort.Tensor("int64", BigInt64Array.from(tokens.map(BigInt)), [1, tokens.length]),
    speaker_embeddings: new ort.Tensor("float32", profile.speakerEmbeddings.data, profile.speakerEmbeddings.dims),
    speaker_features: new ort.Tensor("float32", profile.speakerFeatures.data, profile.speakerFeatures.dims),
  });

  return new Float32Array(decoded[decoder.outputNames[0]].data as Float32Array);
}
