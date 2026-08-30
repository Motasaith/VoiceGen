import { NextResponse } from "next/server";

import { resolveVoice } from "@/lib/pipeline";
import { prepare } from "@/lib/text/chunker";
import { getSetting } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cost preview: chunk count, characters and a duration estimate.
 *
 * The realtime factor is learned from this machine's own history. The first
 * estimate uses a conservative default, and it self-corrects once real jobs
 * have run. Hardware varies far too much for a hardcoded number to be useful.
 */
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const text: string = body?.text ?? "";
  const script = prepare(text, {
    maxChars: body?.maxChunkChars ?? 320,
    paragraphPause: body?.paragraphPause ?? 0.45,
    multiSpeaker: Boolean(body?.multiSpeaker),
  });

  let resolved;
  try {
    resolved = resolveVoice(body?.voice ?? "af_heart");
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 400 });
  }

  const audioSeconds = script.estimatedSeconds / Math.max(0.5, body?.speed ?? 1);
  const measured = getSetting<number | null>(`rtf.${resolved.engine}`, null);
  const rtf = measured ?? (resolved.engine === "kokoro" ? 3 : 60);

  return NextResponse.json({
    engine: resolved.engine,
    voice: resolved.label,
    characters: text.length,
    chunks: script.spoken.length,
    speakers: script.speakers,
    estimatedAudioSeconds: Math.round(audioSeconds * 10) / 10,
    estimatedGenerationSeconds: Math.round(audioSeconds * rtf),
    realtimeFactor: Math.round(rtf * 100) / 100,
    measured: measured !== null,
    warning:
      resolved.engine === "clone" && audioSeconds > 8
        ? "Cloned voices are dramatically slower than the built-in ones on CPU. Expect roughly an hour per minute of audio. Use a built-in voice for anything long."
        : audioSeconds * rtf > 900
          ? "This is a long render. It runs in the background, so you can leave the page."
          : null,
  });
}
