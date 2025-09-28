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

// Disallowed Origin should be rejected by CORS middleware and hit error handler (500)
test("CORS: disallowed origin is rejected", async () => {
  const res = await fetch(`${base}/health`, {
    headers: { Origin: "http://evil.example" },
  });
  // CORS middleware throws, our errorHandler yields 500
  assert.equal(res.status, 500);
  const body = await res.json().catch(() => ({}));
  assert.ok(body.error);
});
