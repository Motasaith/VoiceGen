/**
 * Text -> eSpeak-NG phonemes.
 *
 * This is a TypeScript port of kokoro-js's phonemiser, widened to every
 * language Kokoro ships voices for. kokoro-js hardcodes "en-us" / "en";
 * here the eSpeak language code comes from the voice, so Spanish, French,
 * Italian, Portuguese, Hindi, Japanese and Mandarin voices work too.
 *
 * The English-specific normalisation (money, years, possessives, "Dr.") is
 * applied only to English, where it is correct.
 */
import { phonemize as phonemizerEn } from "phonemizer";

/**
 * Two eSpeak backends, because neither one alone is enough:
 *
 *   - `phonemizer` has a fast persistent API and output that matches
 *     kokoro-js byte for byte, but its bundled eSpeak data is English-only.
 *   - `espeak-ng` carries data for the Latin-script languages, but has to
 *     instantiate a WASM module per call.
 *
 * So English (the common case) takes the fast path, and everything else
 * goes through espeak-ng, whose embedded data covers every language it
 * ships -- Devanagari and Nastaliq included.
 *
 * The eSpeak input-encoding flag must be written "-b1", not "-b=1". With
 * the "=" form eSpeak parses the value as 0 and decodes the text as 8-bit
 * Latin-1, so every multi-byte character is read as the *name* of an
 * accented letter: Urdu came out as "o stroke, u grave", Spanish "nino"
 * as "n a-tilde o". That single character was the whole reason non-Latin
 * scripts looked unsupported.
 *
 * Japanese and Mandarin remain withheld for real reasons: eSpeak has no
 * kanji reading dictionary, and its Mandarin output carries numeric tone
 * markers that are not in Kokoro's vocabulary.
 */
export const SUPPORTED_ESPEAK = new Set([
  "en-us", "en-gb", "es", "fr-fr", "it", "pt-br", "hi", "ur",
]);

/** eSpeak's --ipa=3 inserts zero-width joiners that are not in Kokoro's vocab. */
const ZWJ = /‍/g;

async function espeakOther(text: string, lang: string): Promise<string> {
  const mod: any = await import("espeak-ng");
  const ESpeakNg = mod.default ?? mod;
  const instance = await ESpeakNg({
    arguments: ["--phonout", "out", "--sep=", "-q", "-b1", "--ipa=3", "-v", lang, text],
  });
  const raw: string = instance.FS.readFile("out", { encoding: "utf8" });
  // eSpeak ends each sentence with a newline, which Kokoro has no token for
  // and therefore drops silently -- gluing the last word of one sentence to
  // the first of the next. A space keeps the boundary the model needs.
  return raw.replace(ZWJ, "").replace(/\s*\n\s*/g, " ").trim();
}

async function espeak(text: string, lang: string): Promise<string[]> {
  if (lang.startsWith("en")) {
    return phonemizerEn(text, lang === "en-gb" ? "en" : "en-us");
  }
  return [await espeakOther(text, lang)];
}

/** Split on a regex while keeping the delimiters, marked as matches. */
function splitKeeping(text: string, regex: RegExp): { match: boolean; text: string }[] {
  const out: { match: boolean; text: string }[] = [];
  let prev = 0;
  for (const m of text.matchAll(regex)) {
    const full = m[0];
    const index = m.index ?? 0;
    if (prev < index) out.push({ match: false, text: text.slice(prev, index) });
    if (full.length) out.push({ match: true, text: full });
    prev = index + full.length;
  }
  if (prev < text.length) out.push({ match: false, text: text.slice(prev) });
  return out;
}

/** Years, clock times and plain numbers read the way a person would say them. */
function splitNum(match: string): string {
  if (match.includes(".")) return match;

  if (match.includes(":")) {
    const [h, m] = match.split(":").map(Number);
    if (m === 0) return `${h} o'clock`;
    if (m < 10) return `${h} oh ${m}`;
    return `${h} ${m}`;
  }

  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;

  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith("s") ? "s" : "";

  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function flipMoney(match: string): string {
  const bill = match[0] === "$" ? "dollar" : "pound";
  const rest = match.slice(1);

  if (Number.isNaN(Number(rest))) return `${rest} ${bill}s`;
  if (!match.includes(".")) return `${rest} ${bill}${rest === "1" ? "" : "s"}`;

  const [b, c] = rest.split(".");
  const d = parseInt(c.padEnd(2, "0"), 10);
  const coins = match[0] === "$"
    ? (d === 1 ? "cent" : "cents")
    : (d === 1 ? "penny" : "pence");
  return `${b} ${bill}${b === "1" ? "" : "s"} and ${d} ${coins}`;
}

function pointNum(match: string): string {
  const [a, b] = match.split(".");
  return `${a} point ${b.split("").join(" ")}`;
}

/** Punctuation-only normalisation, safe for every language. */
function normaliseCommon(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/、/g, ", ")
    .replace(/。/g, ". ")
    .replace(/！/g, "! ")
    .replace(/，/g, ", ")
    .replace(/：/g, ": ")
    .replace(/；/g, "; ")
    .replace(/？/g, "? ")
    .replace(/[^\S \n]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .trim();
}

/** Additional rules that only make sense for English text. */
function normaliseEnglish(text: string): string {
  return text
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim();
}

const PUNCTUATION = ';:,.!?¡¿\u2014…"«»“”(){}[]';
const PUNCTUATION_PATTERN = new RegExp(
  `(\\s*[${PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`,
  "g",
);

export async function phonemize(text: string, espeakLang = "en-us"): Promise<string> {
  const isEnglish = espeakLang.startsWith("en");

  let normalised = normaliseCommon(text);
  if (isEnglish) normalised = normaliseEnglish(normalised);
  if (!normalised) return "";

  // Phonemise between punctuation so the punctuation survives verbatim.
  // Kokoro uses it for prosody and pausing.
  const sections = splitKeeping(normalised, PUNCTUATION_PATTERN);
  const parts = await Promise.all(
    sections.map(async ({ match, text: chunk }) => {
      if (match) return chunk;
      if (!chunk.trim()) return chunk;
      try {
        return (await espeak(chunk, espeakLang)).join(" ");
      } catch {
        // A backend failure should degrade, not kill the whole render.
        return (await espeak(chunk, "en-us")).join(" ");
      }
    }),
  );

  // "r -> ɹ" and "x -> k" are English spelling conventions inherited
  // from kokoro-js, not vocabulary limits: Kokoro has tokens for r, ɾ
  // and x. In Hindi and Urdu they would erase real contrasts -- the
  // tap/trill would become an English R, and Urdu's /x/ (خ) would
  // collapse into /k/ -- so they are skipped there. ɬ has no token, so
  // that mapping is kept for every language.
  const indic = espeakLang === "hi" || espeakLang === "ur";

  let processed = parts.join("").replace(/ʲ/g, "j");
  if (!indic) processed = processed.replace(/r/g, "ɹ").replace(/x/g, "k");
  // Kokoro has no token for ʐ, which eSpeak emits for Urdu's ظ, so it would be
  // dropped outright -- ظالم would lose its first consonant and read "aalim".
  // Urdu merges ز ذ ض ظ into /z/, so this is the correct realisation anyway.
  if (indic) processed = processed.replace(/ʐ/g, "z");
  processed = processed
    .replace(/ɬ/g, "l")
    .replace(/ z(?=[;:,.!?¡¿\u2014…"«»“” ]|$)/g, "z");

  if (isEnglish) {
    processed = processed
      .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
      .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
      .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ");
    if (espeakLang === "en-us") {
      processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
    }
  }

  // Kokoro's vocabulary contains combining marks but not precomposed
  // nasal vowels, so decompose. This is a no-op for the Latin languages.
  return processed.normalize("NFD").trim();
}
