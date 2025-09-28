// server/src/migrate.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied() {
  const { rows } = await pool.query(`SELECT name FROM migrations`);
  return new Set(rows.map(r => r.name));
}

async function main() {
  const dir = path.resolve(__dirname, "../migrations");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

  await ensureMigrationsTable();
  const applied = await getApplied();

  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    console.log(`Running migration: ${f}`);
    await pool.query(sql);
    await pool.query(`INSERT INTO migrations(name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [f]);
  }

  console.log("Migration complete ✅");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
