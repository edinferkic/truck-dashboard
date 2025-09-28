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

test("CORS: allowed origin passes", async () => {
  const res = await fetch(`${base}/health`, {
    headers: { Origin: "http://localhost:3000" },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});
