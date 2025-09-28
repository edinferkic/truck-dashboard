// server/src/lib/storage.js
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.env.UPLOADS_DIR || "uploads";

export function safeName(name = "file") {
  const clean = name
    .replace(/[/\\?%*:|"<>]/g, "_") // remove path-ish chars
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 180) || "file";
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// Save a Buffer to disk under uploads/YYYY/MM/<userId>/<uuid>-<filename>
export async function saveBuffer({ buffer, mimeType, originalName, userId }) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");

  const fname = `${crypto.randomUUID()}-${safeName(originalName)}`;
  const rel = path.join(yyyy, mm, userId, fname);
  const abs = path.join(ROOT, rel);

  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, buffer);

  return {
    absolutePath: abs,
    storagePath: rel,
    sizeBytes: buffer.length,
    sha256,
    mimeType,
    originalName,
  };
}
