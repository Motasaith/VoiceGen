import { NextResponse } from "next/server";

import * as A from "@/lib/audio";
import { synthesize, resolveVoice } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long scripts on a laptop CPU can take a while; do not cut them off.
export const maxDuration = 3600;

/**
 * Synchronous generation with one call in and audio bytes out.
 * Best for scripts, n8n, Make and curl. Use /api/tts/jobs for long scripts.
 */
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body?.text?.trim()) {
    return NextResponse.json({ error: "`text` is required." }, { status: 400 });
  }

  try {
    const resolved = resolveVoice(body.voice ?? "af_heart");
    const result = await synthesize(body, undefined, request.signal);
    const encoded = await A.encode(
      result.audio,
      result.sampleRate,
      body.format === "wav" ? "wav" : "mp3",
      body.bitrate ?? 192,
    );

    return new NextResponse(new Uint8Array(encoded.data), {
      headers: {
        "Content-Type": encoded.mime,
        "Content-Disposition": `inline; filename="voicegen.${encoded.format}"`,
        "X-Duration-Seconds": result.duration.toFixed(2),
        "X-Generation-Seconds": result.elapsed.toFixed(2),
        "X-Realtime-Factor": result.realtimeFactor.toFixed(3),
        "X-Voice": resolved.label,
        "X-Engine": resolved.engine,
        "X-Provenance": JSON.stringify(result.provenance),
      },
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    const status = /cancel/i.test(message) ? 499 : /not installed|empty/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
