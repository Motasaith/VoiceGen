import { NextResponse } from "next/server";

import { CATALOG, LANGUAGE_SUMMARY, PRESET_BLENDS, UNSUPPORTED_NOTE } from "@/lib/catalog";
import { listVoices } from "@/lib/db";
import { isInstalled } from "@/lib/engines/clone";
import { getSettings } from "@/lib/engines/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const saved = listVoices().map((v) => ({
    id: v.id,
    name: v.name,
    kind: v.kind,
    description: v.description,
    blend: v.blend,
    quality: v.quality,
    tags: v.tags,
    created: v.created,
    hasPreview: Boolean(v.preview_file),
  }));

  return NextResponse.json({
    stock: CATALOG,
    presets: PRESET_BLENDS,
    saved,
    languages: LANGUAGE_SUMMARY,
    unsupportedNote: UNSUPPORTED_NOTE,
    cloneReady: await isInstalled(getSettings().clonePrecision),
  });
}
