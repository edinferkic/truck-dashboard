import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://truck:truckpass@localhost:5432/truckdb";

export const pool = new Pool({ connectionString });

export async function query(text, params) {
  return pool.query(text, params);
}
