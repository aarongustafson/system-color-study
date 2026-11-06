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
import { versions } from "../model.js";
import { JSDOM } from "jsdom";
import { buildSite, publicFiles } from "../scripts/build.js";
import { fixture } from "./fixtures.js";

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "system-color-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  for (const file of publicFiles)
    await writeFile(
      join(root, file),
      file === "index.html"
        ? await readFile(new URL("../index.html", import.meta.url))
        : "Public fixture",
    );
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
      "results.js",
      "comparison-renderer.js",
      "comparison-ui.js",
      "model.js",
      "sampler.js",
      "environment.js",
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

test("build writes comparison values and metadata into HTML without a browser-side collection load", async (t) => {
  const root = await setup(t);
  const capture = fixture("static");
  capture.environment.notes = "Built into the document";
  await writeFile(
    join(root, "data/static.json"),
    JSON.stringify({ ...versions, captures: [capture] }),
  );
  await buildSite(root);
  const html = await readFile(join(root, "dist/index.html"), "utf8");
  assert.ok(
    html.includes('id="capture-count">1</span>'),
    "The built introductory paragraph must contain the snapshot count.",
  );
  assert.match(html, /<code>#000000<\/code>/);
  assert.match(html, /Built into the document/);
  assert.match(html, /<tbody(?=[^>]*data-deprecated)(?=[^>]*hidden)[^>]*>/);
  assert.doesNotMatch(html, /src="\.\/app\.js"/);
});

test("static comparisons retain both row groups, shared dialogs, safe text, and native header associations", async (t) => {
  const root = await setup(t);
  const normal = fixture("normal");
  normal.environment.browser = 'Browser <img src=x onerror="alert(1)">';
  normal.environment.notes = "</dialog><script>alert(1)</script>";
  normal.schemes.light.colors.Canvas.computed = '" onmouseover="alert(1)';
  const forced = fixture("forced");
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = 'Palette </th><img src="x">';
  await writeFile(
    join(root, "data/static.json"),
    JSON.stringify({ ...versions, captures: [normal, forced] }),
  );
  await buildSite(root);
  const dom = new JSDOM(await readFile(join(root, "dist/index.html"), "utf8"));
  t.after(() => dom.window.close());
  const document = dom.window.document;
  assert.equal(document.querySelectorAll("img, [onmouseover]").length, 0);
  assert.equal(document.querySelectorAll("script").length, 1);
  assert.ok(
    document
      .getElementById("capture-dialogs")
      .textContent.includes(normal.environment.notes),
  );
  const canvas = [
    ...document.getElementById("individual-table").tBodies[0].rows,
  ].find((row) => row.cells[0].textContent === "Canvas");
  assert.equal(
    canvas.cells[1].title,
    normal.schemes.light.colors.Canvas.computed,
  );
  const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const table of document.querySelectorAll("table")) {
    const paired = table.id.endsWith("pair-table");
    assert.equal(table.hidden, false);
    assert.equal(table.tBodies.length, 2);
    assert.equal(table.tBodies[0].rows.length, paired ? 20 : 19);
    assert.equal(table.tBodies[1].rows.length, paired ? 10 : 23);
    assert.ok(table.tBodies[1].hasAttribute("data-deprecated"));
    assert.equal(table.tBodies[1].hidden, true);
    for (const cell of table.querySelectorAll("td")) {
      for (const id of cell.getAttribute("headers").split(" ")) {
        const heading = document.getElementById(id);
        assert.equal(heading?.tagName, "TH");
        assert.equal(heading.closest("table"), table);
      }
      if (cell.rowSpan === 2) assert.ok(cell.parentElement.nextElementSibling);
    }
    for (const button of table.querySelectorAll("button[commandfor]")) {
      const dialog = document.getElementById(button.getAttribute("commandfor"));
      assert.equal(dialog?.tagName, "DIALOG");
      assert.ok(dialog.lastElementChild.hasAttribute("autofocus"));
      assert.equal(dialog.lastElementChild.getAttribute("command"), "close");
    }
  }
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

test("build refuses a generated collection too large to import on the test page", async (t) => {
  const root = await setup(t);
  const capture = fixture("padding");
  capture.extra = Array(550_000).fill(null);
  await writeFile(
    join(root, "data/padded.json"),
    JSON.stringify({ ...versions, captures: [capture] }),
  );
  await assert.rejects(buildSite(root), /Generated collection exceeds/);
});
