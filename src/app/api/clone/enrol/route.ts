import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import * as A from "@/lib/audio";
import * as clone from "@/lib/engines/clone";
import { getSettings, withEngine } from "@/lib/engines/manager";
import { createVoice, getVoice } from "@/lib/db";
import { analyseReference } from "@/lib/reference";
import { UPLOAD_DIR, VOICES_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

/** Turn an uploaded reference into a reusable voice profile. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const name = String(body?.name ?? "").trim();
  const uploadId = String(body?.uploadId ?? "");

  if (!name) return NextResponse.json({ error: "Give the voice a name." }, { status: 400 });
  if (!body?.consent) {
    return NextResponse.json(
      { error: "You must confirm you have permission to clone this voice." },
      { status: 400 },
    );
  }

  const precision = getSettings().clonePrecision;
  if (!(await clone.isInstalled(precision))) {
    return NextResponse.json(
      { error: "The cloning model is not installed yet. Install it from Settings first." },
      { status: 409 },
    );
  }

  const uploadPath = path.join(UPLOAD_DIR, `${uploadId}.wav`);
  let prepared: { audio: Float32Array; rate: number };
  try {
    prepared = A.decodeWav(await fs.readFile(uploadPath));
  } catch {
    return NextResponse.json(
      { error: "That upload has expired. Please upload the clip again." },
      { status: 404 },
    );
  }

  const voiceId = "vc_" + randomUUID().replace(/-/g, "").slice(0, 10);
  const started = Date.now();

  let profile: clone.SpeakerProfile;
  try {
    profile = await withEngine("clone", () => clone.enrol(prepared.audio, precision));
  } catch (err: any) {
    return NextResponse.json(
      { error: `Enrolment failed: ${err?.message ?? String(err)}` },
      { status: 500 },
    );
  }

  const profileFile = path.join(VOICES_DIR, "profiles", `${voiceId}.json`);
  await clone.saveProfile(profile, profileFile);

  const sampleFile = path.join(VOICES_DIR, "samples", `${voiceId}.wav`);
  await fs.mkdir(path.dirname(sampleFile), { recursive: true });
  await fs.writeFile(sampleFile, A.encodeWav(prepared.audio.slice(0, 24000 * 12), 24000));

  createVoice(voiceId, {
    name,
    kind: "clone",
    description: String(body?.description ?? ""),
    profile_file: profileFile,
    sample_file: sampleFile,
    quality: analyseReference(prepared.audio, prepared.rate).score,
    report: analyseReference(prepared.audio, prepared.rate),
    consent: 1,
    consent_note: String(body?.consentNote ?? ""),
    tags: body?.tags ?? [],
  });

  await fs.unlink(uploadPath).catch(() => {});

  const record = getVoice(voiceId)!;
  const { profile_file, sample_file, preview_file, ...safe } = record;

  return NextResponse.json({
    ...safe,
    enrolSeconds: Math.round((Date.now() - started) / 100) / 10,
  });
}
