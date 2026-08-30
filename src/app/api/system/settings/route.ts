import { NextResponse } from "next/server";

import { setSetting, getSetting } from "@/lib/db";
import { getSettings, unloadAll, updateSettings } from "@/lib/engines/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KOKORO_DTYPES = new Set(["fp32", "fp16", "q8", "q4"]);
const CLONE_PRECISIONS = new Set(["fp32", "fp16", "q8", "q4"]);

export async function GET() {
  return NextResponse.json({
    ...getSettings(),
    defaultFormat: getSetting("defaultFormat", "mp3"),
    defaultLoudness: getSetting("defaultLoudness", -14),
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const patch: any = {};

  if (typeof body.singleEngine === "boolean") patch.singleEngine = body.singleEngine;
  if (Number.isFinite(body.idleTimeoutMs)) {
    patch.idleTimeoutMs = Math.max(0, Math.min(3_600_000, body.idleTimeoutMs));
  }
  if (KOKORO_DTYPES.has(body.kokoroDtype)) patch.kokoroDtype = body.kokoroDtype;
  if (CLONE_PRECISIONS.has(body.clonePrecision)) patch.clonePrecision = body.clonePrecision;

  const updated = updateSettings(patch);
  setSetting("engineSettings", updated);

  if (typeof body.defaultFormat === "string") setSetting("defaultFormat", body.defaultFormat);
  if (Number.isFinite(body.defaultLoudness)) setSetting("defaultLoudness", body.defaultLoudness);

  return NextResponse.json({ ok: true, settings: updated });
}

export async function DELETE() {
  unloadAll();
  return NextResponse.json({ ok: true, released: true });
}
