/**
 * Background job runner.
 *
 * A single worker processes the queue. That is deliberate: synthesis is CPU-
 * and memory-bound, and two concurrent jobs on four cores make both slower
 * while doubling peak RAM.
 *
 * Progress is written to SQLite and polled by the UI, so a job survives a
 * page refresh and shows up in history even if the tab is closed.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createJob, getJob, getSetting, listJobs, setSetting, updateJob, deleteJob } from "./db";
import { resolveVoice, saveResult, synthesize, type SynthesisRequest } from "./pipeline";
import { OUTPUT_DIR } from "./paths";

interface QueueItem {
  id: string;
  request: Partial<SynthesisRequest>;
  controller: AbortController;
}

interface RunnerState {
  queue: QueueItem[];
  running: boolean;
  current: string | null;
  controllers: Map<string, AbortController>;
}

const globalRef = globalThis as unknown as { __voicegenJobs?: RunnerState };

const state: RunnerState = (globalRef.__voicegenJobs ??= {
  queue: [],
  running: false,
  current: null,
  controllers: new Map(),
});

function existingEngine(id: string): string {
  return getJob(id)?.engine ?? "kokoro";
}

/**
 * Keep a rolling average of how fast this machine actually renders, so the
 * Studio's time estimates match the hardware instead of a guess. Hardware
 * varies enormously. A 2015 laptop and a modern desktop differ by 10x.
 */
function recordRealtimeFactor(engine: string, rtf: number) {
  if (!Number.isFinite(rtf) || rtf <= 0 || rtf > 200) return;
  const key = `rtf.${engine}`;
  const previous = getSetting<number | null>(key, null);
  // Weighted toward history so one odd job does not swing the estimate.
  const next = previous === null ? rtf : previous * 0.7 + rtf * 0.3;
  setSetting(key, Math.round(next * 1000) / 1000);
}

function autoTitle(text: string) {
  const snippet = (text ?? "").split(/\s+/).join(" ").slice(0, 60).trim();
  return snippet ? snippet + (text.length > 60 ? "…" : "") : "Untitled";
}

export function submit(request: Partial<SynthesisRequest>, title = ""): string {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const resolved = resolveVoice(request.voice ?? "af_heart");

  const params = { ...request };
  delete (params as any).text;

  createJob(id, {
    status: "queued",
    engine: resolved.engine,
    voice: JSON.stringify(request.voice ?? "af_heart"),
    voice_label: resolved.label,
    title: title || autoTitle(request.text ?? ""),
    text: request.text ?? "",
    chars: (request.text ?? "").length,
    params,
    stage: "Queued",
  });

  const controller = new AbortController();
  state.controllers.set(id, controller);
  state.queue.push({ id, request, controller });
  void drain();
  return id;
}

async function drain() {
  if (state.running) return;
  state.running = true;

  try {
    while (state.queue.length) {
      const item = state.queue.shift()!;
      const existing = getJob(item.id);
      if (!existing || existing.status === "cancelled") {
        state.controllers.delete(item.id);
        continue;
      }
      await runOne(item);
    }
  } finally {
    state.running = false;
    state.current = null;
  }
}

async function runOne({ id, request, controller }: QueueItem) {
  state.current = id;
  const started = Date.now();
  updateJob(id, { status: "running", stage: "Starting", progress: 1 });

  try {
    const result = await synthesize(
      request,
      (percent, stage) => updateJob(id, { progress: Math.round(percent * 10) / 10, stage }),
      controller.signal,
    );

    const meta = await saveResult(
      result,
      {
        format: (request.format ?? "mp3") as "mp3" | "wav",
        bitrate: request.bitrate ?? 192,
        subtitles: request.subtitles ?? false,
      },
      id,
    );

    updateJob(id, {
      status: "done",
      progress: 100,
      stage: "Complete",
      elapsed: Math.round((Date.now() - started) / 100) / 10,
      ...meta,
    });

    recordRealtimeFactor(existingEngine(id), result.realtimeFactor);

    console.log(
      `[jobs] ${id} finished: ${result.duration.toFixed(1)}s audio in ` +
      `${result.elapsed.toFixed(1)}s (RTF ${result.realtimeFactor.toFixed(2)})`,
    );
  } catch (err: any) {
    const cancelled = controller.signal.aborted || /cancel/i.test(err?.message ?? "");
    updateJob(id, {
      status: cancelled ? "cancelled" : "error",
      stage: cancelled ? "Cancelled" : "Failed",
      error: cancelled ? null : `${err?.name ?? "Error"}: ${err?.message ?? String(err)}`,
      elapsed: Math.round((Date.now() - started) / 100) / 10,
    });
    if (!cancelled) console.error(`[jobs] ${id} failed:`, err);
  } finally {
    state.controllers.delete(id);
    state.current = null;
  }
}

export function cancel(id: string): boolean {
  const job = getJob(id);
  if (!job) return false;

  if (job.status === "queued") {
    state.queue = state.queue.filter((q) => q.id !== id);
    state.controllers.delete(id);
    updateJob(id, { status: "cancelled", stage: "Cancelled" });
    return true;
  }
  if (job.status === "running") {
    state.controllers.get(id)?.abort();
    return true;
  }
  return false;
}

export function runnerStatus() {
  return { current: state.current, queued: state.queue.length, running: state.running };
}

/** Delete generated audio older than the retention window. */
export async function cleanupOldOutputs(days = 30): Promise<number> {
  if (days <= 0) return 0;
  const cutoff = Date.now() / 1000 - days * 86400;
  let removed = 0;

  for (const job of listJobs(10_000)) {
    if (job.created >= cutoff) continue;
    for (const ext of [job.output_format ?? "mp3", "srt", "vtt"]) {
      await fs.unlink(path.join(OUTPUT_DIR, `${job.id}.${ext}`)).catch(() => {});
    }
    deleteJob(job.id);
    removed++;
  }
  return removed;
}
