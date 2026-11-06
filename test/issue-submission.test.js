import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicFiles } from "../scripts/build.js";
import { versions } from "../model.js";
import { fixture } from "./fixtures.js";
import {
  parseIssueSubmission,
  publishIssueSubmission,
  checkNewCapture,
  runIssueSubmission,
} from "../scripts/issue-submission.js";

const body = (data) =>
  `### Snapshot data\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`;

test("issue submissions accept one complete snapshot and reject malformed or unconfirmed data", () => {
  const capture = fixture("issue");
  assert.deepEqual(
    parseIssueSubmission(body({ ...versions, captures: [capture] })),
    [capture],
  );
  for (const input of [
    "not JSON",
    body({ schemaVersion: 99 }),
    body({ ...versions, captures: [] }),
    body({ ...versions, captures: [capture, fixture("other")] }),
  ])
    assert.throws(() => parseIssueSubmission(input));
  capture.environment.os = "macOS (reported; verify)";
  assert.throws(
    () => parseIssueSubmission(body({ ...versions, captures: [capture] })),
    /verify/i,
  );
});

async function checkout(t) {
  const root = await mkdtemp(join(tmpdir(), "snapshot-workflow-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  for (const file of publicFiles)
    await writeFile(
      join(root, file),
      await readFile(new URL("../" + file, import.meta.url)),
    );
  await writeFile(
    join(root, "published.json"),
    JSON.stringify({ ...versions, captures: [] }),
  );
  return root;
}

test("the complete issue flow validates a build before a separate publisher opens its data-only PR", async (t) => {
  const validator = await checkout(t),
    publisher = await checkout(t);
  const capture = fixture("workflow");
  const issue = {
    number: 9,
    body: body({ ...versions, captures: [capture] }),
    state: "open",
    labels: [{ name: "color-snapshot" }],
  };
  const eventPath = join(validator, "event.json");
  await writeFile(eventPath, JSON.stringify({ issue }));
  const previous = process.env.GITHUB_EVENT_PATH;
  process.env.GITHUB_EVENT_PATH = eventPath;
  t.after(() => {
    if (previous === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = previous;
  });
  await runIssueSubmission("validate", {
    root: validator,
    api: () => assert.fail("Successful validation needs no GitHub write"),
  });
  const artifact = await readFile(
    join(validator, ".submission/collection.json"),
  );
  assert.deepEqual(JSON.parse(artifact).captures, [capture]);
  await mkdir(join(publisher, ".submission"));
  await writeFile(join(publisher, ".submission/collection.json"), artifact);
  const calls = [];
  await runIssueSubmission("publish", {
    root: publisher,
    api: async (path, method, input) => {
      calls.push({ path, method, input });
      if (path.endsWith("/issues/9")) return issue;
      if (
        path.includes("/pulls?") ||
        path.includes("/matching-refs/") ||
        path.includes("/comments?")
      )
        return [];
      if (path.endsWith("/git/ref/heads/main"))
        return { object: { sha: "main-sha" } };
      if (path.endsWith("/pulls"))
        return {
          html_url:
            "https://github.com/aarongustafson/system-color-study/pull/10",
        };
      return null;
    },
  });
  assert.ok(
    calls.some(
      (c) =>
        c.path.endsWith("/contents/data/submissions/issue-9.json") &&
        c.input.branch === "data/issue-9",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.path.endsWith("/issues/9/comments") &&
        c.input.body.includes("ready for review"),
    ),
  );
  assert.equal(
    JSON.parse(await readFile(join(publisher, "dist/published.json"))).captures
      .length,
    1,
  );
});

test("failed issue validation reports the error without creating a branch or PR", async (t) => {
  const root = await checkout(t);
  const capture = fixture("bad-workflow");
  capture.environment.browser = "Browser; VERIFY";
  const issue = { number: 8, body: body({ ...versions, captures: [capture] }) };
  const eventPath = join(root, "event.json");
  await writeFile(eventPath, JSON.stringify({ issue }));
  const previous = process.env.GITHUB_EVENT_PATH;
  process.env.GITHUB_EVENT_PATH = eventPath;
  t.after(() => {
    if (previous === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = previous;
  });
  const log = t.mock.method(console, "error", () => {});
  const calls = [];
  await assert.rejects(
    runIssueSubmission("validate", {
      root,
      api: async (path, method, input) => {
        calls.push({ path, method, input });
        if (method === "GET") return [];
        return null;
      },
    }),
    /verify/i,
  );
  assert.equal(log.mock.calls.length, 1);
  assert.equal(calls.filter((c) => c.method !== "GET").length, 1);
  assert.ok(calls.at(-1).path.endsWith("/issues/8/comments"));
  assert.match(calls.at(-1).input.body, /failed/);
});

test("issue validation rejects duplicate, conflicting, and oversized collections", () => {
  const capture = fixture("duplicate");
  assert.throws(
    () => checkNewCapture([capture], [capture]),
    /already published/,
  );
  const conflicting = structuredClone(capture);
  conflicting.environment.notes = "Changed";
  assert.throws(() => checkNewCapture([capture], [conflicting]), /conflict/i);
  assert.throws(() => parseIssueSubmission("x".repeat(100_001)), /100 KB/);
});

test("the issue publisher creates only a data file and review PR, then explicitly dispatches CI", async () => {
  const capture = fixture("publish");
  const issue = {
    number: 42,
    body: body({ ...versions, captures: [capture] }),
    state: "open",
    labels: [{ name: "color-snapshot" }],
  };
  const calls = [];
  const api = async (path, method, input) => {
    calls.push({ path, method, input });
    if (path.endsWith("/issues/42")) return issue;
    if (path.includes("/pulls?") || path.includes("/matching-refs/")) return [];
    if (path.endsWith("/git/ref/heads/main"))
      return { object: { sha: "main-sha" } };
    if (path.endsWith("/pulls"))
      return {
        html_url:
          "https://github.com/aarongustafson/system-color-study/pull/43",
      };
    return null;
  };
  const result = await publishIssueSubmission(issue, [capture], api);
  assert.match(result, /pull\/43$/);
  const write = calls.find((c) => c.method === "PUT");
  assert.equal(
    write.path,
    "repos/aarongustafson/system-color-study/contents/data/submissions/issue-42.json",
  );
  assert.equal(write.input.branch, "data/issue-42");
  assert.deepEqual(
    JSON.parse(Buffer.from(write.input.content, "base64")).captures,
    [capture],
  );
  assert.ok(
    calls.some(
      (c) =>
        c.path.endsWith("/actions/workflows/pages.yml/dispatches") &&
        c.input.ref === "data/issue-42",
    ),
  );
  assert.equal(calls.filter((c) => c.method !== "GET").length, 4);
});

test("changed issue data or a branch containing source changes cannot create a PR", async () => {
  const capture = fixture("guard");
  const issue = {
    number: 42,
    body: body({ ...versions, captures: [capture] }),
    state: "open",
    labels: [{ name: "color-snapshot" }],
  };
  await assert.rejects(
    publishIssueSubmission(issue, [fixture("different")], async () => issue),
    /changed during validation/,
  );
  await assert.rejects(
    publishIssueSubmission(issue, [capture], async (path, method) => {
      assert.equal(method, "GET");
      if (path.endsWith("/issues/42")) return issue;
      if (path.includes("/pulls?")) return [];
      if (path.includes("/matching-refs/"))
        return [
          { ref: "refs/heads/data/issue-42", object: { sha: "branch-sha" } },
        ];
      if (path.endsWith("/git/ref/heads/main"))
        return { object: { sha: "main-sha" } };
      return { files: [{ filename: "app.js" }] };
    }),
    /non-submission changes/,
  );
});

test("repeat submissions reuse the open PR and only update changed data", async () => {
  const capture = fixture("repeat");
  const issue = {
    number: 42,
    body: body({ ...versions, captures: [capture] }),
    state: "open",
    labels: [{ name: "color-snapshot" }],
  };
  const path = "data/submissions/issue-42.json";
  let content = Buffer.from(
    JSON.stringify({ ...versions, captures: [capture] }, null, 2) + "\n",
  ).toString("base64");
  const writes = [];
  const api = async (url, method, input) => {
    if (method !== "GET") {
      writes.push({ url, method, input });
      if (method === "PUT") content = input.content;
      return null;
    }
    if (url.endsWith("/issues/42")) return issue;
    if (url.includes("/pulls?"))
      return [
        {
          state: "open",
          html_url:
            "https://github.com/aarongustafson/system-color-study/pull/43",
        },
      ];
    if (url.includes("/matching-refs/"))
      return [{ ref: "refs/heads/data/issue-42", object: { sha: "branch" } }];
    if (url.includes("/git/ref/")) return { object: { sha: "main" } };
    if (url.includes("/compare/"))
      return { files: [{ filename: path, status: "added" }] };
    if (url.includes("/git/trees/"))
      return {
        tree: [{ path, type: "blob", mode: "100644" }],
        truncated: false,
      };
    if (url.includes("/contents/")) return { sha: "file-sha", content };
    assert.fail(url);
  };
  await publishIssueSubmission(issue, [capture], api);
  assert.equal(writes.length, 1);
  assert.match(writes[0].url, /dispatches$/);
  capture.environment.notes = "Corrected metadata";
  issue.body = body({ ...versions, captures: [capture] });
  await publishIssueSubmission(issue, [capture], api);
  assert.equal(writes.filter((call) => call.method === "PUT").length, 1);
  assert.equal(
    writes.find((call) => call.method === "PUT").input.sha,
    "file-sha",
  );
  assert.equal(writes.filter((call) => call.url.endsWith("/pulls")).length, 0);
});

test("closed issues, removed labels, renamed files, and symlinks cannot publish", async () => {
  const capture = fixture("unsafe");
  const issue = {
    number: 42,
    body: body({ ...versions, captures: [capture] }),
    state: "open",
    labels: [{ name: "color-snapshot" }],
  };
  const path = "data/submissions/issue-42.json";
  for (const variant of ["closed", "unlabeled", "rename", "symlink"]) {
    await assert.rejects(
      publishIssueSubmission(issue, [capture], async (url, method) => {
        assert.equal(method, "GET");
        if (url.endsWith("/issues/42"))
          return {
            ...issue,
            state: variant === "closed" ? "closed" : "open",
            labels: variant === "unlabeled" ? [] : issue.labels,
          };
        if (url.includes("/pulls?")) return [];
        if (url.includes("/matching-refs/"))
          return [
            { ref: "refs/heads/data/issue-42", object: { sha: "branch" } },
          ];
        if (url.includes("/git/ref/")) return { object: { sha: "main" } };
        if (url.includes("/compare/"))
          return {
            files: [
              {
                filename: path,
                status: "added",
                ...(variant === "rename"
                  ? { previous_filename: "app.js" }
                  : {}),
              },
            ],
          };
        if (url.includes("/git/trees/"))
          return {
            tree: [{ path, type: "blob", mode: "120000" }],
            truncated: false,
          };
        assert.fail(url);
      }),
      /no longer open|non-submission|regular JSON/,
    );
  }
});
