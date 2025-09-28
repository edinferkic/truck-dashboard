// server/src/middleware/errorHandler.js
import { logger } from "../logger.js";

export function notFound(req, res, _next) {
  res.status(404).json({ error: "NotFound", path: req.originalUrl });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const payload = {
    error: err.name || "ServerError",
    message: err.message || "Unhandled error",
  };
  if (status >= 500) logger.error({ err }, "Unhandled error");
  res.status(status).json(payload);
}
