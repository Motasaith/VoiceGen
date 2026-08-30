import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { getJob } from "@/lib/db";
import { OUTPUT_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!job.has_subs) {
    return NextResponse.json({ error: "Subtitles were not requested for this job." }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format") === "vtt" ? "vtt" : "srt";
  try {
    const text = await fs.readFile(path.join(OUTPUT_DIR, `${id}.${format}`), "utf-8");
    const safe = (job.title ?? "voicegen").replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 60) || "voicegen";
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safe}.${format}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "The subtitle file is missing." }, { status: 410 });
  }
}
