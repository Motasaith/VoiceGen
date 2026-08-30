"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Mic, Square, AlertTriangle, Info, Play, Trash2 } from "lucide-react";

import { notifyError, notifyOk } from "@/components/Toast";
import { useVoices } from "@/components/VoicePicker";

interface Report {
  score: number;
  duration: number;
  snrDb: number;
  speechPct: number;
  sampleRate: number;
  clippingPct: number;
  issues: string[];
  tips: string[];
  ok: boolean;
}

interface Upload {
  uploadId: string;
  filename: string;
  report: Report;
  cloneReady: boolean;
}

const STEPS = ["Upload", "Check quality", "Name & consent", "Test"];

const GUIDE = [
  {
    title: "Record 10–20 seconds",
    body: "One person, speaking normally, no music or background chatter. Longer clips do not improve the clone. A clean 15 seconds beats a noisy two minutes.",
  },
  {
    title: "Read something neutral",
    body: "Plain narration works best. If the reference is shouted or whispered, every line you generate inherits that.",
  },
  {
    title: "Keep the room quiet",
    body: "Fans, traffic and echo get baked into the voice. A closet full of clothes is genuinely a great booth.",
  },
  {
    title: "Check the score",
    body: "Upload gives the clip a 0–100 rating and tells you what to fix. Anything above 75 clones well.",
  },
];

/* Encode float samples as 16-bit mono WAV. */
function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * The server only parses WAV, and MediaRecorder produces WebM. The browser
 * can decode anything it can play, so normalise here and the server never
 * needs an audio-decoding dependency.
 */
async function toWav(file: File): Promise<File> {
  const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctx) return file;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    const mono =
      channels.length === 1
        ? channels[0]
        : Float32Array.from(channels[0], (_, i) =>
            channels.reduce((sum, ch) => sum + ch[i], 0) / channels.length,
          );
    const base = (file.name || "clip").replace(/\.[^.]+$/, "");
    return new File([encodeWav(mono, Math.round(decoded.sampleRate))], `${base}.wav`, {
      type: "audio/wav",
    });
  } catch {
    return file;
  } finally {
    ctx.close?.();
  }
}

export function CloneClient() {
  const { data: voicesData, reload } = useVoices();
  const [step, setStep] = useState(0);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [voice, setVoice] = useState<any>(null);

  const cloneReady = voicesData?.cloneReady ?? false;
  const clones = (voicesData?.saved ?? []).filter((v: any) => v.kind === "clone");

  const handleFile = useCallback(async (file: File) => {
    setAnalysing(true);
    try {
      const form = new FormData();
      form.append("file", await toWav(file));
      const res = await fetch("/api/clone/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUpload(data);
      setStep(1);
    } catch (err: any) {
      notifyError(err.message);
    } finally {
      setAnalysing(false);
    }
  }, []);

  return (
    <div className="fade-in">
      <header className="mb-8">
        <div className="page-kicker">Voice lab</div>
        <h1 className="page-title">Voice cloning</h1>
        <p className="page-description">
          Turn a short recording into a reusable voice. Best results come from 10–20
          seconds of clean speech.
        </p>
      </header>

      <div className="mb-6 flex">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className="flex-1 border-b-2 px-3 py-2.5 text-[0.85rem] font-semibold transition-colors"
            style={{
              borderColor: i === step ? "var(--color-brand)" : i < step ? "var(--color-ok)" : "var(--color-line)",
              color: i === step ? "var(--color-brand)" : i < step ? "var(--color-ok)" : "var(--color-ink-faint)",
            }}
          >
            <span className="mr-1.5 opacity-60">{i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      {!cloneReady && (
        <div className="alert alert-warn mb-5">
          <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong className="mb-1 block">The cloning model is not installed yet</strong>
            It is a one-time download of about 1.1 GB. Everything runs offline afterwards.
            <div className="mt-2.5">
              <a className="btn btn-sm btn-primary" href="/settings">Open Setup</a>
            </div>
          </div>
        </div>
      )}

      {step === 0 && <UploadStep onFile={handleFile} analysing={analysing} />}
      {step === 1 && upload && (
        <ReportStep
          upload={upload}
          onBack={() => { setUpload(null); setStep(0); }}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && upload && (
        <ConsentStep
          upload={upload}
          onBack={() => setStep(1)}
          onDone={(created) => { setVoice(created); setStep(3); reload(); }}
        />
      )}
      {step === 3 && voice && (
        <TestStep
          voice={voice}
          onAnother={() => { setUpload(null); setVoice(null); setStep(0); }}
        />
      )}

      <section className="card mt-6">
        <h2 className="mb-4 text-[1.05rem] font-semibold">Getting a good clone</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {GUIDE.map((item, i) => (
            <div key={item.title} className="flex items-start gap-4">
              <div
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[0.87rem] font-bold text-white"
                style={{ background: "var(--color-brand)" }}
              >
                {i + 1}
              </div>
              <div>
                <h3 className="mb-1 text-[0.95rem] font-semibold">{item.title}</h3>
                <p className="m-0 text-[0.86rem]" style={{ color: "var(--color-ink-dim)" }}>
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-4">
        <h2 className="mb-3 text-[1.05rem] font-semibold">Your cloned voices</h2>
        {clones.length === 0 ? (
          <p className="m-0 text-[0.88rem]" style={{ color: "var(--color-ink-dim)" }}>
            No cloned voices yet. Once you make one it appears here and in the voice picker.
          </p>
        ) : (
          clones.map((v: any) => (
            <div
              key={v.id}
              className="mb-2 flex items-center gap-3 rounded-[9px] border p-3"
              style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
            >
              <span
                className="grid h-8 w-8 place-items-center rounded-[10px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--color-brand), var(--color-brand-2))" }}
              >
                {v.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.9rem] font-semibold">{v.name}</div>
                <div className="text-[0.76rem]" style={{ color: "var(--color-ink-dim)" }}>
                  Quality {v.quality} · {v.description || "Cloned voice"}
                </div>
              </div>
              <button
                className="btn btn-sm btn-ghost"
                style={{ width: 32, padding: 0 }}
                onClick={async () => {
                  if (!confirm(`Delete “${v.name}”?`)) return;
                  await fetch(`/api/voices/${v.id}`, { method: "DELETE" });
                  reload();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UploadStep({ onFile, analysing }: { onFile: (f: File) => void; analysing: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notifyError("This browser will not give the page microphone access. Upload a file instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
      });
    } catch {
      notifyError("Microphone access was blocked. Allow it, or upload a file.");
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      onFile(new File([blob], "recording.webm", { type: blob.type }));
    };

    recorder.start();
    setRecording(true);
    setSeconds(0);
    const started = Date.now();
    const tick = setInterval(() => {
      if (recorder.state !== "recording") { clearInterval(tick); return; }
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= 45) recorder.stop();
    }, 250);
  };

  if (analysing) {
    return (
      <div className="card flex items-center gap-3">
        <span className="spinner" /> Analysing the recording…
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="mb-3.5 text-[1.05rem] font-semibold">Add a reference recording</h2>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
        }}
        className="cursor-pointer rounded-[14px] border-2 border-dashed px-5 py-10 text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--color-brand)" : "var(--color-line-strong)",
          background: dragging
            ? "color-mix(in srgb, var(--color-brand) 7%, var(--color-surface))"
            : "var(--color-surface-2)",
        }}
      >
        <Upload size={34} style={{ color: "var(--color-ink-faint)", margin: "0 auto 12px" }} />
        <h3 className="mb-1 text-[1rem] font-semibold">Drop a voice recording here</h3>
        <p className="m-0 text-[0.85rem]" style={{ color: "var(--color-ink-dim)" }}>
          WAV, MP3, M4A, OGG or WebM · 10–20 seconds of clean speech works best
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />

      <div className="mt-3.5 flex items-center justify-center gap-3">
        <button className={`btn ${recording ? "btn-primary" : ""}`} onClick={startRecording}>
          {recording ? <Square size={15} /> : <Mic size={15} />}
          {recording ? "Stop recording" : "Record from your microphone"}
        </button>
        {recording && (
          <span className="text-[0.84rem]" style={{ color: "var(--color-ink-dim)" }}>
            Recording {seconds}s. Read naturally and aim for about 15 seconds.
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReportStep({
  upload, onBack, onNext,
}: { upload: Upload; onBack: () => void; onNext: () => void }) {
  const { report } = upload;
  const verdict =
    report.score >= 75
      ? { cls: "alert-ok", text: "This is a strong reference. Expect a close match." }
      : report.score >= 50
        ? { cls: "alert-warn", text: "This will work, but a better recording would clone noticeably closer." }
        : { cls: "alert-bad", text: "This will produce a rough clone. Fixing the issues below is worth two minutes." };

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[1.05rem] font-semibold">Reference quality</h2>
        <button className="btn btn-sm btn-ghost" onClick={onBack}>Use a different file</button>
      </div>

      <div className="mb-5 flex flex-wrap items-start gap-6">
        <div
          className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--color-brand) ${report.score}%, var(--color-surface-3) 0)`,
          }}
        >
          <div
            className="grid h-[76px] w-[76px] place-items-center rounded-full text-center"
            style={{ background: "var(--color-surface)" }}
          >
            <div>
              <div className="text-[1.5rem] font-bold tabular-nums">{report.score}</div>
              <div className="text-[0.62rem]" style={{ color: "var(--color-ink-dim)" }}>/ 100</div>
            </div>
          </div>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className={`alert ${verdict.cls} mb-3`}>
            <Info size={17} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{verdict.text}</div>
          </div>
          <p className="hint m-0">{upload.filename}</p>
        </div>
      </div>

      <div className="mb-5 grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {[
          [`${report.duration}s`, "Usable length"],
          [`${report.snrDb} dB`, "Signal vs noise"],
          [`${report.speechPct}%`, "Actual speech"],
          [`${report.sampleRate / 1000} kHz`, "Sample rate"],
          [`${report.clippingPct}%`, "Clipping"],
        ].map(([value, label]) => (
          <div
            key={label}
            className="rounded-[9px] border px-3 py-2.5"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
          >
            <b className="block text-[1.02rem] tabular-nums">{value}</b>
            <span className="text-[0.72rem]" style={{ color: "var(--color-ink-dim)" }}>{label}</span>
          </div>
        ))}
      </div>

      {(report.issues.length > 0 || report.tips.length > 0) && (
        <ul className="m-0 list-none p-0">
          {report.issues.map((issue) => (
            <li key={issue} className="flex items-start gap-2.5 border-b py-2 text-[0.86rem]"
                style={{ borderColor: "var(--color-line)" }}>
              <AlertTriangle size={14} style={{ color: "var(--color-bad)", flexShrink: 0, marginTop: 3 }} />
              {issue}
            </li>
          ))}
          {report.tips.map((tip) => (
            <li key={tip} className="flex items-start gap-2.5 border-b py-2 text-[0.86rem]"
                style={{ borderColor: "var(--color-line)" }}>
              <Info size={14} style={{ color: "var(--color-brand-2)", flexShrink: 0, marginTop: 3 }} />
              {tip}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex gap-2">
        <button className="btn btn-primary" onClick={onNext}>Continue</button>
        <button className="btn" onClick={onBack}>Record again</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ConsentStep({
  upload, onBack, onDone,
}: { upload: Upload; onBack: () => void; onDone: (v: any) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/clone/enrol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          uploadId: upload.uploadId,
          description,
          consent,
          consentNote: note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notifyOk(`“${data.name}” is ready.`);
      onDone(data);
    } catch (err: any) {
      notifyError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="mb-4 text-[1.05rem] font-semibold">Name this voice</h2>

      <div className="mb-4">
        <label className="label">Voice name</label>
        <input className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)}
               placeholder="e.g. My narration voice" />
      </div>
      <div className="mb-4">
        <label className="label">Description (optional)</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
               placeholder="Where you plan to use it" />
      </div>

      <div className="alert alert-warn mb-4">
        <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong className="mb-1 block">Consent is required</strong>
          Clone your own voice, or one you have explicit permission to use. Cloning
          someone without their agreement is illegal in many places and breaches the
          terms of YouTube, Facebook, Instagram and TikTok. Everything generated from a
          clone is recorded as synthetic in this app&apos;s own metadata.
        </div>
      </div>

      <label className="mb-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ accentColor: "var(--color-brand)", marginTop: 3, width: 17, height: 17 }}
        />
        <span className="text-[0.87rem]">
          This is my own voice, or I have the speaker&apos;s explicit permission to clone
          it and to publish audio made with it.
        </span>
      </label>

      <div className="mb-5">
        <label className="label">Consent note (optional, kept locally)</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
               placeholder="e.g. My own voice / written permission from J. Smith" />
      </div>

      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={submit} disabled={!consent || !name.trim() || busy}>
          {busy ? <><span className="spinner" /> Analysing the voice…</> : "Create the voice"}
        </button>
        <button className="btn btn-ghost" onClick={onBack} disabled={busy}>Back</button>
      </div>
      {busy && (
        <p className="hint mt-3">
          The first run loads the cloning model, so this takes longer than later ones.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TestStep({ voice, onAnother }: { voice: any; onAnother: () => void }) {
  const [text, setText] = useState(
    "Here is how my cloned voice sounds. If this reads naturally, the reference recording did its job.",
  );
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setUrl(null);
    try {
      const res = await fetch(`/api/clone/${voice.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUrl(URL.createObjectURL(await res.blob()));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="mb-1.5 text-[1.05rem] font-semibold">Try “{voice.name}”</h2>
      <p className="hint mb-4">
        Type a line and hear it in the cloned voice. Cloning is much slower than the
        built-in voices, so give it a moment.
      </p>

      <textarea className="input mb-4" rows={3} value={text} onChange={(e) => setText(e.target.value)} />

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <><span className="spinner" /> Generating…</> : <><Play size={14} /> Generate sample</>}
        </button>
        <a className="btn" href="/studio">Use it in the Studio</a>
        <button className="btn btn-ghost" onClick={onAnother}>Clone another voice</button>
      </div>

      {error && <div className="alert alert-bad mt-4">{error}</div>}
      {url && (
        <div
          className="mt-4 rounded-[14px] border p-4"
          style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
        >
          <audio controls autoPlay src={url} className="w-full" />
        </div>
      )}
    </div>
  );
}
