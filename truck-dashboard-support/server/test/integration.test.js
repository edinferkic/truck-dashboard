import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, resetDb, closeDb } from "./helpers.js";

let base, server, token;

async function auth() {
  const email = `flow_${Date.now()}@test.local`;
  const password = "StrongPass123";
  const reg = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (reg.status !== 201 && reg.status !== 200) throw new Error("register failed");
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

test("flow: create load + expense → weekly report", async () => {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Create load (allow 200 or 201)
  const loadBody = {
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
    notes: "Test",
    status: "completed",
  };
  const loadRes = await fetch(`${base}/loads`, {
    method: "POST",
    headers,
    body: JSON.stringify(loadBody),
  });
  assert.ok([200, 201].includes(loadRes.status));
  const load = await loadRes.json();
  assert.equal(Number(load.net_profit), 815);

  // Create expense (allow 200 or 201)
  const expRes = await fetch(`${base}/expenses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      expense_date: "2025-09-15",
      category: "Phone",
      description: "T-Mobile",
      amount: 112.75,
    }),
  });
  assert.ok([200, 201].includes(expRes.status));
  const exp = await expRes.json();
  assert.equal(Number(exp.amount), 112.75);

  // Weekly report (200)
  const repRes = await fetch(`${base}/report/weekly`, {
    method: "POST",
    headers,
    body: JSON.stringify({ from: "2025-09-14", to: "2025-09-20" }),
  });
  assert.equal(repRes.status, 200);
  const rep = await repRes.json();
  assert.equal(Number(rep.loads_net), 815);
  assert.equal(Number(rep.standalone_expenses), 112.75);
  assert.equal(Number(rep.weekly_net), 702.25);
});
