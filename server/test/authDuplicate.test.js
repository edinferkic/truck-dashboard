import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, closeDb } from "./helpers.js";

let base, server;

before(async () => { ({ base, server } = await startTestServer()); });
after(async () => { await new Promise(r => server.close(r)); await closeDb(); });

test("registering the same email twice yields error (not 2xx)", async () => {
  const email = `dup_${Date.now()}@test.local`;
  const password = "StrongPass123";
  const first = await fetch(`${base}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.ok([200,201].includes(first.status));
  const second = await fetch(`${base}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.ok(second.status >= 400 && second.status < 600);
});
