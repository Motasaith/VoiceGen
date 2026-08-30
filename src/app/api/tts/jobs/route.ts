import { NextResponse } from "next/server";

import { submit } from "@/lib/jobs";
import { resolveVoice } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Queue a generation and return immediately with a job id to poll. */
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
    const jobId = submit(body, body.title ?? "");
    return NextResponse.json({
      jobId,
      status: "queued",
      engine: resolved.engine,
      voice: resolved.label,
      poll: `/api/jobs/${jobId}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 400 });
  }
}
