// server/src/index.js
import "dotenv/config";
import app from "./app.js";
import { logger } from "./logger.js";
import { pool } from "./db.js";

process.title = "truck-dashboard-server";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.SERVER_PORT || 4000);

const server = app.listen(PORT, HOST, () => {
  logger.info(
    {
      env: process.env.NODE_ENV || "development",
      host: HOST,
      port: PORT,
    },
    `API listening at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`
  );
});

// ----- Robust shutdown handling -----
async function shutdown(signal = "SIGTERM") {
  try {
    logger.info({ signal }, "Shutting down gracefully…");

    // Stop accepting new connections
    await new Promise((resolve) => server.close(resolve));

    // Drain and close DB pool
    await pool.end();
    logger.info("DB pool closed. Bye 👋");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Shutdown error, forcing exit");
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason, p) => {
  logger.error({ reason, promise: p }, "Unhandled Rejection");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception");
  // optional: attempt graceful shutdown
  shutdown("UNCAUGHT_EXCEPTION");
});
