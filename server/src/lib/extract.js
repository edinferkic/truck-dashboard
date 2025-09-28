// server/src/lib/extract.js
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import os from "os";
import { execa } from "execa";

/**
 * Try pdftotext first (fast, preserves layout).
 * If not available or text is bad, fall back to OCR:
 *   pdftoppm -> tesseract for each page, then join.
 */
async function pdfToText(absPath) {
  // 1) pdftotext
  try {
    const { stdout } = await execa("pdftotext", ["-layout", "-nopgbrk", absPath, "-"]);
    const t = stdout?.trim() || "";
    if (t.length > 100) return t;
  } catch (_) {
    // ignore; we'll try OCR
  }

  // 2) OCR: pdftoppm -> tesseract per page
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-"));
  const base = path.join(tmpDir, "page");
  try {
    await execa("pdftoppm", ["-r", "200", "-jpeg", absPath, base]);
  } catch (err) {
    throw new Error(`pdftoppm failed: ${err?.message || err}`);
  }

  const files = (await fs.readdir(tmpDir))
    .filter((f) => f.startsWith("page-") && f.endsWith(".jpg"))
    .sort();

  let pieces = [];
  for (const f of files) {
    const img = path.join(tmpDir, f);
    try {
      const { stdout } = await execa("tesseract", [img, "-", "-l", "eng"]);
      pieces.push(stdout);
    } catch (err) {
      // keep going; include partial
    }
  }

  // cleanup best effort
  try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch {}

  return pieces.join("\n");
}

async function imageToText(absPath) {
  const { stdout } = await execa("tesseract", [absPath, "-", "-l", "eng"]);
  return stdout || "";
}

function looksPdf(mime, file) {
  return (mime && mime.includes("pdf")) || file.toLowerCase().endsWith(".pdf");
}

export async function readTextFromFile(absPath, mimeType) {
  if (looksPdf(mimeType || "", absPath)) {
    return await pdfToText(absPath);
  }
  return await imageToText(absPath);
}

/** small helpers */
function toNumber(str) {
  if (!str) return undefined;
  const n = Number(String(str).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function toISO(d) {
  if (!d) return undefined;
  // accept 9/23/25, 09-23-2025, 2025-09-23, etc.
  const m = String(d).match(
    /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/
  );
  if (!m) return undefined;
  let y, mm, dd;
  if (m[1]) { y = +m[1]; mm = +m[2]; dd = +m[3]; }
  else { mm = +m[4]; dd = +m[5]; y = +m[6]; if (y < 100) y += 2000; }
  const iso = new Date(Date.UTC(y, mm - 1, dd)).toISOString().slice(0, 10);
  return iso;
}
function pickState(s) {
  const m = String(s).match(/\b(A[LKZR]|C[AOT]|D[CE]|F[LM]|G[AU]|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|P[A]|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])\b/i);
  return m ? m[0].toUpperCase() : undefined;
}
function findCityState(line) {
  // Try "City, ST" first
  let m = line.match(/\b([A-Za-z .'-]{2,}),\s*([A-Za-z]{2})\b/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  // fallback: "... City ST ..."
  m = line.match(/\b([A-Za-z .'-]{2,})\s+([A-Za-z]{2})\b/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  return {};
}

/** Parse core fields out of free text. */
export function parseRateText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const all = lines.join(" \n ");

  // gross pay
  let gross;
  const grossRE = /(?:total(?:\s+rate)?|rate(?:\s*conf)?|gross(?:\s*pay)?|linehaul|amount)[^\n$]*\$\s*([0-9][0-9,\.]*)/i;
  let m = all.match(grossRE);
  if (!m) m = all.match(/\$\s*([0-9][0-9,\.]*)\s*(?:total|amount)/i);
  gross = toNumber(m?.[1]);

  // miles
  let miles;
  const milesRE = /(?:miles|mi)[^\n0-9]*([0-9][0-9,]{1,6})/i;
  const mm = all.match(milesRE);
  if (mm) miles = toNumber(mm[1]);

  // pickup / delivery blocks
  let puIdx = lines.findIndex((l) => /^(pickup|origin|pu)\b/i.test(l));
  if (puIdx === -1) puIdx = lines.findIndex((l) => /(pickup|origin)/i.test(l));
  const puBlock = lines.slice(Math.max(0, puIdx), puIdx + 6).join(" ");

  let doIdx = lines.findIndex((l) => /^(delivery|drop|dropoff|do|consignee)\b/i.test(l));
  if (doIdx === -1) doIdx = lines.findIndex((l) => /(delivery|drop)/i.test(l));
  const doBlock = lines.slice(Math.max(0, doIdx), doIdx + 6).join(" ");

  const puDate = toISO((puBlock.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/) || [])[0]);
  const doDate = toISO((doBlock.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/) || [])[0]);

  const puLoc = findCityState(puBlock);
  const doLoc = findCityState(doBlock);

  return {
    kind: "rate",
    gross_pay: gross,
    miles,
    pickup_date: puDate,
    delivery_date: doDate,
    origin: [puLoc.city, puLoc.state].filter(Boolean).join(", "),
    destination: [doLoc.city, doLoc.state].filter(Boolean).join(", "),
    origin_state: puLoc.state,
    destination_state: doLoc.state,
    raw_preview: lines.slice(0, 60).join("\n")
  };
}

export function parseBOLText(text) {
  // For BOL/POD we mostly want dates + locations
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const all = lines.join(" \n ");

  // Try to find delivery completed date
  const date = toISO((all.match(/\b(?:delivered|delivery|received|date)\D{0,8}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/i) || [])[1]);
  // City/State near "Ship To" / "Consignee" / "Delivery"
  let doIdx = lines.findIndex((l) => /(ship\s*to|consignee|delivery|received)/i.test(l));
  const doBlock = lines.slice(Math.max(0, doIdx), doIdx + 6).join(" ");
  const loc = findCityState(doBlock);

  return {
    kind: "bol",
    delivered_date: date,
    destination: [loc.city, loc.state].filter(Boolean).join(", "),
    destination_state: loc.state,
    raw_preview: lines.slice(0, 60).join("\n")
  };
}

export async function extractAndParseDoc(absPath, mimeType, type = "rate") {
  const text = await readTextFromFile(absPath, mimeType);
  const parsed = (type === "bol" ? parseBOLText : parseRateText)(text || "");
  return { text, parsed };
}

/** Build a suggested human title. */
export function buildSuggestedTitle(first = "", last = "", parsed = {}) {
  const st1 = parsed.origin_state || "";
  const st2 = parsed.destination_state || "";
  const date = parsed.delivery_date || parsed.delivered_date || "";
  const name = [first, last].filter(Boolean).join(" ").trim();
  return [name, st1, st2, date].filter(Boolean).join(" ").trim();
}
