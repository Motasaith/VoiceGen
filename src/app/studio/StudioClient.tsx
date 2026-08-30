"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Download, X, ChevronDown, Users } from "lucide-react";

import { notifyError, notifyOk, toast } from "@/components/Toast";
import {
  flattenVoices, toRequestVoice, useVoices, VoicePickerButton, type VoiceEntry,
} from "@/components/VoicePicker";
import { formatBytes, formatDuration } from "@/lib/format";

const SAMPLE = `Most people think the hardest part of starting is finding the right idea.

It isn't. [pause:0.8] The hardest part is finishing the first boring version.

Here is what actually works. Pick something small enough that you can finish it this week. Ship it before you are proud of it. Then let real feedback tell you what to build next.

That loop of building, shipping, and listening beats a year of planning every single time.`;

interface Estimate {
  chunks: number;
  estimatedAudioSeconds: number;
  estimatedGenerationSeconds: number;
  speakers: string[];
  measured: boolean;
  warning: string | null;
  engine: string;
}

interface Job {
  id: string;
  status: string;
  progress: number;
  stage: string;
  error: string | null;
  title: string;
  voice_label: string;
  duration: number;
  bytes: number;
  elapsed: number;
  output_format: string;
  audioUrl: string | null;
  downloadUrl: string | null;
  srtUrl: string | null;
}

export function StudioClient() {
  const { data: voicesData } = useVoices();
  const entries = useMemo(() => flattenVoices(voicesData), [voicesData]);

  const [text, setText] = useState("");
  const [voice, setVoice] = useState("af_heart");
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [sentencePause, setSentencePause] = useState(0.22);
  const [format, setFormat] = useState<"mp3" | "wav">("mp3");
  const [loudness, setLoudness] = useState<number | null>(-14);
  const [subtitles, setSubtitles] = useState(false);
  const [multiSpeaker, setMultiSpeaker] = useState(false);
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const currentEntry = entries.find((e) => e.id === voice);

  const buildRequest = useCallback(() => {
    const mapped: Record<string, any> = {};
    for (const [name, id] of Object.entries(speakerVoices)) {
      mapped[name] = toRequestVoice(entries.find((e) => e.id === id), id);
    }
    return {
      text,
      voice: toRequestVoice(currentEntry, voice),
      speed,
      pitch,
      format,
      loudness,
      sentencePause,
      subtitles,
      multiSpeaker,
      speakerVoices: mapped,
      title: text.trim().split("\n")[0]?.slice(0, 60) ?? "",
    };
  }, [text, voice, speed, pitch, format, loudness, sentencePause, subtitles,
      multiSpeaker, speakerVoices, currentEntry, entries]);

  /* Estimate, debounced. */
  useEffect(() => {
    if (!text.trim()) { setEstimate(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/tts/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequest()),
        });
        if (res.ok) setEstimate(await res.json());
      } catch { /* offline */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [text, voice, speed, multiSpeaker, buildRequest]);

  /* Poll a running job. */
  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error("Lost track of the job");
        const next: Job = await res.json();
        setJob(next);

        if (["done", "error", "cancelled"].includes(next.status)) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setBusy(false);
          if (next.status === "done") notifyOk(`Done. ${formatDuration(next.duration)} of audio is ready.`);
          else if (next.status === "error") notifyError(next.error ?? "Generation failed.");
          else toast("Cancelled.");
        }
      } catch (err: any) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setBusy(false);
        notifyError(err.message);
      }
    }, 800);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const generate = async () => {
    if (!text.trim()) { notifyError("Write or paste a script first."); return; }
    setBusy(true);
    setJob(null);
    try {
      const res = await fetch("/api/tts/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the job");
      startPolling(data.jobId);
    } catch (err: any) {
      notifyError(err.message);
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (job?.id) await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
  };

  /* Detect [Speaker] tags when dialogue mode is on. */
  const [speakers, setSpeakers] = useState<string[]>([]);
  useEffect(() => {
    if (!multiSpeaker) { setSpeakers([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/tts/speakers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        setSpeakers(data.speakers ?? []);
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [text, multiSpeaker]);

  return (
    <div className="fade-in">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="page-kicker">Text to speech</div>
          <h1 className="page-title">Create speech</h1>
          <p className="page-description">
            Bring your words to life with a natural, expressive voice.
          </p>
        </div>
        <div className="hidden items-center gap-2 text-[0.74rem] sm:flex" style={{ color: "var(--color-ink-faint)" }}>
          <span className="status-dot is-online" /> Local engine ready
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Editor */}
        <div className="min-w-0">
          <div className="card overflow-hidden p-0!">
            <div className="flex items-center justify-between gap-2 border-b px-5 py-4" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <h2 className="m-0 text-[0.95rem] font-semibold">Script</h2>
                <p className="m-0 mt-0.5 hidden text-[0.7rem] sm:block" style={{ color: "var(--color-ink-faint)" }}>Write, paste, or start with an example</p>
              </div>
              <div className="flex gap-1.5">
                <button className="btn btn-sm btn-ghost" onClick={() => setText(SAMPLE)}>
                  <span className="hidden sm:inline">Load </span>example
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setText("")}>
                  Clear
                </button>
              </div>
            </div>

            <textarea
              className="min-h-[390px] w-full resize-y border-0 bg-transparent px-5 py-5 text-[0.96rem] leading-[1.8] outline-none"
              placeholder={
                "Paste or type your script here.\n\n" +
                "Tips:\n" +
                "  • A blank line starts a new paragraph and adds a natural breath.\n" +
                "  • Type [pause] for half a second, or [pause:1.5] for a longer beat.\n" +
                "  • Turn on Dialogue mode to give [Alex] and [Sara] different voices."
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); generate(); }
              }}
            />

            <div
              className="flex flex-wrap items-center gap-3 border-t px-5 py-3 text-[0.76rem]"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-faint)", background: "var(--color-bg-soft)" }}
            >
              <span>{text.length.toLocaleString()} characters</span>
              {estimate && <span>{estimate.chunks} chunk{estimate.chunks === 1 ? "" : "s"}</span>}
              {estimate && (
                <span style={{ color: estimate.warning ? "var(--color-warn)" : undefined }}>
                  ≈ {formatDuration(estimate.estimatedAudioSeconds)} of audio ·{" "}
                  ~{formatDuration(estimate.estimatedGenerationSeconds)} to render
                  {estimate.measured ? "" : " (first estimate)"}
                </span>
              )}
              <span className="flex-1" />
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={multiSpeaker}
                  onChange={(e) => setMultiSpeaker(e.target.checked)}
                  style={{ accentColor: "var(--color-brand)" }}
                />
                <span className="text-[0.8rem]">Dialogue mode</span>
              </label>
            </div>

            {estimate?.warning && (
              <div className="alert alert-warn mx-5 mb-5 mt-3">
                <span>{estimate.warning}</span>
              </div>
            )}

            {multiSpeaker && (
              <div className="border-t p-5" style={{ borderColor: "var(--color-line)" }}>
                {speakers.length === 0 ? (
                  <div className="alert alert-info">
                    <Users size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      Start lines with a name in brackets to assign voices, like{" "}
                      <code>[Alex] Hey, did you see this?</code>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="label">Voice for each speaker</div>
                    {speakers.map((name) => (
                      <div
                        key={name}
                        className="mb-2 flex items-center gap-3 rounded-[9px] border p-2.5"
                        style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
                      >
                        <strong className="text-[0.87rem]">{name}</strong>
                        <div className="min-w-0 flex-1">
                          <VoicePickerButton
                            value={speakerVoices[name] ?? voice}
                            entries={entries}
                            onChange={(id) => setSpeakerVoices((prev) => ({ ...prev, [name]: id }))}
                          />
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Result */}
          {job?.status === "done" && job.audioUrl && (
            <div className="card mt-5">
              <div className="mb-3.5 flex items-center justify-between gap-3">
                <h2 className="m-0 text-[1.05rem] font-semibold">Result</h2>
                <div className="flex gap-1.5">
                  <a className="btn btn-sm btn-primary" href={job.downloadUrl!}>
                    <Download size={13} /> Download
                  </a>
                  {job.srtUrl && (
                    <>
                      <a className="btn btn-sm" href={job.srtUrl}>SRT</a>
                      <a className="btn btn-sm" href={`${job.srtUrl}?format=vtt`}>VTT</a>
                    </>
                  )}
                </div>
              </div>

              <div
                className="rounded-[14px] border p-4"
                style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
              >
                <div className="font-semibold">{job.title || "Generated audio"}</div>
                <div className="text-[0.8rem]" style={{ color: "var(--color-ink-dim)" }}>
                  {job.voice_label}
                </div>
                <audio controls src={job.audioUrl} className="my-2.5 w-full" />
                <div
                  className="flex flex-wrap gap-3.5 text-[0.77rem] tabular-nums"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  <span>{formatDuration(job.duration)}</span>
                  <span>{formatBytes(job.bytes)}</span>
                  <span>{(job.output_format ?? "").toUpperCase()}</span>
                  <span>
                    rendered in {formatDuration(job.elapsed)}
                    {job.duration > 0 && ` (${(job.elapsed / job.duration).toFixed(2)}× real time)`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <aside className="xl:sticky xl:top-[28px]">
          <div className="card">
            <div className="mb-5 flex items-center justify-between border-b pb-4" style={{ borderColor: "var(--color-line)" }}>
              <div>
                <h2 className="m-0 text-[0.95rem] font-semibold">Voice settings</h2>
                <p className="m-0 mt-0.5 text-[0.7rem]" style={{ color: "var(--color-ink-faint)" }}>Fine-tune your generation</p>
              </div>
              <span className="badge badge-brand">Kokoro</span>
            </div>
            <div className="mb-4">
              <label className="label">Voice</label>
              <VoicePickerButton value={voice} entries={entries} onChange={setVoice} />
            </div>

            <Slider
              label="Speed"
              hint="tempo only, pitch stays put"
              min={0.5} max={2} step={0.05} value={speed} onChange={setSpeed}
              display={`${speed.toFixed(2)}×`}
            />
            <Slider
              label="Pitch"
              min={-6} max={6} step={0.5} value={pitch} onChange={setPitch}
              display={`${pitch > 0 ? "+" : ""}${pitch.toFixed(1)} st`}
            />
            <Slider
              label="Pause between sentences"
              min={0} max={1.2} step={0.02} value={sentencePause} onChange={setSentencePause}
              display={`${sentencePause.toFixed(2)} s`}
            />

            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-1 flex w-full items-center gap-1.5 py-1.5 text-[0.84rem] font-semibold"
              style={{ color: "var(--color-ink-dim)" }}
            >
              <ChevronDown
                size={15}
                style={{ transform: showAdvanced ? "rotate(180deg)" : "none", transition: "transform .2s" }}
              />
              Output &amp; advanced
            </button>

            {showAdvanced && (
              <div className="pt-3">
                <div className="mb-4">
                  <label className="label">Format</label>
                  <div
                    className="inline-flex gap-0.5 rounded-[9px] border p-1"
                    style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
                  >
                    {(["mp3", "wav"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className="rounded-md px-3 py-1.5 text-[0.84rem] font-semibold transition-colors"
                        style={{
                          background: format === f ? "var(--color-brand)" : "transparent",
                          color: format === f ? "#fff" : "var(--color-ink-dim)",
                        }}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="label">Loudness target</label>
                  <select
                    className="input"
                    value={loudness === null ? "" : String(loudness)}
                    onChange={(e) => setLoudness(e.target.value === "" ? null : Number(e.target.value))}
                  >
                    <option value="-14">−14 LUFS · YouTube / Facebook</option>
                    <option value="-16">−16 LUFS · podcasts</option>
                    <option value="-19">−19 LUFS · audiobooks</option>
                    <option value="">Peak normalise only</option>
                  </select>
                </div>

                <label className="mb-2 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={subtitles}
                    onChange={(e) => setSubtitles(e.target.checked)}
                    style={{ accentColor: "var(--color-brand)", marginTop: 3 }}
                  />
                  <span className="text-[0.87rem]">Also generate subtitles (SRT + VTT)</span>
                </label>
              </div>
            )}

            <button
              className="btn btn-primary btn-lg mt-4 w-full"
              onClick={generate}
              disabled={busy || !text.trim()}
            >
              <Play size={16} /> Generate
            </button>

            {busy && job && (
              <div className="mt-3.5">
                <div className="bar">
                  <i style={{ width: `${job.progress ?? 0}%` }} />
                </div>
                <div
                  className="mt-2 flex items-center gap-2 text-[0.8rem]"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  <span className="spinner" />
                  <span>{job.stage ?? "Starting…"}</span>
                  <span className="flex-1" />
                  <button className="btn btn-sm btn-ghost" onClick={cancel}>
                    <X size={13} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {busy && !job && (
              <div className="mt-3.5 flex items-center gap-2 text-[0.8rem]" style={{ color: "var(--color-ink-dim)" }}>
                <span className="spinner" /> Queued…
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Slider({
  label, hint, min, max, step, value, onChange, display,
}: {
  label: string;
  hint?: string;
  min: number; max: number; step: number;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div className="mb-4">
      <label className="label">
        {label}
        {hint && <span className="hint ml-1.5 font-normal">· {hint}</span>}
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span
          className="min-w-[52px] text-right font-mono text-[0.8rem] tabular-nums"
          style={{ color: "var(--color-ink-dim)" }}
        >
          {display}
        </span>
      </div>
    </div>
  );
}
