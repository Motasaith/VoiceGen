import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import * as A from "@/lib/audio";
import * as kokoro from "@/lib/engines/kokoro";
import { getSettings, withEngine } from "@/lib/engines/manager";
import { getVoice } from "@/lib/db";
import { resolveVoice } from "@/lib/pipeline";
import { VOICES_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PREVIEW_DIR = path.join(VOICES_DIR, "previews");
const DEFAULT_TEXT = "This is how I sound. Let me read your script for you.";

/** Short cached sample of a voice or blend, for the picker. */
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const voice = body?.voice ?? "af_heart";
  const text: string = (body?.text ?? DEFAULT_TEXT).slice(0, 220);
  const speed: number = body?.speed ?? 1;

  const fingerprint = crypto
    .createHash("sha1")
    .update(`${JSON.stringify(voice)}|${text}|${speed}|${getSettings().kokoroDtype}`)
    .digest("hex")
    .slice(0, 16);
  const cacheFile = path.join(PREVIEW_DIR, `${fingerprint}.mp3`);

  try {
    const cached = await fs.readFile(cacheFile);
    return new NextResponse(new Uint8Array(cached), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch { /* not cached yet */ }

  let resolved;
  try {
    resolved = resolveVoice(voice);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 400 });
  }

  // Cloned voices are far too slow to render on demand in a picker. Serve the
  // preview made at enrolment instead.
  if (resolved.engine === "clone") {
    const id = typeof voice === "string" ? voice.replace(/^clone:/, "") : "";
    const record = getVoice(id);
    const file = record?.preview_file ?? record?.sample_file;
    if (file) {
      try {
        const data = await fs.readFile(file);
        return new NextResponse(new Uint8Array(data), {
          headers: { "Content-Type": file.endsWith(".mp3") ? "audio/mpeg" : "audio/wav" },
        });
      } catch { /* fall through to the error below */ }
    }
    return NextResponse.json(
      { error: "This cloned voice has no preview yet. Generate with it once to create one." },
      { status: 409 },
    );
  }

  try {
    const audio = await withEngine("kokoro", () =>
      kokoro.synthesize(text, resolved.spec as any, {
        speed,
        dtype: getSettings().kokoroDtype,
      }),
    );

    const clean = A.normalisePeak(A.trimSilence(audio, kokoro.SAMPLE_RATE));
    const encoded = await A.encode(clean, kokoro.SAMPLE_RATE, "mp3", 128);

    await fs.mkdir(PREVIEW_DIR, { recursive: true });
    await fs.writeFile(cacheFile, encoded.data).catch(() => {});

    return new NextResponse(new Uint8Array(encoded.data), {
      headers: { "Content-Type": encoded.mime, "Cache-Control": "public, max-age=86400" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
