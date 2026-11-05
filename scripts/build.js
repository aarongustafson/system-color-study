import { readdir, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { versions, validateCollection, mergeCaptures } from "../model.js";

export const publicFiles = [
  "index.html",
  "test.html",
  "app.js",
  "model.js",
  "sampler.js",
  "styles.css",
  "README.md",
  "PLAN.md",
];

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
  const collection = JSON.stringify({ ...versions, captures }, null, 2) + "\n";
  if (Buffer.byteLength(collection) > 5_000_000) {
    throw new Error(
      "Generated collection exceeds the page's 5 MB loading limit.",
    );
  }
  const sources = await Promise.all(
    publicFiles.map(async (file) => [file, await readFile(join(root, file))]),
  );
  const output = join(root, "dist");
  await rm(output, { recursive: true, force: true });
  await mkdir(output);
  await Promise.all(
    sources.map(([file, source]) => writeFile(join(output, file), source)),
  );
  await writeFile(join(output, "published.json"), collection);
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
