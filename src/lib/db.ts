/**
 * Persistence on node:sqlite, built into Node 22.5+, so there is no native
 * module to compile and `npm install` needs no build tools.
 *
 * The connection hangs off globalThis so Next.js hot reload does not open a
 * new handle on every edit.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DATA_DIR, DB_PATH } from "./paths";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  created       REAL NOT NULL,
  updated       REAL NOT NULL,
  status        TEXT NOT NULL,
  engine        TEXT NOT NULL,
  voice         TEXT,
  voice_label   TEXT,
  title         TEXT,
  text          TEXT,
  chars         INTEGER DEFAULT 0,
  params        TEXT,
  progress      REAL DEFAULT 0,
  stage         TEXT,
  error         TEXT,
  output_file   TEXT,
  output_format TEXT,
  duration      REAL DEFAULT 0,
  bytes         INTEGER DEFAULT 0,
  has_subs      INTEGER DEFAULT 0,
  elapsed       REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created DESC);

CREATE TABLE IF NOT EXISTS voices (
  id           TEXT PRIMARY KEY,
  created      REAL NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  description  TEXT,
  profile_file TEXT,
  sample_file  TEXT,
  preview_file TEXT,
  blend        TEXT,
  quality      INTEGER DEFAULT 0,
  report       TEXT,
  consent      INTEGER DEFAULT 0,
  consent_note TEXT,
  tags         TEXT,
  uses         INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_voices_created ON voices(created DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  key       TEXT PRIMARY KEY,
  created   REAL NOT NULL,
  label     TEXT,
  last_used REAL,
  calls     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

const globalRef = globalThis as unknown as { __voicegenDb?: DatabaseSync };

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 10000");
  db.exec(SCHEMA);
  return db;
}

export function getDb(): DatabaseSync {
  return (globalRef.__voicegenDb ??= open());
}

/* ------------------------------------------------------------------ */

const JSON_FIELDS = new Set(["params", "blend", "report", "tags"]);

function hydrate<T extends Record<string, any>>(row: T | undefined): T | null {
  if (!row) return null;
  const out: Record<string, any> = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof out[field] === "string" && out[field]) {
      try { out[field] = JSON.parse(out[field]); } catch { /* leave as text */ }
    }
  }
  return out as T;
}

function serialiseValues(fields: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v === null) out[k] = null;
    else if (typeof v === "boolean") out[k] = v ? 1 : 0;
    else if (typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

export interface JobRow {
  id: string;
  created: number;
  updated: number;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  engine: string;
  voice: string | null;
  voice_label: string | null;
  title: string | null;
  text: string | null;
  chars: number;
  params: any;
  progress: number;
  stage: string | null;
  error: string | null;
  output_file: string | null;
  output_format: string | null;
  duration: number;
  bytes: number;
  has_subs: number;
  elapsed: number;
}

export function createJob(id: string, fields: Partial<JobRow>) {
  const now = Date.now() / 1000;
  getDb()
    .prepare(
      `INSERT INTO jobs (id, created, updated, status, engine, voice, voice_label,
                         title, text, chars, params, stage)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id, now, now,
      fields.status ?? "queued",
      fields.engine ?? "kokoro",
      fields.voice ?? null,
      fields.voice_label ?? null,
      fields.title ?? null,
      fields.text ?? null,
      fields.chars ?? 0,
      JSON.stringify(fields.params ?? {}),
      fields.stage ?? "Queued",
    );
}

export function updateJob(id: string, fields: Partial<JobRow>) {
  const values = serialiseValues({ ...fields, updated: Date.now() / 1000 });
  const keys = Object.keys(values);
  if (!keys.length) return;
  const sql = `UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  getDb().prepare(sql).run(...keys.map((k) => values[k]), id);
}

export function getJob(id: string): JobRow | null {
  return hydrate(getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as any);
}

export function listJobs(limit = 40, offset = 0): JobRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM jobs ORDER BY created DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as any[];
  return rows.map((r) => hydrate(r)!);
}

export function deleteJob(id: string): JobRow | null {
  const job = getJob(id);
  if (job) getDb().prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return job;
}

export function jobStats() {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(duration), 0) AS seconds,
              COALESCE(SUM(chars), 0) AS chars
       FROM jobs WHERE status = 'done'`,
    )
    .get() as any;
  return {
    total: Number(row.total),
    seconds: Math.round(Number(row.seconds) * 10) / 10,
    chars: Number(row.chars),
  };
}

/* ------------------------------------------------------------------ */
/* Voices                                                              */
/* ------------------------------------------------------------------ */

export interface VoiceRow {
  id: string;
  created: number;
  name: string;
  kind: "clone" | "blend";
  description: string | null;
  profile_file: string | null;
  sample_file: string | null;
  preview_file: string | null;
  blend: any;
  quality: number;
  report: any;
  consent: number;
  consent_note: string | null;
  tags: any;
  uses: number;
}

export function createVoice(id: string, fields: Partial<VoiceRow>) {
  getDb()
    .prepare(
      `INSERT INTO voices (id, created, name, kind, description, profile_file,
                           sample_file, preview_file, blend, quality, report,
                           consent, consent_note, tags)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id, Date.now() / 1000,
      fields.name ?? "Untitled",
      fields.kind ?? "clone",
      fields.description ?? "",
      fields.profile_file ?? null,
      fields.sample_file ?? null,
      fields.preview_file ?? null,
      fields.blend ? JSON.stringify(fields.blend) : null,
      fields.quality ?? 0,
      JSON.stringify(fields.report ?? {}),
      fields.consent ? 1 : 0,
      fields.consent_note ?? "",
      JSON.stringify(fields.tags ?? []),
    );
}

export function updateVoice(id: string, fields: Partial<VoiceRow>) {
  const values = serialiseValues(fields);
  const keys = Object.keys(values);
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE voices SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map((k) => values[k]), id);
}

export function getVoice(id: string): VoiceRow | null {
  return hydrate(getDb().prepare("SELECT * FROM voices WHERE id = ?").get(id) as any);
}

export function listVoices(): VoiceRow[] {
  const rows = getDb().prepare("SELECT * FROM voices ORDER BY created DESC").all() as any[];
  return rows.map((r) => hydrate(r)!);
}

export function deleteVoice(id: string): VoiceRow | null {
  const voice = getVoice(id);
  if (voice) {
    for (const file of [voice.profile_file, voice.sample_file, voice.preview_file]) {
      if (file) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
    }
    getDb().prepare("DELETE FROM voices WHERE id = ?").run(id);
  }
  return voice;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function getSetting<T>(key: string, fallback: T): T {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  if (!row) return fallback;
  try { return JSON.parse(row.value) as T; } catch { return fallback; }
}

export function setSetting(key: string, value: unknown) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, JSON.stringify(value));
}
