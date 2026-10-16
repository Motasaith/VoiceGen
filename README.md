# VoiceGen Studio (Next.js)

Local AI text-to-speech and voice cloning, built entirely in TypeScript on
Next.js 15. No Python, no PyTorch, no native compilation, nothing leaves the
machine.

---

## Install and run

Everything is pure JavaScript with prebuilt binaries, so the steps are the same
on every platform. The only real requirement is **Node.js 22.13 or newer**
(Node 24 LTS is what it is developed on). It needs `node:sqlite`, which is
built into Node, so there is nothing to compile and no Python or ffmpeg.

| Requirement | Detail |
|---|---|
| Node.js | 22.13+ (check with `node -v`) |
| RAM | ~1 GB free for narration, ~2 GB if you also use cloning |
| Disk | ~90 MB for narration voices, ~1.1 GB more for cloning |
| Network | Needed once, to download models from Hugging Face. Offline afterwards |
| CPU | x64 or arm64. A GPU is not used |

### Windows

1. Install Node.js from <https://nodejs.org> (LTS), or in PowerShell:
   `winget install OpenJS.NodeJS.LTS`
2. Get the code and start it:

```powershell
git clone <your-repo-url> voicegen-web
cd voicegen-web
npm install
npm run build
npm start
```

Or just double-click **`start.bat`**. It installs, builds (first run only),
opens the browser and starts the server.

### Linux

```bash
# Node 22+ (Debian/Ubuntu example, using NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

git clone <your-repo-url> voicegen-web
cd voicegen-web
npm install
npm run build
npm start
```

Fedora: `sudo dnf install nodejs git`. Arch: `sudo pacman -S nodejs npm git`.
Any distro works if `node -v` reports 22.13 or newer; `nvm install 22` is the
simplest route when your package manager is behind. The prebuilt ONNX Runtime
binary needs glibc, so on Alpine use a glibc-based image instead.

### macOS

```bash
brew install node git
git clone <your-repo-url> voicegen-web
cd voicegen-web
npm install && npm run build && npm start
```

Works on both Intel and Apple Silicon (CPU inference).

### Docker (any host, including a server or NAS)

```dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t voicegen .
docker run -d -p 3000:3000 -v voicegen-data:/app/data voicegen
```

Mount `/app/data` as a volume so downloaded models, voices and your history
survive container rebuilds.

### Android, Raspberry Pi and other platforms

Anything that runs Node 22.13+ on x64 or arm64 with glibc can run it. A
Raspberry Pi 4/5 (64-bit OS) works for short narration but is slow. Phones and
tablets are not supported directly; run it on a computer or server and open
the web UI from the device's browser over your network.

### First run

1. Open <http://localhost:3000>.
2. Go to **Settings, then Models**, and install the narration voices (~90 MB).
3. Optional: install the cloning model (~1.1 GB) from the same page.
4. Open the **Studio**, pick a voice, paste text, press generate.

### Options

| Setting | How |
|---|---|
| Different port | `npx next start -p 8080` (Linux/macOS: `PORT=8080 npm start`) |
| Reach it from other devices | `npx next start -H 0.0.0.0` then browse to `http://<your-ip>:3000`. There is no login, so only do this on a network you trust |
| Public domain | set `NEXT_PUBLIC_SITE_URL=https://example.com` **before** `npm run build` |
| Hot reload for development | `npm run dev` |
| Where data lives | the `data/` folder in the project (models, audio, voices, database). Back it up to keep your voices |

Windows PowerShell sets variables like this: `$env:PORT=8080; npm start`.

### Troubleshooting

- **`node:sqlite` not found or `ERR_UNKNOWN_BUILTIN_MODULE`**: Node is too old. Upgrade to 22.13+.
- **`EPERM` renaming files inside `.next-dev` on Windows**: delete the `.next-dev` folder and run `npm run dev` again. If it persists, run `npm run build && npm start` instead.
- **Model download fails**: the machine needs access to `huggingface.co` the first time. Retry from Settings, then Models.
- **Generation is slow**: expected on older CPUs, see "Speed, honestly" below. Queue a job and close the tab.
- **Port already in use**: start on another port as shown above.

---

## Using every feature

| Feature | Where | How |
|---|---|---|
| Narration | **Studio** | Pick a voice, paste text, set speed and loudness, generate. Runs as a background job |
| Voice browser | **Voices** | Preview all voices, filter by language, gender and tags |
| Blending | **Voices** | Pick 2 to 4 voices, set weights, save as a named blend, then use it like any voice |
| Cloning | **Clone** | 4 steps: upload 10 to 20 s of clean audio, enrol, test, save. Needs the cloning model |
| Long scripts | **Studio** | Paste the whole script. It is split at sentence boundaries and stitched back |
| Pauses | **Studio** | `[pause]` or `[pause:1.5]` inside the text |
| Dialogue | **Studio** | Turn on dialogue mode, write `[Alex] line`, assign each speaker a voice |
| Subtitles | **Studio** | Tick subtitles to get matching `.srt` and `.vtt` files |
| Loudness | **Studio** | −14 LUFS (YouTube/Facebook), −16 or −19 |
| History | **Library** | Replay, download or delete past jobs |
| Automation | **Automate** | HTTP API docs, see "Using it from code" below |
| Memory and quality | **Settings** | Unload models, check disk use, tune quality |

**Hindi and Urdu:** pick a Hindi voice (`hf_alpha`, `hf_beta`, `hm_omega`,
`hm_psi`) and paste Devanagari or Urdu (Nastaliq) text. The script is detected
automatically. Kokoro tends to speak Indic text too quickly, so set speed to
about 0.6 to 0.7 for natural pacing.

---

## What it does

| | |
|---|---|
| **Narration** | Kokoro-82M with 41 voices across 7 languages, plus Urdu |
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
**Italian** · **Portuguese (BR)** · **Hindi** · **Urdu**, with 41 voices total.

Urdu has no voice of its own in Kokoro. The Hindi voices speak it, because the
two are one spoken language in two scripts; the app detects the script and picks
the right eSpeak dictionary. Words borrowed from Persian or Arabic may carry a
slight Hindi accent.

Kokoro also ships Japanese and Mandarin voices, but **they are deliberately not
exposed here**: eSpeak cannot read kanji, and its Mandarin output uses tone
markers Kokoro has no tokens for. The result would be confident-sounding
nonsense rather than a loud failure.

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
