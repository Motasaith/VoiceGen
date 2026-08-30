import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import * as A from "@/lib/audio";
import { analyseReference, prepareReference } from "@/lib/reference";
import { isInstalled } from "@/lib/engines/clone";
import { getSettings } from "@/lib/engines/manager";
import { UPLOAD_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Accept a reference clip and grade it.
 *
 * The client converts whatever the user picked into WAV using the browser's
 * own decoder before uploading, so this only ever has to parse WAV, which
 * avoids shipping an audio-decoding dependency on the server.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Reference clips are capped at 40 MB. A 15-second recording is all you need." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let decoded: { audio: Float32Array; rate: number };
  try {
    decoded = A.decodeWav(buffer);
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not read that audio. Your browser normally converts uploads to WAV " +
          "automatically. If this keeps happening, export the clip as WAV and try again.",
      },
      { status: 415 },
    );
  }

  const report = analyseReference(decoded.audio, decoded.rate);
  const prepared = prepareReference(decoded.audio, decoded.rate, 24000, 30);

  const uploadId = randomUUID().replace(/-/g, "").slice(0, 12);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(
    path.join(UPLOAD_DIR, `${uploadId}.wav`),
    A.encodeWav(prepared, 24000),
  );

  return NextResponse.json({
    uploadId,
    filename: file.name,
    report,
    preparedDuration: Math.round((prepared.length / 24000) * 100) / 100,
    cloneReady: await isInstalled(getSettings().clonePrecision),
  });
}
