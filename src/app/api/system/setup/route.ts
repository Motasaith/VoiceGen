import { NextResponse } from "next/server";

import * as clone from "@/lib/engines/clone";
import * as kokoro from "@/lib/engines/kokoro";
import { getSettings, withEngine } from "@/lib/engines/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/** Progress for whatever install is currently running. */
const globalRef = globalThis as unknown as {
  __voicegenSetup?: Record<string, { status: string; received: number; total: number; label: string; error?: string }>;
};
const progress = (globalRef.__voicegenSetup ??= {});

export async function GET() {
  return NextResponse.json({ progress });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const what = body?.what === "clone" ? "clone" : "kokoro";

  if (progress[what]?.status === "downloading") {
    return NextResponse.json({ started: false, reason: "Already downloading." });
  }
  progress[what] = { status: "downloading", received: 0, total: 0, label: "starting" };

  // Kick the download off and return immediately; the client polls GET.
  void (async () => {
    try {
      if (what === "kokoro") {
        // transformers.js reports progress per file as it downloads.
        await withEngine("kokoro", async () => {
          await kokoro.load(getSettings().kokoroDtype);
        });
      } else {
        await clone.install(getSettings().clonePrecision, (p) => {
          progress.clone = {
            status: "downloading",
            received: p.received,
            total: p.total,
            label: p.label,
          };
        });
      }
      progress[what] = { status: "done", received: 1, total: 1, label: "complete" };
    } catch (err: any) {
      progress[what] = {
        status: "error", received: 0, total: 0, label: "failed",
        error: err?.message ?? String(err),
      };
    }
  })();

  return NextResponse.json({ started: true });
}
