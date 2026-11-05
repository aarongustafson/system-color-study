import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versions } from "../model.js";
import { fixture } from "./fixtures.js";
import { submitCapture } from "../scripts/submit.js";

async function setup(
  t,
  collection = { ...versions, captures: [fixture("submission")] },
) {
  const directory = await mkdtemp(join(tmpdir(), "system-color-submit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "export.json");
  await writeFile(path, JSON.stringify(collection));
  return path;
}

test("dry-run validates and names a submission without any GitHub requests", async (t) => {
  const path = await setup(t);
  const result = await submitCapture(path, {
    dryRun: true,
    api: () => assert.fail("Network request in dry-run"),
  });
  assert.match(
    result.path,
    /^data\/submissions\/system-colors-unit-fixture-fixture-2000-/,
  );
  assert.equal(result.captures, 1);
});

test("submission creates only a data branch, file commit, and PR with authenticated gh API calls", async (t) => {
  const path = await setup(t);
  const requests = [];
  const api = async (path, method, input) => {
    requests.push({ path, method, input });
    if (path.endsWith("/git/ref/heads/main"))
      return { object: { sha: "base-sha" } };
    if (path.endsWith("/git/refs")) return {};
    if (path.includes("/contents/data/submissions/")) return {};
    if (path.endsWith("/pulls"))
      return {
        html_url:
          "https://github.com/aarongustafson/system-color-study/pull/42",
      };
    return { permissions: { push: true } };
  };
  const result = await submitCapture(path, { api });
  assert.match(result.url, /pull\/42$/);
  const commit = requests.find((request) =>
    request.path.includes("/contents/"),
  ).input;
  assert.ok(commit.branch.startsWith("data/capture-"));
  assert.match(commit.message, /Co-authored-by: Copilot/);
  assert.equal(
    JSON.parse(Buffer.from(commit.content, "base64").toString()).captures[0].id,
    "submission",
  );
  const pr = requests.at(-1).input;
  assert.equal(pr.base, "main");
  assert.equal(pr.head, commit.branch);
  assert.equal(
    requests.filter((request) => request.method !== "GET").length,
    3,
  );
});

test("invalid or empty data is rejected before contacting GitHub", async (t) => {
  for (const collection of [
    { schemaVersion: 99 },
    { ...versions, captures: [] },
  ]) {
    const path = await setup(t, collection);
    await assert.rejects(
      submitCapture(path, {
        api: () => assert.fail("Invalid data sent to GitHub"),
      }),
    );
  }
});

test("a failed upload reports its created branch instead of claiming a PR exists", async (t) => {
  const path = await setup(t);
  await assert.rejects(
    submitCapture(path, {
      api: async (path) => {
        if (path.includes("/contents/")) throw new Error("Upload refused");
        if (path.endsWith("/git/ref/heads/main"))
          return { object: { sha: "base-sha" } };
        return { permissions: { push: true } };
      },
    }),
    /Upload refused.*data\/capture-/s,
  );
});
