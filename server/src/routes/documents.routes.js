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

// Parsers
import { parseRateText, buildSuggestedLabel as buildRateLabel } from "../lib/ocr/parseRate.js";
import { parseBOLText } from "../lib/ocr/parseBOL.js";

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
    `/usr/bin/${name}`,
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return name; // fall back to PATH
}

const TESS = bin("tesseract", "TESSERACT_BIN");
const PDFTOPPM = bin("pdftoppm", "PDFTOPPM_BIN");

const userLabelFrom = (u) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(" ") ||
  u?.name ||
  (u?.email ? u.email.split("@")[0] : "") ||
  "you";

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
  const dir = path.dirname(pdfAbsPath);
  const base = path.parse(pdfAbsPath).name;
  const outPrefix = path.join(dir, base);

  await execa(PDFTOPPM, ["-png", "-r", "300", pdfAbsPath, outPrefix], {
    timeout: 120_000,
  });

  const files = await fsp.readdir(dir);
  const imgs = files
    .filter((f) => f.startsWith(`${base}-`) && f.endsWith(".png"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return imgs;
}

async function ocrAny(absPath, mime) {
  const ext = path.extname(absPath).toLowerCase();
  const isPdf = mime === "application/pdf" || ext === ".pdf";
  if (!isPdf) return await ocrImage(absPath);

  const images = await pdfToPngs(absPath);
  let all = "";
  for (const img of images) {
    const t = await ocrImage(img);
    all += (all ? "\n\n" : "") + t;
    try { await fsp.unlink(img); } catch {}
  }
  return all;
}

// -------------------------------
// Routes
// -------------------------------

// List documents (optional ?type=rate|bol|pod|other)
router.get("/", authGuard, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const { type } = req.query;
    const params = [userId];
    let sql = `SELECT id, load_id, doc_type, original_name, mime_type, size_bytes, storage_path, created_at
               FROM documents WHERE user_id = $1`;
    if (type && ["rate", "bol", "pod", "other"].includes(String(type))) {
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
          ["rate", "bol", "pod", "other"].includes(docType) ? docType : "other",
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
router.post("/:id/extract", authGuard, async (req, res) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const doc = await findUserDocOr404(userId, req.params.id, res);
    if (!doc) return;

    const abs = path.join(UPLOADS_ROOT, doc.storage_path);
    if (!fs.existsSync(abs)) {
      return res.status(410).json({ error: "Gone", message: "File missing on disk" });
    }

    const text = await ocrAny(abs, doc.mime_type || path.extname(abs).toLowerCase());

    let extracted;
    switch (doc.doc_type) {
      case "rate":
        extracted = parseRateText(text);
        break;
      case "bol":
      case "pod":
      default:
        extracted = parseBOLText(text);
        break;
    }

    // Label
    const userLabel = userLabelFrom(req.user);
    const labelDate = extracted.delivery_date || extracted.pickup_date || "";
    const suggested_label =
      doc.doc_type === "rate"
        ? (typeof buildRateLabel === "function" ? buildRateLabel(extracted, userLabel) : `${userLabel} ${extracted.pickup_state || "XX"} ${extracted.drop_state || "XX"} ${labelDate}`.trim())
        : `${userLabel} ${extracted.pickup_state || "XX"} ${extracted.drop_state || "XX"} ${labelDate}`.trim();

    res.json({
      ok: true,
      document_id: doc.id,
      original_name: doc.original_name,
      textPreview: text.slice(0, 2000),
      extracted,
      suggested_label,
    });
  } catch (err) {
    res.status(500).json({
      error: err?.name || "error",
      message: err?.shortMessage || err?.message || String(err),
    });
  }
});

// Create/update a load from this document's OCR and attach the doc
// Supports overrides via JSON body: { delivery_date, pickup_date, origin, destination, miles, gross_pay, status, pickup_state, drop_state, load_id }
router.post("/:id/to-load", authGuard, async (req, res) => {
  try {
    const userId = req.user?.id || req.auth?.id || req.user_id;
    const doc = await findUserDocOr404(userId, req.params.id, res);
    if (!doc) return;

    const abs = path.join(UPLOADS_ROOT, doc.storage_path);
    if (!fs.existsSync(abs)) {
      return res.status(410).json({ error: "Gone", message: "File missing on disk" });
    }

    const text = await ocrAny(abs, doc.mime_type || path.extname(abs).toLowerCase());

    // Parse by type
    let extracted;
    switch (doc.doc_type) {
      case "rate":
        extracted = parseRateText(text);
        break;
      case "bol":
      case "pod":
      default:
        extracted = parseBOLText(text);
        break;
    }

    // ----- OVERRIDES from body -----
    const ov = req.body || {};
    const todayISO = new Date().toISOString().slice(0, 10);

    const final = {
      pickup_state:   ov.pickup_state   ?? extracted.pickup_state,
      drop_state:     ov.drop_state     ?? extracted.drop_state,
      origin:         ov.origin         ?? extracted.origin,
      destination:    ov.destination    ?? extracted.destination,
      miles:          ov.miles          ?? extracted.miles ?? 0,
      gross_pay:      ov.gross_pay      ?? extracted.gross_pay ?? 0,
      status:         ov.status         ?? extracted.status ?? "planned",
      pickup_date:    ov.pickup_date    ?? extracted.pickup_date,
      delivery_date:  ov.delivery_date  ?? extracted.delivery_date,
    };

    // Safety defaults for strict schemas (ensure dates never null)
    if (!final.pickup_date && final.delivery_date) final.pickup_date = final.delivery_date;
    if (!final.delivery_date && final.pickup_date) final.delivery_date = final.pickup_date;
    if (!final.pickup_date && !final.delivery_date) {
      final.pickup_date = todayISO;
      final.delivery_date = todayISO;
    }

    // Label
    const userLabel = userLabelFrom(req.user);
    const fallbackLabel = `${userLabel} ${final.pickup_state || "XX"} ${final.drop_state || "XX"} ${final.delivery_date || final.pickup_date || ""}`.trim();
    const label =
      doc.doc_type === "rate"
        ? ((typeof buildRateLabel === "function" ? buildRateLabel(extracted, userLabel) : null) || fallbackLabel)
        : fallbackLabel;

    // Upsert load
    const loadId = ov.load_id || crypto.randomUUID();
    const upsertSql = `
      INSERT INTO loads (id, user_id, label, pickup_state, drop_state, origin, destination,
                         pickup_date, delivery_date, miles, gross_pay, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        label         = COALESCE(EXCLUDED.label,         loads.label),
        pickup_state  = COALESCE(EXCLUDED.pickup_state,  loads.pickup_state),
        drop_state    = COALESCE(EXCLUDED.drop_state,    loads.drop_state),
        origin        = COALESCE(EXCLUDED.origin,        loads.origin),
        destination   = COALESCE(EXCLUDED.destination,   loads.destination),
        pickup_date   = COALESCE(EXCLUDED.pickup_date,   loads.pickup_date),
        delivery_date = COALESCE(EXCLUDED.delivery_date, loads.delivery_date),
        miles         = COALESCE(EXCLUDED.miles,         loads.miles),
        gross_pay     = COALESCE(EXCLUDED.gross_pay,     loads.gross_pay),
        status        = COALESCE(EXCLUDED.status,        loads.status),
        updated_at    = NOW()
      RETURNING *;
    `;
    const vals = [
      loadId, userId, label,
      final.pickup_state, final.drop_state,
      final.origin, final.destination,
      final.pickup_date, final.delivery_date,
      final.miles, final.gross_pay, final.status,
    ];
    const { rows: [load] } = await pool.query(upsertSql, vals);

    // Mirror legacy column (if present), then re-fetch full row
    try {
      await pool.query(
        `UPDATE loads SET dropoff_state=$1, updated_at=NOW() WHERE id=$2`,
        [final.drop_state || null, load.id]
      );
    } catch (e) {
      if (e?.code !== "42703") throw e;
    }
    const { rows: [loadFull] } = await pool.query(`SELECT * FROM loads WHERE id=$1`, [load.id]);

    // Attach this doc
    try {
      await pool.query(
        `UPDATE documents SET load_id=$1, updated_at=NOW() WHERE id=$2 AND user_id=$3`,
        [load.id, doc.id, userId]
      );
    } catch (e) {
      if (e?.code !== "42703") throw e;
      await pool.query(`UPDATE documents SET load_id=$1 WHERE id=$2 AND user_id=$3`, [load.id, doc.id, userId]);
    }

    res.json({ ok: true, load: loadFull, attached_document_id: doc.id, extracted, suggested_label: label });
  } catch (err) {
    res.status(500).json({
      error: err?.name || "error",
      message: err?.shortMessage || err?.message || String(err),
    });
  }
});

// Simple HEAD/health for this router
router.get("/healthz/ping", (_req, res) => res.json({ ok: true }));

export default router;
