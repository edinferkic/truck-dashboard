import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, resetDb, closeDb } from "./helpers.js";

let base, server, token;

async function auth() {
  const email = `upsert_${Date.now()}@test.local`;
  const password = "StrongPass123";
  const reg = await fetch(`${base}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (![200, 201].includes(reg.status)) throw new Error("register failed");
  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const j = await login.json();
  token = j.token;
}

before(async () => {
  ({ base, server } = await startTestServer());
  await resetDb();
  await auth();
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeDb();
});

test("Loads UPSERT: second post updates same signature", async () => {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const body = {
    pickup_date: "2025-09-14",
    delivery_date: "2025-09-15",
    origin: "SLC, UT",
    destination: "Boise, ID",
    miles: 340,
    gross_pay: 1200,
    broker_fee: 120,
    fuel_cost: 250,
    tolls: 0,
    maintenance_cost: 0,
    other_costs: 15,
    notes: "first",
    status: "completed",
  };
  const r1 = await fetch(`${base}/loads`, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal(r1.status, 200);
  const row1 = await r1.json();

  // change a non-unique field (notes) to prove UPDATE happened
  const r2 = await fetch(`${base}/loads`, { method: "POST", headers, body: JSON.stringify({ ...body, notes: "second" }) });
  assert.equal(r2.status, 200);
  const row2 = await r2.json();

  assert.equal(row1.id, row2.id);
  assert.equal(row2.notes, "second");
});
