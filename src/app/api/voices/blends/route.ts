import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CATALOG } from "@/lib/catalog";
import { createVoice, getVoice } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(CATALOG.map((v) => v.id));

/** Save a custom blend as a reusable voice. */
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const name = String(body?.name ?? "").trim();
  const components = body?.components;

  if (!name) return NextResponse.json({ error: "Give the blend a name." }, { status: 400 });
  if (!Array.isArray(components) || components.length < 2) {
    return NextResponse.json({ error: "A blend needs at least two voices." }, { status: 400 });
  }
  if (components.length > 4) {
    return NextResponse.json({ error: "Four voices is the maximum for a blend." }, { status: 400 });
  }
  for (const c of components) {
    if (!VALID.has(c?.voice)) {
      return NextResponse.json({ error: `Unknown voice: ${c?.voice}` }, { status: 400 });
    }
  }

  const id = "vb_" + randomUUID().replace(/-/g, "").slice(0, 10);
  createVoice(id, {
    name,
    kind: "blend",
    description: String(body?.description ?? "") || components.map((c: any) => c.voice).join(" + "),
    blend: components.map((c: any) => ({ voice: c.voice, weight: Number(c.weight) || 1 })),
    quality: 100,
    consent: 1,
    tags: body?.tags ?? [],
  });

  return NextResponse.json(getVoice(id));
}
