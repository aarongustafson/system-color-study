import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  versions,
  validateCollection,
  mergeCaptures,
  observationCapture,
} from "../model.js";
import { analysisMethod } from "../analysis.js";
import { JSDOM } from "jsdom";
import { createComparisonRenderer } from "../comparison-renderer.js";

export const publicFiles = [
  "index.html",
  "test.html",
  "app.js",
  "results.js",
  "comparison-renderer.js",
  "comparison-ui.js",
  "model.js",
  "analysis.js",
  "sampler.js",
  "environment.js",
  "styles.css",
  "README.md",
  "protocol.html",
];

export function renderIndex(source, captures) {
  const dom = new JSDOM(source);
  try {
    const document = dom.window.document;
    createComparisonRenderer(document).renderTables(captures);
    document.getElementById("capture-count").textContent = String(
      captures.length,
    );
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}

export function renderCapturePage(source, captures) {
  const dom = new JSDOM(source);
  try {
    const data = dom.window.document.getElementById("published-environments");
    if (data?.tagName !== "SCRIPT" || data.type !== "application/json")
      throw new Error(
        "The capture page is missing its published environment lookup.",
      );
    const environments = [
      ...new Map(
        captures.map(({ environment: { browser, os } }) => [
          JSON.stringify([browser, os]),
          { browser, os },
        ]),
      ).values(),
    ].sort(
      (a, b) => a.browser.localeCompare(b.browser) || a.os.localeCompare(b.os),
    );
    data.textContent = JSON.stringify(environments).replaceAll("<", "\\u003c");
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}

async function collections(directory) {
  const found = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Data symlinks are not allowed: ${path}`);
    if (entry.isDirectory()) found.push(...(await collections(path)));
    else if (entry.isFile() && entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

export async function buildSite(root = resolve(import.meta.dirname, "..")) {
  root = resolve(root);
  let captures = [],
    bytes = 0;
  const paths = [
    join(root, "published.json"),
    ...(await collections(join(root, "data"))),
  ];
  for (const path of paths) {
    try {
      const source = await readFile(path, "utf8");
      bytes += Buffer.byteLength(source);
      if (bytes > 5_000_000)
        throw new Error(
          "Committed collections exceed the combined 5 MB input limit.",
        );
      const incoming = validateCollection(JSON.parse(source));
      captures = mergeCaptures(captures, incoming).captures;
    } catch (error) {
      throw new Error(
        `Invalid collection ${relative(root, path)}: ${error.message}`,
        { cause: error },
      );
    }
  }
  captures.sort(
    (a, b) =>
      a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id),
  );
  const collection =
    JSON.stringify(
      { ...versions, captures: captures.map(observationCapture) },
      null,
      2,
    ) + "\n";
  if (Buffer.byteLength(collection) > 5_000_000) {
    throw new Error("Generated collection exceeds the 5 MB import limit.");
  }
  const sources = await Promise.all(
    publicFiles.map(async (file) => {
      const source = await readFile(join(root, file), "utf8");
      return [
        file,
        file === "index.html"
          ? renderIndex(source, captures)
          : file === "test.html"
            ? renderCapturePage(source, captures)
            : source,
      ];
    }),
  );
  const output = join(root, "dist");
  await rm(output, { recursive: true, force: true });
  await mkdir(output);
  await Promise.all(
    sources.map(([file, source]) => writeFile(join(output, file), source)),
  );
  await writeFile(join(output, "published.json"), collection);
  await writeFile(
    join(output, "analysis.json"),
    JSON.stringify(
      { ...analysisMethod, sourceRevision: process.env.GITHUB_SHA ?? null },
      null,
      2,
    ) + "\n",
  );
  await writeFile(join(output, ".nojekyll"), "");
  console.log(
    `Built ${captures.length} captures from ${paths.length} collections into dist/.`,
  );
  return output;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await buildSite();
}
