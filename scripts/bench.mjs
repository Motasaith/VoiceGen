/**
 * Steady-state speed benchmark. The first inference includes ONNX graph
 * warm-up, so it is reported separately from the ones that follow.
 *
 *   node scripts/bench.mjs [dtype]
 */
import path from "node:path";
import fs from "node:fs/promises";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODELS_DIR = path.join(process.cwd(), "data", "models");
const STYLE_DIM = 256;
const dtype = process.argv[2] ?? "q8";

const SENTENCES = [
  "Most people think the hardest part of starting is finding the right idea.",
  "It isn't. The hardest part is finishing the first boring version of the thing.",
  "Pick something small enough that you can actually finish it this week.",
  "Ship it before you are proud of it, then let real feedback tell you what to build.",
  "That loop beats a year of planning every single time, without exception.",
];

const { StyleTextToSpeech2Model, AutoTokenizer, Tensor, env } =
  await import("@huggingface/transformers");
env.cacheDir = path.join(MODELS_DIR, "hf");

console.log(`dtype: ${dtype}`);
const t0 = Date.now();
const [model, tokenizer] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(MODEL_ID, { dtype, device: "cpu" }),
  AutoTokenizer.from_pretrained(MODEL_ID),
]);
console.log(`load: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const styleBuf = await fs.readFile(path.join(MODELS_DIR, "voices", "af_heart.bin"));
const style = new Float32Array(
  styleBuf.buffer.slice(styleBuf.byteOffset, styleBuf.byteOffset + styleBuf.byteLength),
);

const { phonemize } = await import("phonemizer");

let totalAudio = 0;
let totalTime = 0;

for (let i = 0; i < SENTENCES.length; i++) {
  const phonemes = (await phonemize(SENTENCES[i], "en-us")).join(" ");
  const { input_ids } = tokenizer(phonemes, { truncation: true });
  const n = Math.min(Math.max(Number(input_ids.dims.at(-1)) - 2, 0), 509);
  const row = style.slice(n * STYLE_DIM, n * STYLE_DIM + STYLE_DIM);

  const t = Date.now();
  const { waveform } = await model({
    input_ids,
    style: new Tensor("float32", row, [1, STYLE_DIM]),
    speed: new Tensor("float32", [1], [1]),
  });
  const elapsed = (Date.now() - t) / 1000;
  const seconds = waveform.data.length / 24000;

  const label = i === 0 ? "warm-up" : `run ${i}`;
  console.log(
    `  ${label.padEnd(8)} ${seconds.toFixed(2)}s audio in ${elapsed.toFixed(2)}s  ` +
    `RTF ${(elapsed / seconds).toFixed(2)}`,
  );

  if (i > 0) { totalAudio += seconds; totalTime += elapsed; }
}

const rtf = totalTime / totalAudio;
console.log(
  `\nsteady state: RTF ${rtf.toFixed(2)} ` +
  `(${rtf < 1 ? `${(1 / rtf).toFixed(1)}x faster than real time` : `${rtf.toFixed(1)}x slower than real time`})`,
);
console.log(`a 10-minute script would take about ${((600 * rtf) / 60).toFixed(1)} minutes.`);
