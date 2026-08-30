/**
 * Grading a cloning reference clip.
 *
 * Clone quality is dominated by reference quality, and a beginner's first
 * attempt is usually a noisy three-second clip. Telling them exactly what is
 * wrong up front saves a dozen bad clones.
 */
import * as A from "./audio";

export interface ReferenceReport {
  ok: boolean;
  duration: number;
  sampleRate: number;
  peakDb: number;
  rmsDb: number;
  noiseFloorDb: number;
  snrDb: number;
  clippingPct: number;
  speechPct: number;
  score: number;
  issues: string[];
  tips: string[];
}

function percentile(sorted: Float64Array, p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

export function analyseReference(audio: Float32Array, rate: number): ReferenceReport {
  const issues: string[] = [];
  const tips: string[] = [];
  const duration = rate ? audio.length / rate : 0;

  if (!audio.length) {
    return {
      ok: false, duration: 0, sampleRate: rate, peakDb: -99, rmsDb: -99,
      noiseFloorDb: -99, snrDb: 0, clippingPct: 0, speechPct: 0, score: 0,
      issues: ["The file contains no audio."],
      tips: ["Upload a WAV or MP3 with clear speech."],
    };
  }

  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < audio.length; i++) {
    const v = Math.abs(audio[i]);
    if (v > peak) peak = v;
    sumSq += audio[i] * audio[i];
    if (v > 0.995) clipped++;
  }
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-9));
  const rmsDb = 20 * Math.log10(Math.max(Math.sqrt(sumSq / audio.length), 1e-9));
  const clippingPct = (clipped / audio.length) * 100;

  // Frame energies separate speech from background.
  const win = Math.max(1, Math.floor(rate * 0.02));
  const frames = Math.max(1, Math.floor(audio.length / win));
  const frameDb = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * win; i < (f + 1) * win && i < audio.length; i++) s += audio[i] * audio[i];
    frameDb[f] = 10 * Math.log10(s / win + 1e-12);
  }
  const sorted = Float64Array.from(frameDb).sort();
  const noiseFloorDb = percentile(sorted, 10);
  const speechLevelDb = percentile(sorted, 90);
  const snrDb = speechLevelDb - noiseFloorDb;

  let speechFrames = 0;
  for (const db of frameDb) if (db > noiseFloorDb + 8) speechFrames++;
  const speechPct = (speechFrames / frames) * 100;

  let score = 100;

  if (duration < 5) {
    issues.push(`The clip is only ${duration.toFixed(1)}s, which is too short for a stable clone.`);
    tips.push("Record 10–20 seconds. That is the sweet spot; more rarely helps.");
    score -= 35;
  } else if (duration < 8) {
    tips.push("8–20 seconds gives a noticeably more stable clone than 5.");
    score -= 10;
  } else if (duration > 40) {
    tips.push("Only the first ~30s is used. A tight 15s clip clones just as well.");
    score -= 5;
  }

  if (snrDb < 18) {
    issues.push(`Background noise is high (signal-to-noise ${snrDb.toFixed(0)} dB).`);
    tips.push("Record somewhere quiet, away from fans, traffic and echo.");
    score -= 30;
  } else if (snrDb < 26) {
    tips.push("A quieter room would sharpen the clone.");
    score -= 10;
  }

  if (clippingPct > 0.15) {
    issues.push(`The audio is clipping (${clippingPct.toFixed(1)}% of samples at full scale).`);
    tips.push("Lower the input gain or back off the mic, then re-record.");
    score -= 25;
  }

  if (rmsDb < -34) {
    issues.push("The recording is very quiet.");
    tips.push("Speak closer to the mic, or raise the input level.");
    score -= 15;
  }

  if (speechPct < 45) {
    issues.push("Most of the clip is silence.");
    tips.push("Trim the dead air so the clip is mostly continuous speech.");
    score -= 20;
  }

  if (rate < 16000) {
    issues.push(`The sample rate is only ${rate} Hz.`);
    tips.push("Use a 24 kHz or higher recording. A phone voice note is fine.");
    score -= 15;
  }

  if (!issues.length && !tips.length) {
    tips.push("This is a strong reference. Expect a close match.");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    ok: score >= 40 && duration >= 3,
    duration: Math.round(duration * 100) / 100,
    sampleRate: rate,
    peakDb: Math.round(peakDb * 10) / 10,
    rmsDb: Math.round(rmsDb * 10) / 10,
    noiseFloorDb: Math.round(noiseFloorDb * 10) / 10,
    snrDb: Math.round(snrDb * 10) / 10,
    clippingPct: Math.round(clippingPct * 1000) / 1000,
    speechPct: Math.round(speechPct * 10) / 10,
    score,
    issues,
    tips,
  };
}

/** Condition a reference clip: mono, 24 kHz, trimmed, level-matched. */
export function prepareReference(
  audio: Float32Array,
  rate: number,
  targetRate = 24000,
  maxSeconds = 30,
): Float32Array {
  let out = A.resample(audio, rate, targetRate);
  out = A.trimSilence(out, targetRate, -42, 60);
  const limit = Math.floor(maxSeconds * targetRate);
  if (out.length > limit) out = out.slice(0, limit);
  // The speech encoder likes a consistent input level.
  return A.normalisePeak(out, 0.9);
}
