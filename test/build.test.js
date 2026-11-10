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
import { analysisMethod } from "../analysis.js";
import { JSDOM } from "jsdom";
import { buildSite, publicFiles, renderIndex } from "../scripts/build.js";
import { fixture } from "./fixtures.js";

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "system-color-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "data"));
  for (const file of publicFiles)
    await writeFile(
      join(root, file),
      ["index.html", "test.html"].includes(file)
        ? await readFile(new URL(`../${file}`, import.meta.url))
        : "Public fixture",
    );
  await writeFile(
    join(root, "published.json"),
    JSON.stringify({ ...versions, captures: [] }),
  );
  return root;
}

test("deprecated controls are inert authored markup in static output, and removed empty-state markup is not required", async (t) => {
  const source = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const authored = new JSDOM(source);
  t.after(() => authored.window.close());
  const template = authored.window.document.getElementById(
    "deprecated-controls-template",
  );
  assert.ok(
    template,
    "Deprecated instructions and controls belong in an inert template.",
  );
  assert.ok(template.content.querySelector("#deprecated-note"));
  assert.equal(template.content.querySelector("#deprecated").disabled, true);
  for (const captures of [[], [fixture("static-controls")]]) {
    const dom = new JSDOM(renderIndex(source, captures));
    t.after(() => dom.window.close());
    const document = dom.window.document;
    assert.equal(document.getElementById("deprecated"), null);
    assert.equal(document.getElementById("deprecated-note"), null);
    assert.equal(document.getElementById("empty"), null);
    assert.equal(
      document.querySelectorAll("tbody[data-deprecated][hidden]").length,
      4,
    );
  }
});

test("build merges every committed JSON collection and publishes only allowed static files", async (t) => {
  const root = await setup(t);
  const capture = fixture("one");
  for (const snapshot of Object.values(capture.schemes))
    snapshot.pairs = [{ ratio: 21, grades: { normalAA: true } }];
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
  assert.ok(
    result.captures.every((item) =>
      Object.values(item.schemes).every(
        (snapshot) => snapshot.pairs === undefined,
      ),
    ),
  );
  assert.ok(
    JSON.parse(await readFile(join(root, "data/a.json"))).captures[0].schemes
      .light.pairs,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(root, "dist/analysis.json"))),
    { ...analysisMethod, sourceRevision: process.env.GITHUB_SHA ?? null },
  );
  const html = await readFile(join(root, "dist/index.html"), "utf8");
  assert.match(html, /Analysis v1:.*WCAG 2\.2 thresholds/);
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
      "analysis.js",
      "analysis.json",
      "sampler.js",
      "environment.js",
      "styles.css",
      "published.json",
      "README.md",
      "protocol.html",
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

test("capture HTML embeds only unique published browser/OS labels without allowing script injection", async (t) => {
  const root = await setup(t);
  const capture = fixture("lookup");
  capture.environment.browser =
    'Browser </script><img src=x onerror="alert(1)"> 160';
  capture.environment.os = "macOS 27.0.1";
  capture.environment.notes = "This must not be copied into the lookup.";
  const repeat = structuredClone(capture);
  repeat.id = "repeat-lookup";
  await writeFile(
    join(root, "data/lookup.json"),
    JSON.stringify({ ...versions, captures: [capture, repeat] }),
  );
  await buildSite(root);
  const dom = new JSDOM(await readFile(join(root, "dist/test.html"), "utf8"));
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const data = document.getElementById("published-environments");
  assert.ok(data, "The capture page needs a build-time environment lookup.");
  assert.equal(data.type, "application/json");
  assert.deepEqual(JSON.parse(data.textContent), [
    { browser: capture.environment.browser, os: capture.environment.os },
  ]);
  assert.equal(document.querySelectorAll("img, [onerror]").length, 0);
  assert.equal(document.getElementById("published-match"), null);
  assert.ok(
    document
      .getElementById("published-match-template")
      .content.querySelector("#published-match"),
  );
  assert.ok(!data.textContent.includes(capture.environment.notes));
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
  for (const node of document.querySelectorAll(
    "[aria-labelledby], [aria-describedby]",
  )) {
    for (const name of ["aria-labelledby", "aria-describedby"]) {
      for (const id of (node.getAttribute(name) || "")
        .split(/\s+/)
        .filter(Boolean))
        assert.ok(document.getElementById(id), `Missing ${name} target ${id}`);
    }
  }
  for (const table of document.querySelectorAll("table")) {
    const paired = table.id.endsWith("pair-table");
    assert.equal(table.hidden, false);
    assert.equal(table.tBodies.length, 2);
    assert.equal(table.tBodies[0].rows.length, paired ? 10 : 19);
    assert.equal(table.tBodies[1].rows.length, paired ? 5 : 23);
    assert.ok(table.tBodies[1].hasAttribute("data-deprecated"));
    assert.equal(table.tBodies[1].hidden, true);
    for (const cell of table.querySelectorAll("td")) {
      for (const id of cell.getAttribute("headers").split(" ")) {
        const heading = document.getElementById(id);
        assert.equal(heading?.tagName, "TH");
        assert.equal(heading.closest("table"), table);
      }
      assert.equal(cell.rowSpan, 1);
      if (paired && cell.classList.contains("paired-example")) {
        assert.equal(
          cell.querySelector(".sample-normal").textContent,
          "Normal",
        );
        assert.equal(cell.querySelector(".sample-large").textContent, "Large");
        assert.ok(cell.style.backgroundImage.startsWith("linear-gradient("));
      }
    }
    for (const button of table.querySelectorAll("button[commandfor]")) {
      const dialog = document.getElementById(button.getAttribute("commandfor"));
      assert.equal(dialog?.tagName, "DIALOG");
      assert.ok(dialog.lastElementChild.hasAttribute("autofocus"));
      assert.equal(dialog.lastElementChild.getAttribute("command"), "close");
    }
  }
});

test("paired examples reuse shared SVG faces for the overall measured verdict", async (t) => {
  const root = await setup(t);
  const capture = fixture("faces");
  for (const snapshot of Object.values(capture.schemes)) {
    snapshot.colors = { ...snapshot.colors };
    for (const [name, value] of [
      ["Canvas", 255],
      ["LinkText", 128],
      ["VisitedText", 255],
    ]) {
      snapshot.colors[name] = {
        ...snapshot.colors[name],
        rgba: [value, value, value, 255],
        hex: "#" + value.toString(16).padStart(2, "0").repeat(3),
        computed: `rgb(${value}, ${value}, ${value})`,
      };
    }
    snapshot.colors.FieldText = {
      supported: false,
      rgba: null,
      hex: null,
      computed: null,
    };
  }
  await writeFile(
    join(root, "data/faces.json"),
    JSON.stringify({ ...versions, captures: [capture] }),
  );
  await buildSite(root);
  const dom = new JSDOM(await readFile(join(root, "dist/index.html"), "utf8"));
  t.after(() => dom.window.close());
  const document = dom.window.document;
  assert.equal(document.querySelectorAll("#contrast-face-symbols").length, 1);
  assert.equal(
    document.querySelectorAll("#contrast-face-symbols symbol").length,
    3,
  );
  const verdicts = new Set();
  for (const example of document.querySelectorAll("td.paired-example")) {
    const verdict = example.nextElementSibling.dataset.verdict;
    const face = example.querySelector("svg");
    if (verdict === "unavailable") {
      assert.equal(face, null);
      continue;
    }
    verdicts.add(verdict);
    assert.equal(face.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(face.hasAttribute("aria-hidden"), false);
    assert.equal(face.getAttribute("role"), "img");
    assert.equal(
      face.getAttribute("aria-label"),
      {
        pass: "Smiling face: all five contrast thresholds pass",
        mixed: "Neutral face: some contrast thresholds pass",
        fail: "Frowning face: no contrast thresholds pass",
      }[verdict],
    );
    assert.equal(face.getAttribute("focusable"), "false");
    const reference = face.querySelector("use").getAttribute("href");
    assert.equal(reference, `#contrast-face-${verdict}`);
    const symbol = document.querySelector(reference);
    assert.equal(symbol.tagName, "symbol");
    assert.equal(
      symbol.querySelector("path").getAttribute("fill"),
      "currentColor",
    );
    assert.equal(
      symbol.querySelector("path").getAttribute("fill-rule"),
      "evenodd",
    );
  }
  assert.deepEqual(verdicts, new Set(["pass", "mixed", "fail"]));
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
