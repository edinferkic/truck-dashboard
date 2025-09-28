import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, resetDb, closeDb } from "./helpers.js";

let base, server, token;

async function auth() {
  const email = `list_${Date.now()}@test.local`;
  const password = "StrongPass123";
  const reg = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (![200, 201].includes(reg.status)) throw new Error("register failed");
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
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

test("GET lists: /loads and /expenses return arrays", async () => {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // seed one load
  await fetch(`${base}/loads`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      pickup_date: "2025-09-14",
      delivery_date: "2025-09-15",
      origin: "SLC, UT",
      destination: "Boise, ID",
      miles: 10,
      gross_pay: 100,
      broker_fee: 1,
      fuel_cost: 2,
      tolls: 0,
      maintenance_cost: 0,
      other_costs: 0,
      notes: "list",
      status: "completed",
    }),
  });

  // seed one expense
  await fetch(`${base}/expenses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      expense_date: "2025-09-15",
      category: "Misc",
      description: "list",
      amount: 1.23,
    }),
  });

  // GET loads
  const loadsRes = await fetch(`${base}/loads`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(loadsRes.status, 200);
  const loads = await loadsRes.json();
  assert.ok(Array.isArray(loads));
  assert.ok(loads.length >= 1);

  // GET expenses
  const expRes = await fetch(`${base}/expenses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(expRes.status, 200);
  const exps = await expRes.json();
  assert.ok(Array.isArray(exps));
  assert.ok(exps.length >= 1);
});
