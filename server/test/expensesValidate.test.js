import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, closeDb } from "./helpers.js";

let base, server, token;

async function auth() {
  const email = `expv_${Date.now()}@test.local`;
  const password = "StrongPass123";
  await fetch(`${base}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  token = (await login.json()).token;
}

before(async () => { ({ base, server } = await startTestServer()); await auth(); });
after(async () => { await new Promise(r => server.close(r)); await closeDb(); });

test("POST /expenses with invalid body returns 4xx", async () => {
  const res = await fetch(`${base}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ description: "bad" }) // missing required fields
  });
  assert.ok(res.status >= 400 && res.status < 500);
});
