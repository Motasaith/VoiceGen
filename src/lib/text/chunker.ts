/**
 * Script preparation: normalisation, markup and chunking.
 *
 * Kokoro's context is 510 phonemes; past that the tokenizer silently
 * truncates. So every script is split into sentence-aligned chunks that are
 * synthesised separately and stitched back together. Splitting only on
 * sentence boundaries, never mid-clause, is what keeps the joins inaudible.
 */

/** [pause] = 0.5s, [pause:1.5] = 1.5s */
const PAUSE_RE = /\[pause(?::\s*(\d*\.?\d+))?\s*(?:s|sec|seconds)?\]/gi;
const SPEAKER_RE = /^\s*\[([A-Za-z0-9 _'-]{1,32})\]\s*(.*)$/;

const SENTENCE_END = /(?<=[.!?。！？…])["'”’)\]]*\s+/;
const CLAUSE_END = /(?<=[,;:、，；])\s+/;

const ABBREVIATIONS = new Set([
  "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.", "mt.",
  "vs.", "etc.", "e.g.", "i.e.", "inc.", "ltd.", "co.", "no.", "fig.",
  "approx.", "dept.", "est.", "min.", "max.", "vol.", "ch.", "pp.",
]);

export interface Chunk {
  text: string;
  speaker: string | null;
  pauseAfter: number;
  index: number;
}

export interface PreparedScript {
  chunks: Chunk[];
  speakers: string[];
  charCount: number;
  /** Chunks that actually produce speech (not bare pauses). */
  spoken: Chunk[];
  estimatedSeconds: number;
}

/** Strip markdown and expand symbols the phonemiser would mangle. */
export function normalise(text: string): string {
  if (!text) return "";
  let out = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Fenced code blocks read terribly; drop them, then unwrap inline spans.
  const tick = String.fromCharCode(96);
  if (out.includes(tick)) {
    const parts = out.split(tick.repeat(3));
    if (parts.length > 1) out = parts.filter((_, i) => i % 2 === 0).join("");
    out = out.replace(new RegExp(`${tick}([^${tick}]+)${tick}`, "g"), "$1");
  }

  out = out
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–\u2014―]/g, " - ")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "$1")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/\[([^\]]+)\]\((?:https?|mailto)[^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/%/g, " percent ")
    .replace(/&/g, " and ")
    .replace(/€/g, " euros ")
    .replace(/₹/g, " rupees ")
    .replace(/¥/g, " yen ")
    .replace(/[ \t]+/g, " ")
    // Paragraphs are split before this runs, so a newline here is a soft
    // wrap inside one paragraph and should read as a space.
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ");

  return out.trim();
}

function endsWithAbbreviation(fragment: string): boolean {
  const words = fragment.trimEnd().split(/\s+/);
  const last = words[words.length - 1]?.toLowerCase();
  return !!last && ABBREVIATIONS.has(last);
}

export function splitSentences(text: string): string[] {
  const raw = text.split(SENTENCE_END);
  const merged: string[] = [];
  for (const part of raw) {
    const piece = part.trim();
    if (!piece) continue;
    if (merged.length && endsWithAbbreviation(merged[merged.length - 1])) {
      merged[merged.length - 1] += ` ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

/** Last resort for a sentence with no usable break: clauses, then words. */
function splitLong(sentence: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let buffer = "";

  for (const clause of sentence.split(CLAUSE_END)) {
    const candidate = buffer ? `${buffer} ${clause}` : clause;
    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      if (buffer) pieces.push(buffer);
      buffer = clause;
    }
  }
  if (buffer) pieces.push(buffer);

  const final: string[] = [];
  for (let piece of pieces) {
    while (piece.length > maxChars) {
      let cut = piece.lastIndexOf(" ", maxChars);
      if (cut < maxChars / 2) cut = maxChars;
      final.push(piece.slice(0, cut).trim());
      piece = piece.slice(cut).trim();
    }
    if (piece) final.push(piece);
  }
  return final;
}

/** Greedily pack whole sentences up to the budget. */
function pack(sentences: string[], maxChars: number): string[] {
  const packed: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (buffer) { packed.push(buffer); buffer = ""; }
      packed.push(...splitLong(sentence, maxChars));
      continue;
    }
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      packed.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) packed.push(buffer);
  return packed;
}

export interface PrepareOptions {
  maxChars?: number;
  paragraphPause?: number;
  multiSpeaker?: boolean;
}

export function prepare(text: string, options: PrepareOptions = {}): PreparedScript {
  const { maxChars = 320, paragraphPause = 0.45, multiSpeaker = false } = options;

  const chunks: Chunk[] = [];
  const speakers: string[] = [];

  if (!text?.trim()) {
    return { chunks: [], speakers: [], charCount: 0, spoken: [], estimatedSeconds: 0 };
  }

  let currentSpeaker: string | null = null;
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n\n");

  paragraphs.forEach((paragraph, pIndex) => {
    const lines = multiSpeaker ? paragraph.split("\n") : [paragraph];

    for (let line of lines) {
      if (!line.trim()) continue;

      if (multiSpeaker) {
        const match = SPEAKER_RE.exec(line);
        if (match && !match[1].trim().toLowerCase().startsWith("pause")) {
          currentSpeaker = match[1].trim();
          if (!speakers.includes(currentSpeaker)) speakers.push(currentSpeaker);
          line = match[2];
        }
      }

      // Split on pause tags, keeping the surrounding text.
      PAUSE_RE.lastIndex = 0;
      const segments = line.split(PAUSE_RE);

      for (let i = 0; i < segments.length; i += 2) {
        const body = normalise(segments[i] ?? "");
        const hasPause = i + 1 < segments.length;
        const raw = segments[i + 1];
        const pause = hasPause ? (raw ? parseFloat(raw) : 0.5) : 0;

        if (body) {
          for (const piece of pack(splitSentences(body), maxChars)) {
            chunks.push({ text: piece, speaker: currentSpeaker, pauseAfter: 0, index: 0 });
          }
        }
        if (pause > 0) {
          const capped = Math.min(pause, 10);
          if (chunks.length) chunks[chunks.length - 1].pauseAfter += capped;
          else chunks.push({ text: "", speaker: null, pauseAfter: capped, index: 0 });
        }
      }
    }

    // A breath between paragraphs.
    if (chunks.length && pIndex < paragraphs.length - 1) {
      const last = chunks[chunks.length - 1];
      last.pauseAfter = Math.max(last.pauseAfter, paragraphPause);
    }
  });

  chunks.forEach((c, i) => { c.index = i; });

  const spoken = chunks.filter((c) => c.text.trim().length > 0);
  const words = chunks.reduce((n, c) => n + (c.text ? c.text.split(/\s+/).length : 0), 0);
  const pauseTotal = chunks.reduce((n, c) => n + c.pauseAfter, 0);

  return {
    chunks,
    speakers,
    charCount: text.length,
    spoken,
    estimatedSeconds: (words / 165) * 60 + pauseTotal,
  };
}

export function detectSpeakers(text: string): string[] {
  const found: string[] = [];
  for (const line of (text ?? "").split("\n")) {
    const match = SPEAKER_RE.exec(line);
    if (!match) continue;
    const name = match[1].trim();
    if (name.toLowerCase().startsWith("pause") || found.includes(name)) continue;
    found.push(name);
  }
  return found;
}
