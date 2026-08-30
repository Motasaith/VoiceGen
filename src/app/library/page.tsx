"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Download, Trash2, RefreshCw } from "lucide-react";

import { notifyError } from "@/components/Toast";
import { formatAgo, formatBytes, formatDuration } from "@/lib/format";

const STATUS: Record<string, { cls: string; label: string }> = {
  done: { cls: "badge-ok", label: "Done" },
  running: { cls: "badge-brand", label: "Running" },
  queued: { cls: "", label: "Queued" },
  error: { cls: "badge-bad", label: "Failed" },
  cancelled: { cls: "badge-warn", label: "Cancelled" },
};

export default function LibraryPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs?limit=60");
      if (!res.ok) throw new Error("Could not load the library");
      const next = await res.json();
      setData(next);
      setError(null);

      // Keep polling only while something is actually in flight.
      const active = next.jobs.some((j: any) => j.status === "running" || j.status === "queued");
      if (timer.current) clearTimeout(timer.current);
      if (active) timer.current = setTimeout(load, 1500);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this generation and its audio file?")) return;
    try {
      await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      notifyError(err.message);
    }
  };

  const stats = data?.stats;

  return (
    <div className="fade-in">
      <header className="mb-8">
        <div className="page-kicker">Your work</div>
        <h1 className="page-title">Generations</h1>
        <p className="page-description">
          Everything you have generated. Files stay on this machine until you delete them.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-[0.85rem]" style={{ color: "var(--color-ink-dim)" }}>
        {stats && (
          <>
            <span><strong style={{ color: "var(--color-ink)" }}>{stats.total}</strong> generations</span>
            <span><strong style={{ color: "var(--color-ink)" }}>{formatDuration(stats.seconds)}</strong> of audio</span>
            <span><strong style={{ color: "var(--color-ink)" }}>{stats.chars.toLocaleString()}</strong> characters</span>
          </>
        )}
        <span className="flex-1" />
        <button className="btn btn-sm btn-ghost" onClick={load}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && <div className="alert alert-bad mb-4">{error}</div>}
      {!data && !error && <div className="flex items-center gap-2"><span className="spinner" /> Loading…</div>}

      {data?.jobs?.length === 0 && (
        <div className="py-14 text-center" style={{ color: "var(--color-ink-faint)" }}>
          <h2 className="text-[1.1rem]" style={{ color: "var(--color-ink-dim)" }}>Nothing generated yet</h2>
          <p className="mx-auto mb-4 max-w-[42ch] text-[0.89rem]">
            Everything you create shows up here with its audio, subtitles and settings.
          </p>
          <a className="btn btn-primary" href="/studio">Open the Studio</a>
        </div>
      )}

      {data?.jobs?.map((job: any) => {
        const meta = STATUS[job.status] ?? { cls: "", label: job.status };
        return (
          <div
            key={job.id}
            className="mb-2 flex items-center gap-3.5 rounded-[14px] border px-4 py-3"
            style={{ background: "var(--color-surface)", borderColor: "var(--color-line)" }}
          >
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 truncate text-[0.9rem] font-semibold">
                {job.title || "Untitled"}
              </div>
              <div className="flex flex-wrap gap-3 text-[0.76rem]" style={{ color: "var(--color-ink-dim)" }}>
                <span className={`badge ${meta.cls}`}>{meta.label}</span>
                {job.voice_label && <span>{job.voice_label}</span>}
                {job.duration > 0 && <span>{formatDuration(job.duration)}</span>}
                {job.bytes > 0 && <span>{formatBytes(job.bytes)}</span>}
                <span>{formatAgo(job.created)}</span>
              </div>

              {job.status === "running" && (
                <>
                  <div className="bar mt-2" style={{ height: 4 }}>
                    <i style={{ width: `${job.progress ?? 0}%` }} />
                  </div>
                  <div className="mt-1 text-[0.74rem]" style={{ color: "var(--color-ink-faint)" }}>
                    {job.stage}
                  </div>
                </>
              )}
              {job.status === "error" && (
                <div className="mt-1 text-[0.78rem]" style={{ color: "var(--color-bad)" }}>
                  {job.error}
                </div>
              )}
            </div>

            <div className="flex shrink-0 gap-1.5">
              {job.audioUrl && (
                <>
                  <button
                    className="btn btn-sm"
                    style={{ width: 32, padding: 0 }}
                    onClick={() => new Audio(job.audioUrl).play()}
                    aria-label="Play"
                  >
                    <Play size={14} />
                  </button>
                  <a className="btn btn-sm" style={{ width: 32, padding: 0 }} href={job.downloadUrl} aria-label="Download">
                    <Download size={14} />
                  </a>
                </>
              )}
              {job.srtUrl && <a className="btn btn-sm" href={job.srtUrl}>SRT</a>}
              {(job.status === "running" || job.status === "queued") && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={async () => { await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" }); load(); }}
                >
                  Cancel
                </button>
              )}
              <button
                className="btn btn-sm btn-ghost"
                style={{ width: 32, padding: 0 }}
                onClick={() => remove(job.id)}
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
