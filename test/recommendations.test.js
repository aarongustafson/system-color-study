import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as model from "../model.js";
import { renderIndex } from "../scripts/build.js";
import { fixture } from "./fixtures.js";

function capture(id, category = "ordinary") {
  const value = structuredClone(fixture(id));
  if (category === "forced") {
    value.media.forcedColors = true;
    value.environment.forcedColorTheme = "Test palette";
  }
  if (category === "more") value.media.prefersContrast = "more";
  for (const snapshot of Object.values(value.schemes)) {
    snapshot.colors = structuredClone(snapshot.colors);
    for (const pair of model.pairs.filter((pair) => !pair.deprecated)) {
      snapshot.colors[pair.background] = {
        ...snapshot.colors[pair.background],
        rgba: [255, 255, 255, 255],
        hex: "#ffffff",
      };
    }
  }
  return value;
}

test("recommendations require normal-text AA in every category rather than a pooled score", () => {
  const ordinary = capture("ordinary");
  ordinary.schemes.light.colors.CanvasText.rgba = [128, 128, 128, 255];
  ordinary.schemes.light.colors.CanvasText.hex = "#808080";
  const captures = [
    ordinary,
    ...Array.from({ length: 8 }, (_, i) => capture(`forced-${i}`, "forced")),
    capture("more", "more"),
  ];
  const original = structuredClone(captures);
  const summary = model.recommendationSummary(captures);
  const canvas = summary.pairs.find((pair) => pair.id === "Canvas/CanvasText");
  assert.equal(canvas.recommended, false);
  assert.deepEqual(canvas.categories.light, {
    total: 1,
    passed: 0,
    unavailable: 0,
  });
  assert.equal(canvas.categories.forced.passed, 16);
  assert.equal(canvas.categories.more.passed, 2);
  assert.equal(canvas.variants.length, 2);
  assert.equal(
    canvas.minimum,
    model.pairResult(model.pairs[0], ordinary.schemes.light).ratio,
  );
  assert.equal(summary.pairs.length, 10);
  assert.ok(summary.pairs.every((pair) => !pair.deprecated));
  assert.deepEqual(captures, original);
});

test("missing categories, unsupported keywords and schemes, and other settings cannot qualify a pair", () => {
  assert.ok(
    model.recommendationSummary([]).pairs.every((pair) => !pair.recommended),
  );
  assert.ok(
    model
      .recommendationSummary([capture("ordinary")])
      .pairs.every((pair) => !pair.recommended),
  );
  const ordinary = capture("ordinary");
  const forced = capture("forced", "forced");
  const more = capture("more", "more");
  ordinary.schemes.light.colors.CanvasText = {
    supported: false,
    computed: null,
    rgba: null,
    hex: null,
    conversion: null,
  };
  let canvas = model.recommendationSummary([ordinary, forced, more]).pairs[0];
  assert.equal(canvas.recommended, false);
  assert.equal(canvas.categories.light.total, 1);
  assert.equal(canvas.categories.light.unavailable, 1);
  assert.equal(canvas.variants[0].observations.length, 5);
  ordinary.schemes.light.schemeSupported = false;
  const summary = model.recommendationSummary([ordinary, forced, more]);
  assert.ok(
    summary.pairs.every((pair) => pair.categories.light.unavailable === 1),
  );
  const unknown = capture("unknown");
  unknown.media.forcedColors = null;
  const other = capture("less");
  other.media.prefersContrast = "less";
  const withOther = model.recommendationSummary([
    capture("normal"),
    forced,
    more,
    unknown,
    other,
  ]);
  assert.equal(withOther.categories.other, 4);
  assert.ok(withOther.pairs.every((pair) => !pair.recommended));
});

test("recommendations grade unrounded ratios and deduplicate painted examples without losing provenance", () => {
  const normal = capture("normal");
  const forced = capture("forced", "forced");
  const more = capture("more", "more");
  // This byte-level gray is just below AA despite rounding to 4.50.
  for (const snapshot of Object.values(normal.schemes)) {
    snapshot.colors.CanvasText.rgba = [110, 121, 120, 255];
    snapshot.colors.CanvasText.hex = "#6e7978";
  }
  const summary = model.recommendationSummary([normal, forced, more]);
  const canvas = summary.pairs[0];
  assert.equal(canvas.recommended, false);
  assert.ok(canvas.minimum < 4.5);
  assert.equal(canvas.minimum.toFixed(2), "4.50");
  const mark = summary.pairs.find((pair) => pair.id === "Mark/MarkText");
  assert.equal(mark.recommended, true);
  assert.equal(mark.variants.length, 1);
  assert.equal(mark.variants[0].observations.length, 6);
  assert.deepEqual(summary.moreContrastSystems, ["Fixture"]);
});

test("painted-example deduplication preserves alpha measurements and unsupported backdrop counts", () => {
  const normal = capture("normal");
  normal.schemes.light.colors.CanvasText.rgba = [0, 0, 0, 127];
  normal.schemes.light.colors.CanvasText.hex = "#0000007f";
  normal.schemes.dark.colors.CanvasText.rgba = [128, 128, 128, 255];
  normal.schemes.dark.colors.CanvasText.hex = "#808080";
  const original = structuredClone(normal);
  const canvas = model.recommendationSummary([normal]).pairs[0];
  assert.equal(canvas.variants.length, 1);
  assert.equal(canvas.variants[0].observations.length, 2);
  assert.deepEqual(normal, original);
  for (const snapshot of Object.values(normal.schemes)) {
    snapshot.backdrop = "canvas";
    snapshot.colors.Canvas.rgba = [255, 255, 255, 128];
    snapshot.colors.Canvas.hex = "#ffffff80";
  }
  const unavailable = model.recommendationSummary([normal]).pairs[0];
  assert.equal(unavailable.minimum, null);
  assert.equal(unavailable.variants.length, 0);
  assert.equal(unavailable.categories.light.unavailable, 1);
  assert.equal(unavailable.categories.dark.unavailable, 1);
});

test("built recommendations precede contributions and retain static accessible examples and safe provenance", async (t) => {
  const normal = capture("normal");
  normal.environment.browser = "<img src=x onerror=alert(1)>";
  const source = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(
    renderIndex(source, [
      normal,
      capture("forced", "forced"),
      capture("more", "more"),
    ]),
  );
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const section = document.getElementById("recommendations");
  assert.ok(section);
  assert.equal(
    section.nextElementSibling.getAttribute("aria-labelledby"),
    "contribute-heading",
  );
  const cards = section.querySelectorAll("[data-recommended='true']");
  assert.equal(cards.length, 10);
  assert.match(cards[0].textContent, /Light: 1\/1 meet AA/);
  assert.match(cards[0].textContent, /Forced colors: 2\/2 meet AA/);
  assert.equal(cards[0].querySelectorAll(".paired-example").length, 1);
  assert.equal(section.querySelectorAll("td").length, 0);
  assert.equal(section.querySelectorAll("img, [onerror]").length, 0);
  assert.match(section.textContent, /<img src=x onerror=alert\(1\)>/);
  for (const face of section.querySelectorAll("svg"))
    assert.ok(face.getAttribute("aria-label"));
  assert.ok(section.querySelector("details summary"));
  const empty = new JSDOM(renderIndex(source, []));
  t.after(() => empty.window.close());
  assert.match(
    empty.window.document.getElementById("recommendations").textContent,
    /No captures/,
  );
  assert.equal(
    empty.window.document.querySelectorAll("[data-recommended='true']").length,
    0,
  );
});
