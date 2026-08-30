/**
 * Voice catalogue.
 *
 * Kokoro encodes language and gender in the voice id itself:
 *   <lang><gender>_<name>     e.g. af_heart = American, female, "heart"
 *
 * kokoro-js only exposes 28 English voices, but the underlying model is
 * language-agnostic and the style files for all 54 exist on the Hub. So the
 * full set is declared here and fetched directly.
 */

export type Gender = "female" | "male";

export interface VoiceMeta {
  id: string;
  name: string;
  language: string;
  /** eSpeak-NG language code used for phonemisation. */
  espeak: string;
  flag: string;
  gender: Gender;
  note: string;
  tier: "flagship" | "great" | "good" | "standard" | "character";
  tags: string[];
  recommended: boolean;
}

export const LANGUAGES: Record<string, { label: string; espeak: string; flag: string }> = {
  a: { label: "English (US)", espeak: "en-us", flag: "🇺🇸" },
  b: { label: "English (UK)", espeak: "en-gb", flag: "🇬🇧" },
  j: { label: "Japanese", espeak: "ja", flag: "🇯🇵" },
  z: { label: "Mandarin", espeak: "cmn", flag: "🇨🇳" },
  e: { label: "Spanish", espeak: "es", flag: "🇪🇸" },
  f: { label: "French", espeak: "fr-fr", flag: "🇫🇷" },
  h: { label: "Hindi", espeak: "hi", flag: "🇮🇳" },
  i: { label: "Italian", espeak: "it", flag: "🇮🇹" },
  p: { label: "Portuguese (BR)", espeak: "pt-br", flag: "🇧🇷" },
};

/**
 * Languages this build can actually pronounce.
 *
 * The bundled eSpeak carries data for every language it ships, Hindi
 * included; what used to break non-Latin scripts was an input-encoding
 * flag, not missing dictionaries. See lib/engines/phonemize.
 *
 * Japanese and Mandarin stay withheld: eSpeak cannot read kanji, and its
 * Mandarin phonemes carry numeric tone markers Kokoro has no tokens for.
 */
export const SUPPORTED_LANG_PREFIXES = new Set(["a", "b", "e", "f", "h", "i", "p"]);

export const UNSUPPORTED_NOTE =
  "Japanese and Mandarin are unavailable: eSpeak cannot read kanji, and its " +
  "Mandarin output uses tone markers Kokoro has no tokens for.";

/**
 * Languages with no Kokoro voice of their own that a shipped voice can still
 * speak, by overriding only the phonemiser.
 *
 * Urdu and Hindi are the same spoken language (Hindustani) written in two
 * scripts, so the Hindi speakers render Urdu text correctly once eSpeak is
 * pointed at the Nastaliq dictionary. Pass `lang` on any synthesis request.
 */
export const LANGUAGE_OVERRIDES = [
  {
    code: "ur",
    label: "Urdu",
    flag: "🇵🇰",
    voices: ["hf_alpha", "hf_beta", "hm_omega", "hm_psi"],
    note:
      "Urdu text spoken by the Hindi voices. Same phonology, different script, " +
      "so the result is accurate Urdu; vocabulary drawn from Persian or Arabic " +
      "is the most likely place to hear a Hindi lean.",
  },
] as const;

/**
 * Pick the eSpeak dictionary that matches the script the text is written in.
 *
 * A Hindi voice handed Nastaliq is the failure this exists to prevent: eSpeak's
 * Hindi dictionary has no mapping for Arabic script, so instead of failing it
 * spells out every character by its *name* -- "arbi be, arbi re, arbi alif" --
 * turning a four-second sentence into half a minute of gibberish. Script is an
 * unambiguous signal, so detect it rather than relying on the caller.
 *
 * Only ever chooses between dictionaries for one spoken language, so it cannot
 * silently swap a voice's language out from under the caller.
 */
const SCRIPT_RANGES: { lang: string; re: RegExp }[] = [
  // Arabic block + Arabic Supplement/Extended-A, which is where Urdu's
  // retroflex and aspirate letters (ٹ ڈ ڑ ھ) live.
  { lang: "ur", re: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g },
  { lang: "hi", re: /[ऀ-ॿ]/g },
];

export function espeakForScript(text: string, baseLang: string): string {
  // Hindi and Urdu are the only pair that shares a voice, so this is the only
  // place a script check can change the answer.
  if (baseLang !== "hi" && baseLang !== "ur") return baseLang;

  let best = baseLang;
  let bestCount = 0;
  for (const { lang, re } of SCRIPT_RANGES) {
    const count = (text.match(re) ?? []).length;
    if (count > bestCount) { best = lang; bestCount = count; }
  }
  return bestCount > 0 ? best : baseLang;
}

/** Every voice id shipped in Kokoro v1.0. */
export const ALL_VOICE_IDS = [
  // American English
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
  "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
  "am_onyx", "am_puck", "am_santa",
  // British English
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
  // Japanese
  "jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro", "jm_kumo",
  // Mandarin
  "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi",
  "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
  // Spanish
  "ef_dora", "em_alex", "em_santa",
  // French
  "ff_siwis",
  // Hindi
  "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
  // Italian
  "if_sara", "im_nicola",
  // Brazilian Portuguese
  "pf_dora", "pm_alex", "pm_santa",
] as const;

/** The voices this build can actually speak. */
export const VOICE_IDS: string[] = ALL_VOICE_IDS.filter((id) =>
  SUPPORTED_LANG_PREFIXES.has(id[0]),
);

type Note = { note: string; tier: VoiceMeta["tier"]; tags: string[] };

const NOTES: Record<string, Note> = {
  af_heart:    { note: "Warm, natural, the most polished voice in the set. Best default for narration.", tier: "flagship", tags: ["narration", "warm", "youtube"] },
  af_bella:    { note: "Bright and expressive with strong energy. Great for hooks and intros.", tier: "flagship", tags: ["energetic", "shorts", "youtube"] },
  af_nicole:   { note: "Soft, close-mic ASMR quality. Lovely for calm or bedtime content.", tier: "great", tags: ["asmr", "calm", "soft"] },
  af_aoede:    { note: "Smooth mid-range read, very even pacing. Reliable for long-form.", tier: "great", tags: ["narration", "longform"] },
  af_kore:     { note: "Clear and confident, slightly formal. Good for explainers.", tier: "great", tags: ["explainer", "clear"] },
  af_sarah:    { note: "Friendly conversational tone.", tier: "good", tags: ["conversational"] },
  af_sky:      { note: "Youthful and light.", tier: "good", tags: ["young"] },
  af_nova:     { note: "Neutral and crisp, news-reader feel.", tier: "good", tags: ["news", "neutral"] },
  af_alloy:    { note: "Even, neutral delivery.", tier: "good", tags: ["neutral"] },
  af_jessica:  { note: "Relaxed, casual read.", tier: "good", tags: ["casual"] },
  af_river:    { note: "Calm and measured.", tier: "standard", tags: ["calm"] },
  am_michael:  { note: "Steady male narrator, the go-to documentary voice.", tier: "great", tags: ["narration", "documentary", "youtube"] },
  am_fenrir:   { note: "Deeper and weightier. Strong for dramatic or serious topics.", tier: "great", tags: ["deep", "dramatic"] },
  am_puck:     { note: "Playful and animated, good for comedic beats.", tier: "great", tags: ["playful", "energetic"] },
  am_adam:     { note: "Plain, neutral male read.", tier: "good", tags: ["neutral"] },
  am_echo:     { note: "Mellow and understated.", tier: "standard", tags: ["calm"] },
  am_eric:     { note: "Upbeat presenter energy.", tier: "good", tags: ["upbeat"] },
  am_liam:     { note: "Younger-sounding, casual.", tier: "good", tags: ["young", "casual"] },
  am_onyx:     { note: "Low and resonant.", tier: "good", tags: ["deep"] },
  am_santa:    { note: "Character voice, jolly and elderly.", tier: "character", tags: ["character"] },
  bf_emma:     { note: "Polished British female, warm and authoritative.", tier: "great", tags: ["narration", "british"] },
  bf_isabella: { note: "Refined British read, slightly formal.", tier: "good", tags: ["british", "formal"] },
  bf_alice:    { note: "Crisp British delivery.", tier: "good", tags: ["british"] },
  bf_lily:     { note: "Gentle, youthful British voice.", tier: "good", tags: ["british", "young"] },
  bm_george:   { note: "Classic British male narrator. Documentary-grade.", tier: "great", tags: ["british", "documentary"] },
  bm_fable:    { note: "Storyteller cadence, great for fiction and fairy tales.", tier: "great", tags: ["british", "storytelling"] },
  bm_daniel:   { note: "Measured, professional British male.", tier: "good", tags: ["british", "formal"] },
  bm_lewis:    { note: "Relaxed British male.", tier: "standard", tags: ["british", "casual"] },
  hf_alpha:    { note: "Clear Hindi female, even and neutral. Also speaks Urdu.", tier: "great", tags: ["hindi", "urdu", "narration"] },
  hf_beta:     { note: "Softer Hindi female, lighter delivery. Also speaks Urdu.", tier: "good", tags: ["hindi", "urdu"] },
  hm_omega:    { note: "Steady Hindi male narrator. Also speaks Urdu.", tier: "great", tags: ["hindi", "urdu", "narration"] },
  hm_psi:      { note: "Warmer Hindi male, conversational. Also speaks Urdu.", tier: "good", tags: ["hindi", "urdu"] },
};

const TIER_ORDER: Record<VoiceMeta["tier"], number> = {
  flagship: 0, great: 1, good: 2, standard: 3, character: 4,
};

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function describeVoice(id: string): VoiceMeta {
  const lang = LANGUAGES[id[0]] ?? { label: "Unknown", espeak: "en-us", flag: "🌐" };
  const gender: Gender = id[1] === "m" ? "male" : "female";
  const meta = NOTES[id];
  return {
    id,
    name: titleCase(id.split("_")[1] ?? id),
    language: lang.label,
    espeak: lang.espeak,
    flag: lang.flag,
    gender,
    note: meta?.note ?? `${lang.label} ${gender} voice.`,
    tier: meta?.tier ?? "standard",
    tags: meta?.tags ?? [],
    recommended: meta?.tier === "flagship" || meta?.tier === "great",
  };
}

export const CATALOG: VoiceMeta[] = VOICE_IDS.map(describeVoice).sort((a, b) => {
  const aEng = a.language.startsWith("English") ? 0 : 1;
  const bEng = b.language.startsWith("English") ? 0 : 1;
  if (aEng !== bEng) return aEng - bEng;
  const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
  if (t !== 0) return t;
  return a.language.localeCompare(b.language) || a.name.localeCompare(b.name);
});

export function voiceById(id: string): VoiceMeta | undefined {
  return CATALOG.find((v) => v.id === id);
}

export interface BlendComponent {
  voice: string;
  weight: number;
}

export interface PresetBlend {
  id: string;
  name: string;
  desc: string;
  components: BlendComponent[];
}

/** Kokoro style vectors interpolate linearly, so a mix is a real new speaker. */
export const PRESET_BLENDS: PresetBlend[] = [
  { id: "blend_anchor", name: "Anchor", desc: "Newsroom-neutral female. Heart + Nova.",
    components: [{ voice: "af_heart", weight: 0.6 }, { voice: "af_nova", weight: 0.4 }] },
  { id: "blend_storyteller", name: "Storyteller", desc: "Warm British narrator. Fable + George.",
    components: [{ voice: "bm_fable", weight: 0.55 }, { voice: "bm_george", weight: 0.45 }] },
  { id: "blend_hype", name: "Hype", desc: "High-energy shorts voice. Bella + Puck.",
    components: [{ voice: "af_bella", weight: 0.7 }, { voice: "am_puck", weight: 0.3 }] },
  { id: "blend_documentary", name: "Documentary", desc: "Authoritative male. Michael + Fenrir.",
    components: [{ voice: "am_michael", weight: 0.6 }, { voice: "am_fenrir", weight: 0.4 }] },
  { id: "blend_closemic", name: "Close Mic", desc: "Intimate, soft-spoken. Nicole + River.",
    components: [{ voice: "af_nicole", weight: 0.65 }, { voice: "af_river", weight: 0.35 }] },
];

export const LANGUAGE_SUMMARY = Object.entries(
  CATALOG.reduce<Record<string, { label: string; flag: string; count: number }>>((acc, v) => {
    acc[v.language] ??= { label: v.language, flag: v.flag, count: 0 };
    acc[v.language].count++;
    return acc;
  }, {}),
).map(([, v]) => v).sort((a, b) => b.count - a.count);
