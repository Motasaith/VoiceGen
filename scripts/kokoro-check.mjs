/**
 * Standalone check of the Kokoro path: model load, phonemisation, voice
 * style fetch, blending, and a real render written to disk.
 *
 *   node scripts/kokoro-check.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main/voices`;
const MODELS_DIR = path.join(process.cwd(), "data", "models");
const OUT_DIR = path.join(process.cwd(), "data", "outputs");
const STYLE_DIM = 256;

function encodeWav(audio, rate) {
  const buf = Buffer.alloc(44 + audio.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + audio.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(audio.length * 2, 40);
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

async function loadStyle(id) {
  const file = path.join(MODELS_DIR, "voices", `${id}.bin`);
  try {
    const disk = await fs.readFile(file);
    return new Float32Array(disk.buffer.slice(disk.byteOffset, disk.byteOffset + disk.byteLength));
  } catch {
    const res = await fetch(`${VOICE_BASE}/${id}.bin`);
    if (!res.ok) throw new Error(`voice ${id}: HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(ab));
    return new Float32Array(ab);
  }
}

const t0 = Date.now();
console.log("1. loading transformers + model (downloads ~90 MB on first run)…");

const { StyleTextToSpeech2Model, AutoTokenizer, Tensor, env } =
  await import("@huggingface/transformers");
env.cacheDir = path.join(MODELS_DIR, "hf");

const [model, tokenizer] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(MODEL_ID, { dtype: "q8", device: "cpu" }),
  AutoTokenizer.from_pretrained(MODEL_ID),
]);
console.log(`   model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

console.log("2. phonemising…");
const { phonemize } = await import("phonemizer");
const text = "The quick brown fox jumps over the lazy dog. Voice generation is working.";
const phonemes = (await phonemize(text, "en-us")).join(" ");
console.log(`   ${phonemes.slice(0, 70)}…`);

console.log("3. fetching voice styles…");
const heart = await loadStyle("af_heart");
const nova = await loadStyle("af_nova");
console.log(`   af_heart: ${heart.length} floats (expect ${510 * STYLE_DIM})`);

console.log("4. rendering with a single voice…");
const { input_ids } = tokenizer(phonemes, { truncation: true });
const tokenCount = Math.min(Math.max(Number(input_ids.dims.at(-1)) - 2, 0), 509);
const row = heart.slice(tokenCount * STYLE_DIM, tokenCount * STYLE_DIM + STYLE_DIM);

const t1 = Date.now();
const { waveform } = await model({
  input_ids,
  style: new Tensor("float32", row, [1, STYLE_DIM]),
  speed: new Tensor("float32", [1], [1]),
});
const audio = new Float32Array(waveform.data);
const seconds = audio.length / 24000;
const elapsed = (Date.now() - t1) / 1000;
console.log(`   ${seconds.toFixed(2)}s of audio in ${elapsed.toFixed(2)}s (RTF ${(elapsed / seconds).toFixed(2)})`);

console.log("5. rendering a 60/40 blend of two voices…");
const blend = new Float32Array(heart.length);
for (let i = 0; i < blend.length; i++) blend[i] = heart[i] * 0.6 + nova[i] * 0.4;
const blendRow = blend.slice(tokenCount * STYLE_DIM, tokenCount * STYLE_DIM + STYLE_DIM);
const out2 = await model({
  input_ids,
  style: new Tensor("float32", blendRow, [1, STYLE_DIM]),
  speed: new Tensor("float32", [1], [1]),
});
const blended = new Float32Array(out2.waveform.data);

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, "_check_single.wav"), encodeWav(audio, 24000));
await fs.writeFile(path.join(OUT_DIR, "_check_blend.wav"), encodeWav(blended, 24000));

let peak = 0;
for (const v of audio) peak = Math.max(peak, Math.abs(v));
console.log(`   blend rendered: ${(blended.length / 24000).toFixed(2)}s`);
console.log(`\n   peak level: ${peak.toFixed(3)} (0 would mean silence)`);
console.log(`   wrote data/outputs/_check_single.wav and _check_blend.wav`);
console.log(`\nALL GOOD in ${((Date.now() - t0) / 1000).toFixed(1)}s total.`);
