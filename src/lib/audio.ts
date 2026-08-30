/**
 * Audio assembly, mastering and encoding.
 *
 * Everything works on mono Float32Array in [-1, 1]. No native dependencies:
 * resampling, loudness measurement and WAV muxing are all implemented here,
 * which keeps `npm install` free of build tools.
 */

export const TARGET_PEAK = 0.97;

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export function concat(segments: Float32Array[]): Float32Array {
  const total = segments.reduce((n, s) => n + s.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const s of segments) {
    out.set(s, offset);
    offset += s.length;
  }
  return out;
}

export function silence(seconds: number, rate: number): Float32Array {
  return new Float32Array(Math.max(0, Math.round(seconds * rate)));
}

/** Short fades at both ends remove the click at chunk boundaries. */
export function fade(audio: Float32Array, rate: number, ms = 6): Float32Array {
  const n = Math.min(Math.floor((rate * ms) / 1000), Math.floor(audio.length / 2));
  if (n <= 1) return audio;
  const out = Float32Array.from(audio);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

/** Windowed-sinc resampler. Quality matters here: it runs on the master. */
export function resample(audio: Float32Array, from: number, to: number): Float32Array {
  if (from === to || audio.length === 0) return audio;

  const ratio = to / from;
  const outLength = Math.floor(audio.length * ratio);
  const out = new Float32Array(outLength);
  // Low-pass at the lower of the two rates to avoid aliasing when downsampling.
  const cutoff = Math.min(1, ratio);
  const width = 8;

  for (let i = 0; i < outLength; i++) {
    const center = i / ratio;
    const left = Math.ceil(center - width);
    const right = Math.floor(center + width);
    let sum = 0;
    let norm = 0;

    for (let j = left; j <= right; j++) {
      if (j < 0 || j >= audio.length) continue;
      const x = center - j;
      // sinc * Blackman window
      const sinc = x === 0 ? cutoff : (Math.sin(Math.PI * cutoff * x) / (Math.PI * x));
      const t = (x + width) / (2 * width);
      const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * t) + 0.08 * Math.cos(4 * Math.PI * t);
      const k = sinc * w;
      sum += audio[j] * k;
      norm += k;
    }
    out[i] = norm > 1e-9 ? sum / norm : 0;
  }
  return out;
}

export function trimSilence(
  audio: Float32Array,
  rate: number,
  thresholdDb = -45,
  keepMs = 40,
): Float32Array {
  if (audio.length === 0) return audio;
  const win = Math.max(1, Math.floor(rate * 0.01));
  const frames = Math.floor(audio.length / win);
  if (frames < 2) return audio;

  let first = -1;
  let last = -1;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * win; i < (f + 1) * win; i++) sum += audio[i] * audio[i];
    const db = 10 * Math.log10(sum / win + 1e-12);
    if (db > thresholdDb) {
      if (first === -1) first = f;
      last = f;
    }
  }
  if (first === -1) return audio;

  const keep = Math.floor((rate * keepMs) / 1000);
  const start = Math.max(0, first * win - keep);
  const end = Math.min(audio.length, (last + 1) * win + keep);
  return audio.slice(start, end);
}

export function normalisePeak(audio: Float32Array, peak = TARGET_PEAK): Float32Array {
  let max = 0;
  for (let i = 0; i < audio.length; i++) max = Math.max(max, Math.abs(audio[i]));
  if (max < 1e-6) return audio;
  const gain = peak / max;
  const out = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) out[i] = audio[i] * gain;
  return out;
}

/* ------------------------------------------------------------------ */
/* Loudness (ITU-R BS.1770 integrated, mono)                           */
/* ------------------------------------------------------------------ */

/** K-weighting: a high-shelf then a high-pass, per BS.1770. */
function kWeight(audio: Float32Array, rate: number): Float32Array {
  // Stage 1 - high shelf (+4 dB above ~1.5 kHz)
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const a0_ = 1 + K / Q + K * K;

  const b0 = (Vh + (Vb * K) / Q + K * K) / a0_;
  const b1 = (2 * (K * K - Vh)) / a0_;
  const b2 = (Vh - (Vb * K) / Q + K * K) / a0_;
  const a1 = (2 * (K * K - 1)) / a0_;
  const a2 = (1 - K / Q + K * K) / a0_;

  // Stage 2 - high pass at ~38 Hz
  const f0b = 38.13547087602444;
  const Qb = 0.5003270373238773;
  const Kb = Math.tan((Math.PI * f0b) / rate);
  const b0b = 1;
  const b1b = -2;
  const b2b = 1;
  const a1b = (2 * (Kb * Kb - 1)) / (1 + Kb / Qb + Kb * Kb);
  const a2b = (1 - Kb / Qb + Kb * Kb) / (1 + Kb / Qb + Kb * Kb);

  const out = new Float32Array(audio.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < audio.length; i++) {
    const x = audio[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }

  let u1 = 0, u2 = 0, v1 = 0, v2 = 0;
  for (let i = 0; i < out.length; i++) {
    const x = out[i];
    const y = b0b * x + b1b * u1 + b2b * u2 - a1b * v1 - a2b * v2;
    u2 = u1; u1 = x; v2 = v1; v1 = y;
    out[i] = y;
  }
  return out;
}

/** Integrated loudness in LUFS, with the BS.1770 relative gate. */
export function measureLoudness(audio: Float32Array, rate: number): number {
  if (audio.length < rate * 0.4) return -Infinity;

  const weighted = kWeight(audio, rate);
  const blockSize = Math.floor(rate * 0.4);      // 400 ms blocks
  const step = Math.floor(blockSize / 4);        // 75% overlap
  const loudnesses: number[] = [];

  for (let start = 0; start + blockSize <= weighted.length; start += step) {
    let sum = 0;
    for (let i = start; i < start + blockSize; i++) sum += weighted[i] * weighted[i];
    const mean = sum / blockSize;
    if (mean > 0) loudnesses.push(-0.691 + 10 * Math.log10(mean));
  }
  if (!loudnesses.length) return -Infinity;

  // Absolute gate at -70 LUFS, then a relative gate 10 dB below the mean.
  const gated = loudnesses.filter((l) => l > -70);
  if (!gated.length) return -Infinity;

  const meanPower = gated.reduce((s, l) => s + Math.pow(10, (l + 0.691) / 10), 0) / gated.length;
  const relative = -0.691 + 10 * Math.log10(meanPower) - 10;

  const final = loudnesses.filter((l) => l > -70 && l > relative);
  if (!final.length) return -Infinity;

  const finalPower = final.reduce((s, l) => s + Math.pow(10, (l + 0.691) / 10), 0) / final.length;
  return -0.691 + 10 * Math.log10(finalPower);
}

/**
 * Match a broadcast loudness target.
 *
 * -14 LUFS is what YouTube, Spotify and Facebook normalise to. Delivering at
 * that level means the platform will not turn your audio down or up, which
 * would lift the noise floor with it.
 */
export function normaliseLoudness(
  audio: Float32Array,
  rate: number,
  targetLufs = -14,
): Float32Array {
  const measured = measureLoudness(audio, rate);
  if (!Number.isFinite(measured)) return normalisePeak(audio);

  const gain = Math.pow(10, (targetLufs - measured) / 20);
  const out = new Float32Array(audio.length);
  let peak = 0;
  for (let i = 0; i < audio.length; i++) {
    out[i] = audio[i] * gain;
    peak = Math.max(peak, Math.abs(out[i]));
  }

  // Soft-limit whatever the gain pushed past full scale.
  if (peak > TARGET_PEAK) {
    const scale = 1.2 / peak;
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * scale) * TARGET_PEAK;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

export function encodeWav(audio: Float32Array, rate: number): Buffer {
  const buffer = Buffer.alloc(44 + audio.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + audio.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);              // PCM
  buffer.writeUInt16LE(1, 22);              // mono
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(audio.length * 2, 40);

  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    buffer.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

export interface Encoded {
  data: Buffer;
  format: "wav" | "mp3";
  mime: string;
  duration: number;
}

/** MP3 via lamejs when it is installed; WAV otherwise. */
export async function encode(
  audio: Float32Array,
  rate: number,
  format: "wav" | "mp3" = "mp3",
  bitrate = 192,
): Promise<Encoded> {
  const duration = audio.length / rate;

  if (format === "mp3") {
    try {
      const lame: any = await import("@breezystack/lamejs");
      const Mp3Encoder = lame.Mp3Encoder ?? lame.default?.Mp3Encoder;
      if (!Mp3Encoder) throw new Error("lamejs has no Mp3Encoder export");

      const encoder = new Mp3Encoder(1, rate, bitrate);
      const pcm = new Int16Array(audio.length);
      for (let i = 0; i < audio.length; i++) {
        const s = Math.max(-1, Math.min(1, audio[i]));
        pcm[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
      }

      const chunks: Buffer[] = [];
      const block = 1152;
      for (let i = 0; i < pcm.length; i += block) {
        const buf = encoder.encodeBuffer(pcm.subarray(i, Math.min(i + block, pcm.length)));
        if (buf.length) chunks.push(Buffer.from(buf));
      }
      const tail = encoder.flush();
      if (tail.length) chunks.push(Buffer.from(tail));

      return {
        data: Buffer.concat(chunks),
        format: "mp3",
        mime: "audio/mpeg",
        duration,
      };
    } catch {
      // Fall through to WAV rather than failing the whole generation.
    }
  }

  return { data: encodeWav(audio, rate), format: "wav", mime: "audio/wav", duration };
}

/** Read a WAV file (any bit depth we are likely to meet) into mono float32. */
export function decodeWav(buffer: Buffer): { audio: Float32Array; rate: number } {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("Not a WAV file.");
  }

  let offset = 12;
  let rate = 24000;
  let channels = 1;
  let bits = 16;
  let format = 1;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      format = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      rate = buffer.readUInt32LE(offset + 12);
      bits = buffer.readUInt16LE(offset + 22);
    } else if (id === "data") {
      dataStart = offset + 8;
      dataLength = Math.min(size, buffer.length - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }

  if (dataStart < 0) throw new Error("WAV file has no data chunk.");

  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * channels));
  const out = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = dataStart + (f * channels + c) * bytesPerSample;
      let v = 0;
      if (format === 3 && bits === 32) v = buffer.readFloatLE(at);
      else if (bits === 16) v = buffer.readInt16LE(at) / 0x8000;
      else if (bits === 32) v = buffer.readInt32LE(at) / 0x80000000;
      else if (bits === 24) {
        const raw = buffer.readUIntLE(at, 3);
        v = (raw & 0x800000 ? raw - 0x1000000 : raw) / 0x800000;
      } else if (bits === 8) v = (buffer.readUInt8(at) - 128) / 128;
      sum += v;
    }
    out[f] = sum / channels;
  }
  return { audio: out, rate };
}

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */

export interface Cue { start: number; end: number; text: string }

function stamp(seconds: number, comma = true): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? "," : "."}${pad(rest, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.trim()}\n`)
    .join("\n");
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues
    .map((c) => `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${c.text.trim()}\n`)
    .join("\n")}`;
}
