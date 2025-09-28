import pino from "pino";

// Quiet down in tests; override with LOG_LEVEL if needed
const level =
  process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === "test" ? "fatal" : "info");

export const logger = pino({ level });
