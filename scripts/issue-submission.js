import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { versions, validateSubmission, mergeCaptures } from "../model.js";
import { buildSite } from "./build.js";
import { githubAPI } from "./submit.js";

const endpoint = "repos/aarongustafson/system-color-study";
const marker = "<!-- system-color-snapshot-validation -->";

export function parseIssueSubmission(body) {
  if (typeof body !== "string" || Buffer.byteLength(body) > 100_000)
    throw new Error("Paste one snapshot of at most 100 KB.");
  const blocks = [
    ...body.matchAll(
      /^### Snapshot data\s*\n+```json\r?\n([\s\S]*?)\r?\n```(?=\s*(?:###|$))/gm,
    ),
  ];
  if (blocks.length !== 1)
    throw new Error(
      "Use the snapshot issue form and paste JSON into Snapshot data.",
    );
  const captures = validateSubmission(JSON.parse(blocks[0][1]));
  if (captures.length !== 1) throw new Error("Submit one snapshot per issue.");
  return captures;
}

function issueNumber(issue) {
  if (!Number.isSafeInteger(issue.number) || issue.number < 1)
    throw new Error("Invalid issue number.");
  return issue.number;
}

export function checkNewCapture(existing, incoming) {
  const result = mergeCaptures(existing, incoming);
  if (result.duplicates)
    throw new Error(
      "This capture is already published. No new pull request is needed.",
    );
}

function ownerApproval(comment) {
  return (
    comment?.user?.login === "aarongustafson" &&
    comment.author_association === "OWNER" &&
    comment.body === "/approve-snapshot"
  );
}

export async function verifyApproval(event, api = githubAPI) {
  if (
    event.action !== "created" ||
    event.sender?.login !== "aarongustafson" ||
    event.issue?.pull_request ||
    !ownerApproval(event.comment) ||
    !Number.isSafeInteger(event.comment.id) ||
    event.comment.id < 1
  )
    throw new Error(
      "Publishing requires a new owner approval comment: /approve-snapshot.",
    );
  const number = issueNumber(event.issue);
  const current = await api(
    `${endpoint}/issues/comments/${event.comment.id}`,
    "GET",
  );
  if (
    !ownerApproval(current) ||
    current.issue_url !== `https://api.github.com/${endpoint}/issues/${number}`
  )
    throw new Error("The owner approval is no longer valid for this issue.");
}

export async function publishIssueSubmission(issue, captures, api = githubAPI) {
  const number = issueNumber(issue);
  const current = await api(`${endpoint}/issues/${number}`, "GET");
  if (
    current.state !== "open" ||
    !current.labels.some((label) => label.name === "color-snapshot")
  )
    throw new Error(
      "The snapshot issue is no longer open or labeled for submission.",
    );
  if (!isDeepStrictEqual(parseIssueSubmission(current.body), captures))
    throw new Error(
      "The issue data changed during validation. Revalidate it and post a new owner approval comment.",
    );
  const branch = `data/issue-${number}`;
  const path = `data/submissions/issue-${number}.json`;
  const pulls = await api(
    `${endpoint}/pulls?state=all&head=aarongustafson:${encodeURIComponent(branch)}`,
    "GET",
  );
  if (pulls.some((pr) => pr.state !== "open"))
    throw new Error(
      "A pull request for this issue was already closed. Open a new issue for a new observation.",
    );
  const matches = await api(
    `${endpoint}/git/matching-refs/heads/${branch}`,
    "GET",
  );
  const ref = matches.find((item) => item.ref === `refs/heads/${branch}`);
  const base = await api(`${endpoint}/git/ref/heads/main`, "GET");
  let existingFile;
  if (ref) {
    const comparison = await api(
      `${endpoint}/compare/main...${encodeURIComponent(branch)}`,
      "GET",
    );
    if (
      comparison.files.some(
        (file) =>
          file.filename !== path ||
          file.previous_filename ||
          !["added", "modified"].includes(file.status),
      )
    )
      throw new Error(
        "The existing submission branch includes non-submission changes. Review it manually.",
      );
    const tree = await api(
      `${endpoint}/git/trees/${ref.object.sha}?recursive=1`,
      "GET",
    );
    if (tree.truncated)
      throw new Error("Cannot safely inspect the submission branch.");
    const entry = tree.tree.find((file) => file.path === path);
    if (
      entry &&
      (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode))
    )
      throw new Error("The submission must be a regular JSON file.");
    if (entry)
      existingFile = await api(
        `${endpoint}/contents/${path}?ref=${encodeURIComponent(branch)}`,
        "GET",
      );
  } else {
    await api(`${endpoint}/git/refs`, "POST", {
      ref: `refs/heads/${branch}`,
      sha: base.object.sha,
    });
  }
  const text = JSON.stringify({ ...versions, captures }, null, 2) + "\n";
  if (
    !existingFile ||
    Buffer.from(existingFile.content, "base64").toString("utf8") !== text
  )
    await api(`${endpoint}/contents/${path}`, "PUT", {
      branch,
      ...(existingFile ? { sha: existingFile.sha } : {}),
      content: Buffer.from(text).toString("base64"),
      message: `Add validated snapshot from issue #${number}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`,
    });
  const pr =
    pulls[0] ||
    (await api(`${endpoint}/pulls`, "POST", {
      base: "main",
      head: branch,
      title: `Add system color snapshot from issue #${number}`,
      body: `Closes #${number}\n\nThe issue workflow validated the complete snapshot and build before creating this data-only PR. Review the browser/OS details, preference labels, and provenance before merging.\n\nFile: \`${path}\``,
    }));
  await api(`${endpoint}/actions/workflows/pages.yml/dispatches`, "POST", {
    ref: branch,
  });
  return pr.html_url;
}

async function comment(issue, text, api = githubAPI) {
  const number = issueNumber(issue);
  const comments = await api(
    `${endpoint}/issues/${number}/comments?per_page=100`,
    "GET",
  );
  const existing = comments.find(
    (item) =>
      item.user?.login === "github-actions[bot]" &&
      typeof item.body === "string" &&
      item.body.startsWith(marker),
  );
  await api(
    existing
      ? `${endpoint}/issues/comments/${existing.id}`
      : `${endpoint}/issues/${number}/comments`,
    existing ? "PATCH" : "POST",
    { body: `${marker}\n${text}` },
  );
}

async function validateAgainstCheckout(captures, root) {
  await buildSite(root);
  const existing = JSON.parse(
    await readFile(join(root, "dist/published.json"), "utf8"),
  ).captures;
  checkNewCapture(existing, captures);
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const path = join(
    root,
    `data/submissions/issue-${issueNumber(event.issue)}.json`,
  );
  await mkdir(join(root, "data/submissions"), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ ...versions, captures }, null, 2) + "\n",
  );
  await buildSite(root);
}

export async function runIssueSubmission(
  mode,
  { root = resolve(import.meta.dirname, ".."), api = githubAPI } = {},
) {
  if (!["validate", "publish"].includes(mode))
    throw new Error("Use validate or publish.");
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const issue = event.issue;
  issueNumber(issue);
  if (mode === "publish") {
    if (process.env.GITHUB_EVENT_NAME !== "issue_comment")
      throw new Error("Publishing requires an owner approval comment event.");
    await verifyApproval(event, api);
  }
  try {
    const captures =
      mode === "validate"
        ? parseIssueSubmission(issue.body)
        : validateSubmission(
            JSON.parse(
              await readFile(join(root, ".submission/collection.json"), "utf8"),
            ),
          );
    await validateAgainstCheckout(captures, root);
    if (mode === "validate") {
      await mkdir(join(root, ".submission"), { recursive: true });
      await writeFile(
        join(root, ".submission/collection.json"),
        JSON.stringify({ ...versions, captures }),
      );
      if (process.env.GITHUB_EVENT_NAME !== "issue_comment")
        await comment(
          issue,
          "Validation passed. Awaiting owner approval: Aaron can post a new `/approve-snapshot` comment to revalidate this data and create or update its review PR. Editing the issue does not publish it.",
          api,
        );
    } else if (mode === "publish") {
      const url = await publishIssueSubmission(issue, captures, api);
      await comment(
        issue,
        `Validation passed. Your snapshot is ready for review in ${url}.`,
        api,
      );
    } else throw new Error("Use validate or publish.");
  } catch (error) {
    console.error("Snapshot validation/submission failed:", error);
    await comment(
      issue,
      `Validation or submission failed. Correct and save the issue data to revalidate. The owner must post a new /approve-snapshot comment to retry PR creation.\n\n\`\`\`text\n${error.message.slice(0, 2000).replaceAll("```", "'''")}\n\`\`\`\n\nSee the workflow run for details.`,
      api,
    );
    throw error;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  await runIssueSubmission(process.argv[2]);
