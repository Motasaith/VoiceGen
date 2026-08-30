/** Filesystem layout. Everything the app writes lives under data/. */
import path from "node:path";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const MODELS_DIR = path.join(DATA_DIR, "models");
export const OUTPUT_DIR = path.join(DATA_DIR, "outputs");
export const VOICES_DIR = path.join(DATA_DIR, "voices");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const DB_PATH = path.join(DATA_DIR, "voicegen.db");
