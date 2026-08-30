"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Trash2, Cpu, HardDrive } from "lucide-react";

import { notifyError, notifyOk } from "@/components/Toast";
import { formatBytes } from "@/lib/format";

const KOKORO_DTYPES: [string, string][] = [
  ["q8", "Quantised · ~90 MB · lowest memory (recommended)"],
  ["fp32", "Full precision · ~180 MB · marginally cleaner, much heavier"],
  ["fp16", "Half precision · ~90 MB"],
  ["q4", "Smallest · ~45 MB · audible quality loss"],
];

const CLONE_PRECISIONS: [string, string][] = [
  ["q8", "Recommended · ~520 MB · closest to full quality on CPU"],
  ["q4", "Smallest · ~320 MB · noticeably rougher"],
  ["fp16", "Larger · ~1 GB · marginal gain on CPU"],
  ["fp32", "Full precision · ~2 GB · too heavy for 8 GB of RAM"],
];

export default function SettingsPage() {
  const [status, setStatus] = useState<any>(null);
  const [setup, setSetup] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status");
      if (!res.ok) throw new Error("Could not read system status");
      setStatus(await res.json());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [load]);

  const pollSetup = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const res = await fetch("/api/system/setup");
        const data = await res.json();
        setSetup(data.progress ?? {});
        const busy = Object.values(data.progress ?? {}).some((p: any) => p.status === "downloading");
        if (!busy) {
          clearInterval(poll.current!);
          poll.current = null;
          load();
        }
      } catch {
        if (poll.current) clearInterval(poll.current);
        poll.current = null;
      }
    }, 1200);
  }, [load]);

  const install = async (what: "kokoro" | "clone") => {
    try {
      const res = await fetch("/api/system/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what }),
      });
      const data = await res.json();
      if (!data.started) { notifyError(data.reason ?? "Already running."); return; }
      notifyOk("Download started. You can leave this page while it continues.");
      pollSetup();
    } catch (err: any) {
      notifyError(err.message);
    }
  };

  const patch = async (body: any, message?: string) => {
    try {
      const res = await fetch("/api/system/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      if (message) notifyOk(message);
      load();
    } catch (err: any) {
      notifyError(err.message);
    }
  };

  const release = async () => {
    await fetch("/api/system/settings", { method: "DELETE" });
    notifyOk("Models released.");
    load();
  };

  if (error) return <div className="alert alert-bad">{error}</div>;
  if (!status) return <div className="flex items-center gap-2"><span className="spinner" /> Loading…</div>;

  const s = status.engines.settings;
  const mem = status.engines.memory;
  const perf = status.performance;

  return (
    <div className="fade-in">
      <header className="mb-8">
        <div className="page-kicker">System</div>
        <h1 className="page-title">Settings</h1>
        <p className="page-description">
          Model files, memory behaviour and output defaults.
        </p>
      </header>

      {/* Models */}
      <section className="card mb-4">
        <h2 className="mb-1 text-[1.05rem] font-semibold">Models</h2>
        <p className="hint mb-4">
          Downloaded once, then everything runs offline. Files live in{" "}
          <span className="font-mono">{status.models.dir}</span>.
        </p>

        {([
          ["kokoro", "Narration voices (Kokoro)", "Required for the Studio. About 90 MB.", status.models.kokoro],
          ["clone", "Voice cloning (Chatterbox-Turbo)", "Only needed for cloning. About 1.1 GB.", status.models.clone],
        ] as const).map(([key, title, desc, model]) => {
          const progress = setup[key];
          const downloading = progress?.status === "downloading";
          const pct = progress?.total ? Math.min(99, (progress.received / progress.total) * 100) : 0;

          return (
            <div
              key={key}
              className="mb-3 flex items-center gap-3.5 rounded-[14px] border p-4"
              style={{ background: "var(--color-surface-2)", borderColor: "var(--color-line)" }}
            >
              <div className="min-w-0 flex-1">
                <h3 className="mb-0.5 text-[0.93rem] font-semibold">{title}</h3>
                <p className="m-0 text-[0.81rem]" style={{ color: "var(--color-ink-dim)" }}>
                  {downloading
                    ? `${progress.label}: ${formatBytes(progress.received)}${progress.total ? ` of ${formatBytes(progress.total)}` : ""}`
                    : model.ready
                      ? `Installed · ${formatBytes(model.bytes)}`
                      : progress?.status === "error"
                        ? progress.error
                        : desc}
                </p>
                {downloading && (
                  <div className="bar mt-2"><i style={{ width: `${pct}%` }} /></div>
                )}
              </div>

              {downloading ? (
                <span className="badge badge-brand">Downloading</span>
              ) : model.ready ? (
                <span className="badge badge-ok">Ready</span>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => install(key)}>
                  <Download size={13} /> {progress?.status === "error" ? "Retry" : "Install"}
                </button>
              )}
            </div>
          );
        })}
      </section>

      {/* Performance */}
      <section className="card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <Cpu size={18} style={{ color: "var(--color-brand)" }} />
          <h2 className="m-0 text-[1.05rem] font-semibold">This machine</h2>
        </div>

        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [`${mem.processMb} MB`, "This app"],
            [`${(mem.systemAvailableMb / 1024).toFixed(1)} GB`, "Free RAM"],
            [`${perf.cores}`, "CPU cores"],
            [
              perf.kokoroRtf ? `${perf.kokoroRtf.toFixed(2)}×` : "Not measured",
              perf.kokoroRtf && perf.kokoroRtf > 1 ? "Slower than real time" : "Render speed",
            ],
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

        <p className="hint">
          {perf.cpu}. Render speed is measured from your own completed jobs, so the
          Studio&apos;s time estimates match this hardware rather than a guess.
        </p>
      </section>

      {/* Memory */}
      <section className="card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive size={18} style={{ color: "var(--color-brand)" }} />
          <h2 className="m-0 text-[1.05rem] font-semibold">Memory</h2>
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={s.singleEngine}
            onChange={(e) => patch({ singleEngine: e.target.checked }, "Memory policy updated.")}
            style={{ accentColor: "var(--color-brand)", marginTop: 3, width: 17, height: 17 }}
          />
          <span className="text-[0.87rem]">
            Keep only one model in memory at a time
            <span className="hint block">
              Switching between narration and cloning reloads the model. This is a few seconds
              slower, but it roughly halves peak memory. Leave this on unless you have
              RAM to spare.
            </span>
          </span>
        </label>

        <div className="mb-4">
          <label className="label">Unload an idle model after</label>
          <select
            className="input"
            value={String(s.idleTimeoutMs)}
            onChange={(e) => patch({ idleTimeoutMs: Number(e.target.value) }, "Idle timeout updated.")}
          >
            <option value="0">Never</option>
            <option value="120000">2 minutes</option>
            <option value="240000">4 minutes</option>
            <option value="600000">10 minutes</option>
            <option value="1800000">30 minutes</option>
          </select>
          <p className="hint mt-1.5">Frees memory back to the operating system when you stop generating.</p>
        </div>

        <button className="btn btn-sm" onClick={release}>
          <Trash2 size={13} /> Release models now
        </button>
      </section>

      {/* Quality */}
      <section className="card mb-4">
        <h2 className="mb-4 text-[1.05rem] font-semibold">Quality</h2>

        <div className="mb-4">
          <label className="label">Kokoro model precision</label>
          <select
            className="input"
            value={s.kokoroDtype}
            onChange={(e) => patch({ kokoroDtype: e.target.value }, "Precision changed. It downloads on next use.")}
          >
            {KOKORO_DTYPES.map(([value, label]) => (
              <option key={value} value={value}>{value.toUpperCase()} · {label}</option>
            ))}
          </select>
          <p className="hint mt-1.5">
            On this CPU the quantised model is both smaller and no slower, so q8 is the
            sensible default.
          </p>
        </div>

        <div>
          <label className="label">Cloning model precision</label>
          <select
            className="input"
            value={s.clonePrecision}
            onChange={(e) => patch({ clonePrecision: e.target.value }, "Cloning precision changed.")}
          >
            {CLONE_PRECISIONS.map(([value, label]) => (
              <option key={value} value={value}>{value.toUpperCase()} · {label}</option>
            ))}
          </select>
        </div>
      </section>

      {/* About */}
      <section className="card">
        <h2 className="mb-3 text-[1.05rem] font-semibold">About</h2>
        <p className="mb-3 text-[0.87rem]" style={{ color: "var(--color-ink-dim)" }}>
          VoiceGen Studio {status.version}. Everything runs on this machine. No account,
          no telemetry, no per-character billing.
        </p>
        {[
          ["Narration", "Kokoro-82M · Apache 2.0 · ONNX Runtime"],
          ["Cloning", "Chatterbox-Turbo · MIT · ONNX Runtime"],
          ["Commercial use", "Permitted by both licences"],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex justify-between border-b py-2 text-[0.85rem] last:border-b-0"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span>{k}</span>
            <span style={{ color: "var(--color-ink-dim)" }}>{v}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
