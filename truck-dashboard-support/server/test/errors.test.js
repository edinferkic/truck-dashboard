import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, closeDb } from "./helpers.js";

let base, server, token;

async function auth() {
  const email = `err_${Date.now()}@test.local`;
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
  await auth();
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeDb();
});

test("404: unknown route returns NotFound", async () => {
  const res = await fetch(`${base}/__no_such_route__`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "NotFound");
});

// Hit a protected route WITH token but with a malformed body to force a DB error -> 500
test("500: server error path returns error JSON", async () => {
  const res = await fetch(`${base}/loads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // missing required fields + bad types -> DB will throw
    body: JSON.stringify({ origin: "X", miles: "NaN" }),
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.ok(body.error);
  assert.ok(body.message);
});
