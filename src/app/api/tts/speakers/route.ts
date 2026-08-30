import { NextResponse } from "next/server";

import { detectSpeakers } from "@/lib/text/chunker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Find [Speaker] tags so the UI can offer a voice slot for each. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ speakers: detectSpeakers(body?.text ?? "") });
}
