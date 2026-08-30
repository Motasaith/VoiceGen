import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { jobStats, getSetting } from "@/lib/db";
import { isInstalled, cloneDir } from "@/lib/engines/clone";
import { getSettings, status } from "@/lib/engines/manager";
import { runnerStatus } from "@/lib/jobs";
import { MODELS_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += await dirSize(full);
      else total += (await fs.stat(full)).size;
    }
  } catch { /* not created yet */ }
  return total;
}

export async function GET() {
  const settings = getSettings();
  const hfDir = path.join(MODELS_DIR, "hf");
  const kokoroBytes = await dirSize(hfDir);

  return NextResponse.json({
    app: "VoiceGen Studio",
    version: "1.0.0",
    models: {
      kokoro: { ready: kokoroBytes > 1_000_000, bytes: kokoroBytes, precision: settings.kokoroDtype },
      clone: {
        ready: await isInstalled(settings.clonePrecision),
        bytes: await dirSize(cloneDir(settings.clonePrecision)),
        precision: settings.clonePrecision,
      },
      dir: MODELS_DIR,
    },
    engines: status(),
    jobs: runnerStatus(),
    stats: jobStats(),
    performance: {
      kokoroRtf: getSetting<number | null>("rtf.kokoro", null),
      cloneRtf: getSetting<number | null>("rtf.clone", null),
      cores: require("node:os").cpus().length,
      cpu: require("node:os").cpus()[0]?.model ?? "unknown",
    },
  });
}
