import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { format, resolveConfig } from "prettier";
import {
  validateSubmission,
  mergeCaptures,
  observationCapture,
} from "../model.js";
import { exportFilename } from "../environment.js";

const repository = "aarongustafson/system-color-study";
const endpoint = `repos/${repository}`;

export async function formatSubmission(source, path) {
  const filepath = resolve(import.meta.dirname, "..", path);
  return format(source, {
    ...(await resolveConfig(filepath, { editorconfig: true })),
    filepath,
  });
}

export function githubAPI(path, method, input) {
  const args = ["api", "--hostname", "github.com", path, "--method", method];
  if (input) args.push("--input", "-");
  const response = execFileSync("gh", args, {
    encoding: "utf8",
    input: input ? JSON.stringify(input) : undefined,
    maxBuffer: 5_000_000,
  });
  return response ? JSON.parse(response) : null;
}

export async function submitCapture(
  file,
  { dryRun = false, api = githubAPI } = {},
) {
  if ((await stat(file)).size > 5_000_000)
    throw new Error("Submit at most 5 MB.");
  const source = await readFile(file);
  if (source.length > 5_000_000) throw new Error("Submit at most 5 MB.");
  const data = JSON.parse(source.toString("utf8"));
  const captures = mergeCaptures([], validateSubmission(data)).captures.map(
    observationCapture,
  );
  if (!captures.length) throw new Error("The submission contains no captures.");
  const timestamp = captures
    .map((capture) => capture.capturedAt)
    .sort()
    .at(-1);
  const hash = createHash("sha256").update(source).digest("hex");
  const filename = exportFilename(captures, timestamp).replace(
    /\.json$/,
    `-${hash}.json`,
  );
  const path = `data/submissions/${filename}`;
  const formatted = await formatSubmission(
    JSON.stringify({ ...data, captures }),
    path,
  );
  if (Buffer.byteLength(formatted) > 5_000_000)
    throw new Error("Formatted submissions must stay within 5 MB.");
  if (dryRun)
    return { repository, path, captures: captures.length, dryRun: true };
  const repo = await api(endpoint, "GET");
  if (!repo.permissions?.push)
    throw new Error(
      "This command needs repository write access. Use the test page's snapshot issue form to contribute data.",
    );
  const base = await api(`${endpoint}/git/ref/heads/main`, "GET");
  const branch = `data/capture-${randomUUID()}`;
  await api(`${endpoint}/git/refs`, "POST", {
    ref: `refs/heads/${branch}`,
    sha: base.object.sha,
  });
  try {
    await api(`${endpoint}/contents/${path}`, "PUT", {
      branch,
      content: Buffer.from(formatted).toString("base64"),
      message:
        "Add reviewed system color captures\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
    });
    const pr = await api(`${endpoint}/pulls`, "POST", {
      base: "main",
      head: branch,
      title: `Add ${captures.length} system color capture${captures.length === 1 ? "" : "s"}`,
      body: `## Data submission\n\nValidated ${captures.length} capture(s) from a locally supplied JSON file.\n\nFile: \`${path}\`\n\nReview browser/OS versions, provenance, and Notes before merging. Existing measurements were preserved; no files on main were changed directly.`,
    });
    return { repository, path, captures: captures.length, url: pr.html_url };
  } catch (error) {
    throw new Error(
      `${error.message}\nSubmission did not finish. Branch ${branch} remains at https://github.com/${repository}/tree/${branch}; review it before retrying.`,
      { cause: error },
    );
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
    },
  });
  if (positionals.length !== 1)
    throw new Error(
      "Usage: npm run submit -- /path/to/capture.json [--dry-run]",
    );
  console.log(
    JSON.stringify(
      await submitCapture(positionals[0], { dryRun: values["dry-run"] }),
      null,
      2,
    ),
  );
}
