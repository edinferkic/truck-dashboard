import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, closeDb } from "./helpers.js";

let base, server;

before(async () => { ({ base, server } = await startTestServer()); });
after(async () => { await new Promise(r => server.close(r)); await closeDb(); });

test("login with wrong password returns 401", async () => {
  const email = `badpw_${Date.now()}@test.local`;
  const password = "StrongPass123";
  const reg = await fetch(`${base}/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.ok([200,201].includes(reg.status));

  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "WrongPass" })
  });
  assert.equal(login.status, 401);
});
