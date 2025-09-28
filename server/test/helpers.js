import http from "node:http";
import { pool } from "../src/db.js";
import app from "../src/app.js";

export async function startTestServer() {
  return await new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ base: `http://127.0.0.1:${port}`, server });
    });
  });
}

export async function resetDb() {
  await pool.query("BEGIN");
  await pool.query("TRUNCATE loads, expenses, users RESTART IDENTITY CASCADE");
  await pool.query("COMMIT");
}

export async function closeDb() {
  await pool.end();
}
