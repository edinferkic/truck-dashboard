// server/src/app.js
import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./logger.js";

// Feature routes
import authRoutes from "./routes/auth.routes.js";
import loadsRoutes from "./routes/loads.routes.js";
import expensesRoutes from "./routes/expenses.routes.js";
import reportRoutes from "./routes/report.routes.js";      // POST /report/weekly
import documentsRoutes from "./routes/documents.routes.js"; // NEW: uploads, list, extract, attach

const app = express();

// Trust upstream proxies (Docker, Render, etc.)
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" })); // harmless for JSON; useful for simple forms

// ---- CORS ----
const defaultOrigins = ["http://localhost:3000", "http://localhost:3001"];
const allowList = (process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : defaultOrigins
)
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Allow same-origin/CLI tools with no Origin header
    if (!origin) return cb(null, true);
    if (allowList.includes(origin)) return cb(null, true);
    cb(new Error("CORS not allowed from origin"));
  },
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

// ---- Helmet (secure-ish defaults for local dev) ----
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);

// ---- Rate limiting ----
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ---- Health ----
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "truck-dashboard-server",
    env: process.env.NODE_ENV || "development",
    tz: process.env.TZ || "America/Denver",
    now: new Date().toISOString(),
  });
});

// ---- Routes ----
app.use("/auth", authRoutes);
app.use("/loads", loadsRoutes);
app.use("/expenses", expensesRoutes);
app.use("/report", reportRoutes);       // POST /report/weekly
app.use("/documents", documentsRoutes); // upload/list/download/extract/attach

// ---- 404 + error handler ----
app.use(notFound);
app.use(errorHandler);

// Log what we allowed (handy during tests)
logger.debug({ allowList }, "Security middleware initialized");

export default app;
