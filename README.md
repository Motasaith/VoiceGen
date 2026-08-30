# VoiceGen Studio (Next.js)

Local AI text-to-speech and voice cloning, built entirely in TypeScript on
Next.js 15. No Python, no PyTorch, no native compilation, nothing leaves the
machine.

> The Python version of this app lives in `D:\try\VoiceGen` and is untouched.
> This is the JavaScript rebuild.

---

## Quick start

```bash
npm install
npm run build
npm start
```

Or double-click `start.bat`, which does all three and opens the browser.

Then open <http://localhost:3000>, go to **Settings → Models**, and install the
narration voices (~90 MB). Cloning is a separate, optional install of about 1.1 GB.

For development with hot reload: `npm run dev`.

---

## What it does

| | |
|---|---|
| **Narration** | Kokoro-82M with 37 voices across 6 languages |
| **Voice blending** | Mix 2–4 voices with weights into a genuinely new speaker |
| **Voice cloning** | Chatterbox-Turbo creates a new voice from 10–20 seconds of audio |
| **Long-form** | Paste a whole script; chunked on sentence boundaries, stitched back together |
| **Subtitles** | Matching SRT and VTT, timed to the audio |
| **Mastering** | Loudness-normalised to −14 LUFS (YouTube/Facebook), −16, or −19 |
| **Dialogue** | Tag lines `[Alex]` / `[Sara]`, give each speaker a different voice |
| **API** | One HTTP call in, audio bytes out for n8n, Make, cron, or scripts |
| **SEO** | Server-rendered pages, metadata, JSON-LD, sitemap and robots |

---

## Languages

Working: **English (US)** · **English (UK)** · **Spanish** · **French** ·
**Italian** · **Portuguese (BR)**, with 37 voices total.

Kokoro also ships Japanese, Mandarin and Hindi voices, but **they are
deliberately not exposed here**. Neither JavaScript eSpeak build carries
dictionary data for those scripts, so eSpeak silently spells the characters out
in English, producing confident-sounding nonsense rather than a loud failure. The Python
version does support them.

---

## Why it is built this way

**No PyTorch, no native builds.** Everything runs on `onnxruntime-node`, which
ships prebuilt binaries. Persistence uses `node:sqlite`, built into Node 22.5+,
so there is no `better-sqlite3` to compile. `npm install` needs no build tools.

**The Kokoro model is driven directly, not through `kokoro-js`.** Two reasons:

1. `kokoro-js` whitelists only 28 English voices. The model is
   language-agnostic and style files for all 54 exist on the Hub.
2. Its `generate()` takes a voice *name*, so there is no way to pass a blended
   style vector. Going direct is what makes blending possible.

Kokoro voices are `510 × 256` float arrays indexed by token count, and they
interpolate linearly. A weighted average of two voices is itself a valid,
stable speaker. That is where "unlimited voices" comes from.

**Cloning caches its expensive half.** The speech encoder runs *once per
speaker*, at enrolment, and its conditioning tensors are saved to disk.
Generation never loads that component again.

---

## Speed, honestly

Measured on the development machine: Intel i5-6440HQ, 4 cores, 2015:

| | Kokoro (narration) | Chatterbox (cloning) |
|---|---|---|
| Measured RTF | **≈ 3.0** | **≈ 63** |
| 1 minute of audio | ~3 minutes | **~63 minutes** |
| 10-minute script | ~30 minutes | not realistic |
| Memory while loaded | ~580 MB | ~1.5 GB |
| Enrolling a new voice | Not applicable | ~11 seconds (one-off) |

**This is the CPU, not the runtime.** Running the identical ONNX file through
Python's onnxruntime gives RTF 3.40; through Node's it gives 3.04. Node is
marginally faster. This processor predates the AVX-512/VNNI instructions that
make int8 inference fast, so no configuration change fixes it. On hardware from
2020 onward the same code is several times quicker.

Two things follow from that, and both are built in:

- Generation runs as a **background job**. Queue it and close the tab.
- The Studio's time estimate is **learned from your own completed jobs** using a
  rolling average per engine, so it matches your hardware instead of a guess.

**On cloning specifically:** it works and it sounds right, but at ~63x slower
than real time it is only practical for short lines on this machine, such as a tagline,
an intro sting, a single sentence. For anything long-form, use a built-in voice
or a blend. The Studio warns you before queueing a cloned job over 20 seconds.

---

## Using it from code

```bash
curl -X POST http://localhost:3000/api/tts/speak \
  -H "Content-Type: application/json" \
  -d '{"text":"Welcome back to the channel.","voice":"af_heart","loudness":-14}' \
  --output narration.mp3
```

Long scripts, using a queue and poll workflow:

```js
const base = "http://localhost:3000";

const { jobId } = await fetch(base + "/api/tts/jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: script, voice: "bm_george", subtitles: true }),
}).then((r) => r.json());

let job;
do {
  await new Promise((r) => setTimeout(r, 1500));
  job = await fetch(`${base}/api/jobs/${jobId}`).then((r) => r.json());
} while (job.status === "running" || job.status === "queued");
// job.audioUrl and job.srtUrl are ready
```

### The `voice` field accepts four shapes

| Value | Meaning |
|---|---|
| `"af_heart"` | a built-in voice |
| `"blend_hype"` | a built-in blend preset |
| `"clone:vc_1a2b3c"` | one of your cloned or saved voices |
| `[{"voice":"af_heart","weight":0.6},{"voice":"af_nova","weight":0.4}]` | an ad-hoc blend |

---

## Script markup

```
A blank line starts a new paragraph and adds a natural breath.

Type [pause] for half a second, or [pause:1.5] for a longer beat.

[Alex] With dialogue mode on, each speaker gets their own voice.
[Sara] And the result is a single mixed track.
```

Abbreviations are handled. "Dr. Smith explained it at 5 p.m." stays one
sentence rather than being split into three.

---

## Deploying

This is a normal Next.js app, but the API routes load large ONNX models and
write to `data/`. That rules out edge and most serverless targets. Deploy to a
VPS, a container, or anything with a persistent filesystem and ~1 GB of RAM:

```bash
npm run build && npm start
```

Set `NEXT_PUBLIC_SITE_URL` to your real domain so canonical URLs, the sitemap
and Open Graph tags point at the right place.

The marketing pages (`/`, `/voices`, `/automate`) are statically prerendered and
carry full metadata and JSON-LD, so they are indexable. `/library` and `/api/*`
are excluded in `robots.ts`.

---

## Layout

```
src/
  app/
    page.tsx            landing (SEO, static)
    studio/             the generation workspace
    voices/             catalogue + blend builder
    clone/              4-step cloning wizard
    library/            job history
    automate/           API docs
    settings/           models, memory, quality
    api/                19 route handlers
  components/           Nav, VoicePicker, Toast, CodeBlock
  lib/
    engines/            kokoro.ts, clone.ts, manager.ts, phonemize.ts
    audio.ts            resampling, LUFS, WAV/MP3, subtitles
    text/chunker.ts     normalisation and sentence-safe chunking
    pipeline.ts         orchestration
    jobs.ts             background queue
    db.ts               node:sqlite
data/                   models, outputs, voice profiles, db (gitignored)
```

## Scripts

```bash
npm run check    # end-to-end Kokoro test: load, phonemise, blend, render to WAV
npm run bench    # steady-state speed benchmark on your CPU
```
