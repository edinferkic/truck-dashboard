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

test("AuthGuard: invalid token is 401", async () => {
  const res = await fetch(`${base}/loads`, {
    headers: { Authorization: "Bearer not-a-real-token" },
  });
  assert.equal(res.status, 401);
});
