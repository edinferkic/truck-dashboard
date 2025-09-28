import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, closeDb } from "./helpers.js";

let base, server;

before(async () => {
  ({ base, server } = await startTestServer());
});

after(async () => {
  await new Promise((r) => server.close(r));
  await closeDb();
});

test("AuthGuard: request without token is 401", async () => {
  const res = await fetch(`${base}/loads`); // no Authorization header
  assert.equal(res.status, 401);
  const body = await res.json().catch(() => ({}));
  // your middleware likely returns one of these keys—assert one exists:
  assert.ok(body.error || body.message);
});
