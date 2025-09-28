import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, resetDb, closeDb } from "./helpers.js";

let base, server;

before(async () => {
  ({ base, server } = await startTestServer());
  await resetDb();
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeDb();
});

test("register then login yields a JWT", async () => {
  const email = `user_${Date.now()}@test.local`;
  const password = "StrongPass123";

  // register
  const regRes = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.ok([200, 201].includes(regRes.status));
  const reg = await regRes.json();
  assert.match(reg.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);

  // login
  const loginRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginRes.status, 200);
  const login = await loginRes.json();
  assert.match(login.token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.equal(login.user.email, email);
});
