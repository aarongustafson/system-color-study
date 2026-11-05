import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keywords, versions } from "../model.js";
import { buildSite, publicFiles } from "../scripts/build.js";

function fixture(id) {
  const colors = Object.fromEntries(
    keywords.map(({ name }) => [
      name,
      {
        supported: true,
        computed: "rgb(0, 0, 0)",
        rgba: [0, 0, 0, 255],
        hex: "#000000",
        conversion: "rgb-serialization",
      },
    ]),
  );
  return {
    id,
    capturedAt: "2000-01-01T00:00:00.000Z",
    environment: {
      browser: "Unit fixture",
      os: "Fixture",
      notes: "",
      userAgent: "",
      context: "normal",
    },
    media: {
      forcedColors: false,
      prefersColorScheme: "light",
      prefersContrast: "no-preference",
      displayMode: "browser",
    },
    schemes: Object.fromEntries(
      ["light", "dark"].map((scheme) => [
        scheme,
        {
          colors,
          backdrop: "white",
          schemeSupported: true,
          computedColorScheme: scheme,
        },
      ]),
    ),
  };
}

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "system-color-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  for (const file of publicFiles)
    await writeFile(join(root, file), "Public fixture");
  await writeFile(
    join(root, "published.json"),
    JSON.stringify({ ...versions, captures: [] }),
  );
  return root;
}

test("build merges every committed JSON collection and publishes only allowed static files", async (t) => {
  const root = await setup(t);
  const capture = fixture("one");
  const seed = fixture("seed");
  seed.capturedAt = "1999-01-01T00:00:00.000Z";
  await writeFile(
    join(root, "published.json"),
    JSON.stringify({ ...versions, captures: [seed] }),
  );
  await mkdir(join(root, "data/nested"));
  for (const [name, captures] of [
    ["a.json", [capture]],
    ["nested/b.json", [capture, fixture("two")]],
  ]) {
    await writeFile(
      join(root, "data", name),
      JSON.stringify({ ...versions, captures }),
    );
  }
  await writeFile(join(root, "private.txt"), "Do not publish");
  await buildSite(root);
  const result = JSON.parse(
    await readFile(join(root, "dist/published.json"), "utf8"),
  );
  assert.deepEqual(
    result.captures.map((item) => item.id),
    ["seed", "one", "two"],
  );
  assert.deepEqual(
    (await readdir(join(root, "dist"))).sort(),
    [
      ".nojekyll",
      "index.html",
      "test.html",
      "app.js",
      "model.js",
      "sampler.js",
      "styles.css",
      "published.json",
      "README.md",
      "PLAN.md",
    ].sort(),
  );
});

test("invalid or conflicting submissions fail the build instead of disappearing", async (t) => {
  const root = await setup(t);
  await writeFile(join(root, "data/bad.json"), '{"schemaVersion":99}');
  await assert.rejects(buildSite(root), /bad.json/);
  await writeFile(
    join(root, "data/bad.json"),
    JSON.stringify({ ...versions, captures: [fixture("same")] }),
  );
  const changed = fixture("same");
  changed.environment.os = "Different";
  await writeFile(
    join(root, "data/conflict.json"),
    JSON.stringify({ ...versions, captures: [changed] }),
  );
  await assert.rejects(buildSite(root), /conflict/i);
});

test("build rejects capture and input-size limits instead of publishing a partial dataset", async (t) => {
  const root = await setup(t);
  const path = join(root, "data/large.json");
  await writeFile(
    path,
    JSON.stringify({
      ...versions,
      captures: Array.from({ length: 101 }, (_, index) =>
        fixture(`fixture-${index}`),
      ),
    }),
  );
  await assert.rejects(buildSite(root), /100/);
  await writeFile(path, " ".repeat(5_000_001));
  await assert.rejects(buildSite(root), /5 MB/);
});

test("build refuses a generated collection too large for the results page to load", async (t) => {
  const root = await setup(t);
  const capture = fixture("padding");
  capture.extra = Array(550_000).fill(null);
  await writeFile(
    join(root, "data/padded.json"),
    JSON.stringify({ ...versions, captures: [capture] }),
  );
  await assert.rejects(buildSite(root), /Generated collection exceeds/);
});
