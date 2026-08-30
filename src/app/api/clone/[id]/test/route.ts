import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import * as A from "@/lib/audio";
import * as clone from "@/lib/engines/clone";
import { getSettings, withEngine } from "@/lib/engines/manager";
import { getVoice, updateVoice } from "@/lib/db";
import { VOICES_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

const DEFAULT_LINE =
  "Here is how my cloned voice sounds. If this reads naturally, the reference recording did its job.";

/** Render a short line in a cloned voice and cache it as the preview. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = getVoice(id);
  if (!record || record.kind !== "clone") {
    return NextResponse.json({ error: "Cloned voice not found." }, { status: 404 });
  }
  if (!record.profile_file) {
    return NextResponse.json({ error: "The profile for this voice is missing. Re-clone it." }, { status: 410 });
  }

  const body = await request.json().catch(() => ({}));
  const line = String(body?.text ?? DEFAULT_LINE).trim().slice(0, 300) || DEFAULT_LINE;

  try {
    const profile = await clone.loadProfile(record.profile_file);
    const audio = await withEngine("clone", () =>
      clone.synthesize(line, profile, {
        precision: getSettings().clonePrecision,
        maxNewTokens: 900,
        signal: request.signal,
      }),
    );

    if (!audio.length) {
      return NextResponse.json(
        { error: "The model produced no audio. Try a different sentence." },
        { status: 500 },
      );
    }

    const clean = A.normaliseLoudness(A.trimSilence(audio, clone.SAMPLE_RATE), clone.SAMPLE_RATE, -14);
    const encoded = await A.encode(clean, clone.SAMPLE_RATE, "mp3", 192);

    const previewFile = path.join(VOICES_DIR, "previews", `${id}.mp3`);
    await fs.mkdir(path.dirname(previewFile), { recursive: true });
    await fs.writeFile(previewFile, encoded.data);
    updateVoice(id, { preview_file: previewFile });

    return new NextResponse(new Uint8Array(encoded.data), {
      headers: { "Content-Type": encoded.mime },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
