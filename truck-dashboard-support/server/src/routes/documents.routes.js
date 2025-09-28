// server/src/routes/documents.routes.js
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import crypto from "crypto";
import { execa } from "execa";
import { pool } from "../db.js";
import { authGuard } from "../middleware/authGuard.js";

const router = Router();

// -------------------------------
// Paths / helpers
// -------------------------------
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function bin(name, envVar) {
  const envPath = process.env[envVar];
  if (envPath && fs.existsSync(envPath)) return envPath;
  const candidates = [
    `/opt/homebrew/bin/${name}`, // Apple Silicon (brew)
    `/usr/local/bin/${name}`,    // Intel (brew)
    `/usr/bin/${name}`
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return name; // fall back to PATH
}

const TESS = bin("tesseract", "TESSERACT_BIN");
const PDFTOPPM = bin("pdftoppm", "PDFTOPPM_BIN");

// -------------------------------
// Multer (buffer to disk ourselves)
// -------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 25 * 1024 * 1024 }, // 25MB/file
});

// Save file buffer into uploads/YYYY/MM/<userId>/<uuid>-<original>
async function saveToUploads(userId, originalName, mimeType, buffer) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");

  const fname = `${crypto.randomUUID()}-${safeName(originalName)}`;
  const relDir = path.join(yyyy, mm, userId);
  const absDir = path.join(UPLOADS_ROOT, relDir);
  ensureDirSync(absDir);

  const absPath = path.join(absDir, fname);
  await fsp.writeFile(absPath, buffer);

  return {
    absolutePath: absPath,
    storagePath: path.join(relDir, fname),
    sizeBytes: buffer.length,
    sha256,
    mimeType,
    originalName,
  };
}

async function findUserDocOr404(userId, docId, res) {
  const { rows } = await pool.query(
    `SELECT * FROM documents WHERE id=$1 AND user_id=$2`,
    [docId, userId]
  );
  if (!rows.length) {
    res.status(404).json({ error: "NotFound", message: "Document not found" });
    return null;
  }
  return rows[0];
}

// -------------------------------
// OCR helpers
// -------------------------------
async function ocrImage(imagePath) {
  // Write text to stdout
  const args = [
    imagePath,
    "stdout",
    "-l", "eng",
    "--oem", "1",
    "--psm", "6",
    "-c", "preserve_interword_spaces=1",
  ];
  const { stdout } = await execa(TESS, args, { timeout: 90_000 });
  return stdout;
}

async function pdfToPngs(pdfAbsPath) {
  // Produce prefix-1.png, prefix-2.png, ...
  const dir = path.dirname(pdfAbsPath);
  const base = path.parse(pdfAbsPath).name;
  const outPrefix = path.join(dir, base);

  await execa(PDFTOPPM, ["-png", "-r", "300", pdfAbsPath, outPrefix], {
    timeout: 120_000,
  });

  // Collect generated files: <outPrefix>-1.png, -2.png, ...
  const files = await fsp.readdir(dir);
  const imgs = files
    .filter(f => f.startsWith(`${base}-`) && f.endsWith(".png"))
    .map(f => path.join(dir, f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return imgs;
}

async function ocrAny(absPath, mime) {
  const ext = path.extname(absPath).toLowerCase();
  const isPdf = mime === "application/pdf" || ext === ".pdf";
  if (!isPdf) {
    return await ocrImage(absPath);
  }
  const images = await pdfToPngs(absPath);
  let all = "";
  for (const img of images) {
    const t = await ocrImage(img);
    all += (all ? "\n\n" : "") + t;
    // Optionally delete temp page image
    try { await fsp.unlink(img); } catch {}
  }
  return all;
}

// -------------------------------
// Naive data parser
// -------------------------------
const STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
]);

function parseMoney(text) {
  // prefer the largest amount (often total)
  const re = /(?:Total\s*Rate(?:\s*USD)?|Total|Line\s*Haul(?:\s*Rate)?|Rate)\D{0,20}\$?\s*([0-9][0-9,]*(?:\.\d{2})?)/gi;
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const val = Number(m[1].replace(/,/g, ""));
    if (!Number.isNaN(val)) found.push(val);
  }
  if (!found.length) {
    const anyDollar = /\$([0-9][0-9,]*(?:\.\d{2})?)/g;
    let k;
    while ((k = anyDollar.exec(text))) {
      const val = Number(k[1].replace(/,/g, ""));
      if (!Number.isNaN(val)) found.push(val);
    }
  }
  if (!found.length) return null;
  return Math.max(...found);
}

function parseMiles(text) {
  const re = /Miles?\s*[:\-]?\s*([0-9][0-9,]*)/i;
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function parseDates(text) {
  // Capture mm/dd/yy(yy) and yyyy-mm-dd
  const mdys = [...text.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g)].map(x => x[0]);
  const isos = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)].map(x => x[0]);
  const raw = [...new Set([...mdys, ...isos])];

  const toISO = (s) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const [mm, dd, yy] = s.split(/[\/\-]/).map((t) => Number(t));
    const yyyy = yy < 100 ? (yy >= 70 ? 1900 + yy : 2000 + yy) : yy;
    if (!mm || !dd || !yyyy) return null;
    const pad = (n) => String(n).padStart(2, "0");
    return `${yyyy}-${pad(mm)}-${pad(dd)}`;
  };

  const isoset = raw
    .map(toISO)
    .filter(Boolean)
    .sort(); // lexicographic works for YYYY-MM-DD

  const pickup_date = isoset[0] || null;
  const delivery_date = isoset[isoset.length - 1] || null;
  return { pickup_date, delivery_date };
}

function parseStates(text) {
  const tokens = text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.toUpperCase());

  const seen = tokens.filter((t) => STATE_CODES.has(t));
  // try to keep first two distinct
  const uniq = [...new Set(seen)];
  return {
    pickup_state: uniq[0] || null,
    drop_state: uniq[1] || null,
  };
}

function buildSuggestedLabel(user, pickup_state, drop_state, delivery_date) {
  const baseName = (user?.name || user?.email || "Driver")
    .split(/[@._]/)[0]
    .replace(/[^a-zA-Z]/g, "");
  return `${baseName || "Driver"} ${pickup_state || "??"}-${drop_state || "??"} ${delivery_date || "????-??-??"}`;
}

// -------------------------------
// Routes
// -------------------------------

// List documents (optional ?type=rate|bol|other)
router.get("/", authGuard, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const { type } = req.query;
    const params = [userId];
    let sql = `SELECT id, load_id, doc_type, original_name, mime_type, size_bytes, storage_path, created_at
               FROM documents WHERE user_id = $1`;
    if (type && ["rate", "bol", "other"].includes(String(type))) {
      params.push(type);
      sql += ` AND doc_type = $2`;
    }
    sql += " ORDER BY created_at DESC";
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Download by id
router.get("/:id", authGuard, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const doc = await findUserDocOr404(userId, req.params.id, res);
    if (!doc) return;

    const abs = path.join(UPLOADS_ROOT, doc.storage_path);
    if (!fs.existsSync(abs)) {
      return res.status(410).json({ error: "Gone", message: "File missing on disk" });
    }
    res.download(abs, doc.original_name);
  } catch (err) {
    next(err);
  }
});

// Upload one or more documents
router.post("/upload", authGuard, upload.array("files", 10), async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const docType = (req.body.doc_type || "other").toLowerCase();
    const loadId = req.body.load_id || null;

    if (!req.files?.length) {
      return res.status(400).json({ error: "NoFiles", message: "No files uploaded" });
    }

    const saved = [];
    for (const f of req.files) {
      const savedFile = await saveToUploads(userId, f.originalname, f.mimetype, f.buffer);

      const { rows } = await pool.query(
        `INSERT INTO documents (user_id, load_id, doc_type, original_name, mime_type, size_bytes, sha256, storage_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (sha256) DO UPDATE SET
           original_name = EXCLUDED.original_name,
           mime_type     = EXCLUDED.mime_type,
           size_bytes    = EXCLUDED.size_bytes
         RETURNING *`,
        [
          userId,
          loadId,
          ["rate", "bol", "other"].includes(docType) ? docType : "other",
          savedFile.originalName,
          savedFile.mimeType,
          savedFile.sizeBytes,
          savedFile.sha256,
          savedFile.storagePath,
        ]
      );

      saved.push(rows[0]);
    }

    res.status(201).json({
      ok: true,
      count: saved.length,
      documents: saved.map((d) => ({
        id: d.id,
        doc_type: d.doc_type,
        original_name: d.original_name,
        mime_type: d.mime_type,
        size_bytes: d.size_bytes,
        storage_path: d.storage_path,
        load_id: d.load_id,
        created_at: d.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Attach a document to a load
router.post("/:id/attach", authGuard, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const { load_id } = req.body || {};
    if (!load_id) return res.status(400).json({ error: "BadRequest", message: "load_id is required" });

    const doc = await findUserDocOr404(userId, req.params.id, res);
    if (!doc) return;

    // Try to include updated_at; if column is missing, retry without it.
    try {
      const { rows } = await pool.query(
        `UPDATE documents SET load_id=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *`,
        [load_id, doc.id, userId]
      );
      return res.json({ ok: true, document: rows[0] });
    } catch (e) {
      if (e?.code === "42703") {
        const { rows } = await pool.query(
          `UPDATE documents SET load_id=$1 WHERE id=$2 AND user_id=$3 RETURNING *`,
          [load_id, doc.id, userId]
        );
        return res.json({ ok: true, document: rows[0] });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

// OCR extract from a document
router.post("/:id/extract", authGuard, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const doc = await findUserDocOr404(userId, req.params.id, res);
    if (!doc) return;

    const abs = path.join(UPLOADS_ROOT, doc.storage_path);
    if (!fs.existsSync(abs)) {
      return res.status(410).json({ error: "Gone", message: "File missing on disk" });
    }

    const text = await ocrAny(abs, doc.mime_type || path.extname(abs).toLowerCase());
    const gross_pay = parseMoney(text);
    const miles = parseMiles(text);
    const { pickup_date, delivery_date } = parseDates(text);
    const { pickup_state, drop_state } = parseStates(text);

    const suggested_label = buildSuggestedLabel(
      req.user,
      pickup_state,
      drop_state,
      delivery_date
    );

    res.json({
      ok: true,
      document_id: doc.id,
      original_name: doc.original_name,
      textPreview: text.slice(0, 2000), // helpful for debugging
      extracted: {
        gross_pay,
        miles,
        pickup_date,
        delivery_date,
        origin: null,
        destination: null,
        pickup_state,
        drop_state,
        status: pickup_date && delivery_date ? "planned" : "planned",
      },
      suggested_label,
    });
  } catch (err) {
    // Bubble up a compact error
    res.status(500).json({
      error: err?.name || "error",
      message: err?.shortMessage || err?.message || String(err),
    });
  }
});

// Simple HEAD/health for this router
router.get("/healthz/ping", (_req, res) => res.json({ ok: true }));

export default router;
