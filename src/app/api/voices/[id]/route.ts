import { NextResponse } from "next/server";

import { deleteVoice, getVoice, updateVoice } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function strip(voice: any) {
  const { profile_file, sample_file, preview_file, ...rest } = voice;
  return { ...rest, hasPreview: Boolean(preview_file) };
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const voice = getVoice(id);
  if (!voice) return NextResponse.json({ error: "Voice not found." }, { status: 404 });
  return NextResponse.json(strip(voice));
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!getVoice(id)) return NextResponse.json({ error: "Voice not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const changes: any = {};
  if (typeof body.name === "string" && body.name.trim()) changes.name = body.name.trim().slice(0, 60);
  if (typeof body.description === "string") changes.description = body.description;
  if (Array.isArray(body.tags)) changes.tags = body.tags;

  if (Object.keys(changes).length) updateVoice(id, changes);
  return NextResponse.json(strip(getVoice(id)));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const voice = deleteVoice(id);
  if (!voice) return NextResponse.json({ error: "Voice not found." }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: id });
}
