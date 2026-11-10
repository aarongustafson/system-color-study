import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, format } from "prettier";
import { publicFiles } from "../scripts/build.js";
import {
  versions,
  issueSubmissionJSON,
  maxIssueJSONLength,
  pairs,
  pairResult,
} from "../model.js";
import { fixture } from "./fixtures.js";
import {
  parseIssueSubmission,
  publishIssueSubmission,
  checkNewCapture,
  runIssueSubmission,
  verifyApproval,
} from "../scripts/issue-submission.js";

const body = (data) =>
  `### Snapshot data\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\`\n`;

const approvalEvent = (issue) => ({
  action: "created",
  sender: { login: "aarongustafson" },
  issue,
  comment: {
    id: 7,
    user: { login: "aarongustafson" },
    author_association: "OWNER",
    body: "/approve-snapshot",
    issue_url: `https://api.github.com/repos/aarongustafson/system-color-study/issues/${issue.number}`,
  },
});

test("publishing rejects non-approval events before reading data or contacting GitHub", async (t) => {
  const root = await checkout(t);
  const issue = { number: 42 };
  const approved = approvalEvent(issue);
  const events = [
    { issue, action: "opened" },
    { ...approved, action: "edited" },
    { ...approved, sender: { login: "someone-else" } },
    { ...approved, issue: { ...issue, pull_request: {} } },
    {
      ...approved,
      comment: { ...approved.comment, user: { login: "someone-else" } },
    },
    {
      ...approved,
      comment: { ...approved.comment, author_association: "COLLABORATOR" },
    },
    {
      ...approved,
      comment: { ...approved.comment, body: "I approve /approve-snapshot" },
    },
  ];
  const eventPath = join(root, "event.json");
  const previous = process.env.GITHUB_EVENT_PATH;
  const previousName = process.env.GITHUB_EVENT_NAME;
  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_EVENT_NAME = "issue_comment";
  t.after(() => {
    if (previous === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = previous;
    if (previousName === undefined) delete process.env.GITHUB_EVENT_NAME;
    else process.env.GITHUB_EVENT_NAME = previousName;
  });
  for (const event of events) {
    await writeFile(eventPath, JSON.stringify(event));
    await assert.rejects(
      runIssueSubmission("publish", {
        root,
        api: () => assert.fail("Unapproved events must not contact GitHub"),
      }),
      /approval/i,
    );
  }
});

test("approval is fetched again and must still belong to the owner and this issue", async () => {
  const event = approvalEvent({ number: 42 });
  await verifyApproval(event, async (path, method) => {
    assert.match(path, /issues\/comments\/7$/);
    assert.equal(method, "GET");
    return event.comment;
  });
  for (const change of [
    { body: "Approval withdrawn" },
    { user: { login: "someone-else" } },
    { author_association: "COLLABORATOR" },
    {
      issue_url:
        "https://api.github.com/repos/aarongustafson/system-color-study/issues/43",
    },
  ])
    await assert.rejects(
      verifyApproval(event, async () => ({ ...event.comment, ...change })),
      /approval/i,
    );
  await assert.rejects(
    verifyApproval(event, async () => {
      throw new Error("Deleted approval");
    }),
    /Deleted approval/,
  );
});

test("the write-scoped workflow job requires the owner's exact approval comment", async () => {
  const source = await readFile(
    new URL("../.github/workflows/snapshot-issues.yml", import.meta.url),
    "utf8",
  );
  assert.match(source, /issue_comment:\s*\n\s*types: \[created\]/);
  const publish = source.slice(source.indexOf("  publish:"));
  for (const condition of [
    "github.event_name == 'issue_comment'",
    "github.event.comment.user.login == 'aarongustafson'",
    "github.actor == 'aarongustafson'",
    "github.event.comment.author_association == 'OWNER'",
    "github.event.comment.body == '/approve-snapshot'",
    "!github.event.issue.pull_request",
  ])
    assert.ok(publish.includes(condition), condition);
  assert.ok(publish.indexOf("if:") < publish.indexOf("permissions:"));
});

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

test("compact issue JSON preserves all source data without mutating the full export", () => {
  const capture = fixture("compact");
  for (const snapshot of Object.values(capture.schemes))
    snapshot.pairs = pairs.map((pair) => pairResult(pair, snapshot));
  const data = { ...versions, captures: [capture] };
  const original = structuredClone(data);
  const text = issueSubmissionJSON(data);
  assert.equal(text, JSON.stringify(JSON.parse(text)));
  const [submitted] = parseIssueSubmission(
    `${body(JSON.parse(text))}\n### Confirmation\n\n- [x] Reviewed\n`,
  );
  for (const scheme of ["light", "dark"]) {
    assert.equal(submitted.schemes[scheme].pairs, undefined);
    assert.deepEqual(
      pairs.map((pair) => pairResult(pair, submitted.schemes[scheme])),
      capture.schemes[scheme].pairs,
    );
    delete original.captures[0].schemes[scheme].pairs;
  }
  assert.deepEqual(submitted, original.captures[0]);
  assert.ok(capture.schemes.light.pairs.length > 0);
  assert.ok(capture.schemes.dark.pairs.length > 0);
});

test("archived snapshots fit the issue field even with maximum-length plain-text metadata", async (t) => {
  const directory = new URL("../data/", import.meta.url);
  let tested = 0;
  let largest = 0;
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".json")) continue;
    const data = JSON.parse(await readFile(new URL(name, directory), "utf8"));
    for (const capture of data.captures) {
      Object.assign(capture.environment, {
        browser: "B".repeat(160),
        os: "O".repeat(160),
        notes: "N".repeat(2000),
        userAgent: "U".repeat(2000),
        forcedColorTheme: "T".repeat(160),
      });
      const text = issueSubmissionJSON({ ...data, captures: [capture] });
      assert.ok(text.length <= 20_000, name);
      assert.equal(parseIssueSubmission(body(JSON.parse(text))).length, 1);
      largest = Math.max(largest, text.length);
      tested++;
    }
  }
  assert.ok(tested >= 25);
  t.diagnostic(
    `${tested} archived captures; largest issue copy: ${largest} characters`,
  );
});

test("issue JSON accepts the exact field limit and rejects overflow without truncation", () => {
  const data = { ...versions, captures: [fixture("boundary")], padding: "" };
  const base = issueSubmissionJSON(data).length;
  data.padding = "x".repeat(maxIssueJSONLength - base);
  const exact = issueSubmissionJSON(data);
  assert.equal(exact.length, 20_000);
  assert.deepEqual(
    parseIssueSubmission(body(JSON.parse(exact))),
    data.captures,
  );
  data.padding += "x";
  assert.throws(() => issueSubmissionJSON(data), /20,000-character.*Download/);
  assert.throws(
    () =>
      issueSubmissionJSON({
        ...versions,
        captures: [fixture("a"), fixture("b")],
      }),
    /one snapshot/,
  );
});

test("truncated issue JSON explains how to replace it rather than accepting partial data", () => {
  const capture = fixture("truncated");
  const text = JSON.stringify({ ...versions, captures: [capture] }, null, 2);
  assert.throws(
    () =>
      parseIssueSubmission(
        `### Snapshot data\n\n\`\`\`json\n${text.slice(0, 1000)}\n\`\`\`\n`,
      ),
    /incomplete or invalid.*20,000.*Copy JSON/,
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
    api: async (path, method, input) => {
      if (method === "GET") return [];
      assert.match(path, /issues\/9\/comments$/);
      assert.match(input.body, /Awaiting owner approval/);
    },
  });
  assert.equal(
    await check(
      await readFile(join(validator, "data/submissions/issue-9.json"), "utf8"),
      { parser: "json" },
    ),
    true,
    "The validated checkout must contain CI-formatted JSON.",
  );
  const artifact = await readFile(
    join(validator, ".submission/collection.json"),
  );
  assert.deepEqual(JSON.parse(artifact).captures, [capture]);
  await mkdir(join(publisher, ".submission"));
  await writeFile(join(publisher, ".submission/collection.json"), artifact);
  const approved = approvalEvent(issue);
  await writeFile(eventPath, JSON.stringify(approved));
  const previousName = process.env.GITHUB_EVENT_NAME;
  process.env.GITHUB_EVENT_NAME = "issue_comment";
  t.after(() => {
    if (previousName === undefined) delete process.env.GITHUB_EVENT_NAME;
    else process.env.GITHUB_EVENT_NAME = previousName;
  });
  const calls = [];
  await runIssueSubmission("publish", {
    root: publisher,
    api: async (path, method, input) => {
      calls.push({ path, method, input });
      if (path.endsWith("/issues/comments/7")) return approved.comment;
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
  const text = Buffer.from(write.input.content, "base64").toString("utf8");
  assert.equal(
    await check(text, { parser: "json" }),
    true,
    "Issue-generated data must pass CI formatting.",
  );
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
    await format(JSON.stringify({ ...versions, captures: [capture] }), {
      parser: "json",
    }),
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
  content = Buffer.from(
    JSON.stringify({ ...versions, captures: [capture] }, null, 2) + "\n",
  ).toString("base64");
  await publishIssueSubmission(issue, [capture], api);
  assert.equal(
    writes.filter((call) => call.method === "PUT").length,
    2,
    "Repair an existing unformatted submission without creating another PR.",
  );
  assert.equal(
    await check(Buffer.from(content, "base64").toString("utf8"), {
      parser: "json",
    }),
    true,
  );
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
