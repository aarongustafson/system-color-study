import test from "node:test";
import assert from "node:assert/strict";
import { startPreview, captureLocal } from "../scripts/capture-local.js";

test(
  "local capture uses an ephemeral loopback server without exposing repository files or accepting uploads",
  { timeout: 15000 },
  async (t) => {
    const server = await startPreview();
    t.after(() => server.close());
    assert.notEqual(new URL(server.url).port, "0");
    assert.equal((await fetch(server.url + "test.html")).status, 200);
    assert.equal((await fetch(server.url + "environment.js")).status, 200);
    assert.equal((await fetch(server.url + "package.json")).status, 404);
    assert.equal(
      (await fetch(server.url + "published.json", { method: "POST" })).status,
      405,
    );
    assert.equal((await fetch(server.url + "%zz")).status, 400);
  },
);

test("the recorder rejects invalid theme labels before starting browsers", async () => {
  for (const forcedColorTheme of [42, "x".repeat(161)]) {
    await assert.rejects(captureLocal({ forcedColorTheme }), /theme name.*160/);
  }
});
