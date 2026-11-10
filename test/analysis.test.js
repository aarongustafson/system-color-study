import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  versions,
  rgbFromCSS,
  validateCollection,
  observationCapture,
  mergeCaptures,
  comparisonGroups,
} from "../model.js";
import {
  analysisMethod,
  pairs,
  composite,
  contrast,
  pairResult,
  recommendationSummary,
} from "../analysis.js";
import { renderIndex } from "../scripts/build.js";
import { fixture } from "./fixtures.js";

test("RGB parsing retains fractional channels and alpha without byte rounding", () => {
  assert.deepEqual(rgbFromCSS("rgba(12.345, 67.89, 123.456, 0.1234)"), [
    12.345,
    67.89,
    123.456,
    0.1234 * 255,
  ]);
  assert.deepEqual(
    rgbFromCSS("rgb(50% 25% 100% / 50%)"),
    [127.5, 63.75, 255, 127.5],
  );
  assert.deepEqual(rgbFromCSS("rgb(-1 300 1e2)"), [0, 255, 100, 255]);
  assert.equal(rgbFromCSS("color(display-p3 1 0 0)"), null);
  for (const value of [
    "rgb(1 2)",
    "rgb(1 2 3 4 5)",
    "rgb(1x 2 3)",
    "rgb(1e999 2 3)",
  ])
    assert.throws(() => rgbFromCSS(value), /Invalid computed RGB/);
});

function preciseCapture() {
  const capture = fixture("precise");
  for (const snapshot of Object.values(capture.schemes)) {
    snapshot.colors.Canvas = {
      supported: true,
      computed: "rgb(255, 255, 255)",
      rgba: [255, 255, 255, 255],
      rgbaFloat: [255, 255, 255, 255],
      hex: "#ffffff",
      conversion: "rgb-serialization",
    };
    snapshot.colors.CanvasText = {
      supported: true,
      computed: "rgb(118.6, 118.6, 118.6)",
      rgba: [119, 119, 119, 255],
      rgbaFloat: [118.6, 118.6, 118.6, 255],
      hex: "#777777",
      conversion: "rgb-serialization",
    };
  }
  return capture;
}

test("analysis uses recorded precision while legacy captures retain their byte-level behavior", () => {
  const precise = preciseCapture();
  validateCollection({ ...versions, captures: [precise] });
  const original = structuredClone(precise);
  const legacy = structuredClone(precise);
  for (const snapshot of Object.values(legacy.schemes))
    for (const color of Object.values(snapshot.colors)) delete color.rgbaFloat;
  const result = pairResult(pairs[0], precise.schemes.light);
  const old = pairResult(pairs[0], legacy.schemes.light);
  assert.equal(result.ratio, contrast([118.6, 118.6, 118.6], [255, 255, 255]));
  assert.ok(result.ratio > 4.5);
  assert.ok(old.ratio < 4.5);
  assert.equal(result.grades.normalAA, true);
  assert.equal(old.grades.normalAA, false);
  assert.deepEqual(precise, original);
});

test("precise channels must match the original serialization, bytes, and conversion method", () => {
  const base = { ...versions, captures: [preciseCapture()] };
  for (const change of [
    { rgbaFloat: [118.7, 118.6, 118.6, 255] },
    { rgbaFloat: [118.6, 118.6, 118.6, 254] },
    { rgbaFloat: [NaN, 118.6, 118.6, 255] },
    { conversion: "canvas-srgb-8" },
    { computed: "color(display-p3 1 0 0)" },
    { supported: false },
  ]) {
    const data = structuredClone(base);
    Object.assign(data.captures[0].schemes.light.colors.CanvasText, change);
    assert.throws(
      () => validateCollection(data),
      /capture|channels|Unsupported/,
    );
  }
});

test("almost-opaque Canvas is not silently made opaque by byte rounding", () => {
  const capture = preciseCapture();
  const snapshot = capture.schemes.light;
  snapshot.backdrop = "canvas";
  snapshot.colors.Canvas.computed = "rgba(255, 255, 255, 0.99999)";
  snapshot.colors.Canvas.rgbaFloat[3] = 0.99999 * 255;
  validateCollection({ ...versions, captures: [capture] });
  assert.equal(pairResult(pairs[0], snapshot).ratio, null);
});

test("compositing clamps boundary overshoot without rounding fractional channels", () => {
  const white = rgbFromCSS("rgba(255, 255, 255, 0.0003)");
  assert.deepEqual(composite(white, [255, 255, 255]), [255, 255, 255]);
  assert.deepEqual(composite([0, 0, 0, white[3]], [0, 0, 0]), [0, 0, 0]);
  const rgba = rgbFromCSS("rgba(12.345, 67.89, 123.456, 0.1234)");
  const background = [20.1, 80.2, 140.3];
  const painted = composite(rgba, background);
  assert.deepEqual(
    painted,
    rgba
      .slice(0, 3)
      .map(
        (channel, index) =>
          channel * (rgba[3] / 255) + background[index] * (1 - rgba[3] / 255),
      ),
  );
  assert.ok(painted.every((channel) => !Number.isInteger(channel)));
  assert.throws(() => composite([256, 0, 0, 255], background), /Invalid sRGB/);
});

test("changing criteria recalculates assessments without changing any observations", () => {
  const capture = fixture("criteria");
  const original = structuredClone(capture);
  const alternate = { ...analysisMethod.thresholds, normalAA: 1 };
  assert.equal(
    pairResult(pairs[0], capture.schemes.light).grades.normalAA,
    false,
  );
  assert.equal(
    pairResult(pairs[0], capture.schemes.light, alternate).grades.normalAA,
    true,
  );
  assert.equal(
    recommendationSummary([capture]).pairs[0].categories.light.passed,
    0,
  );
  assert.equal(
    recommendationSummary([capture], alternate).pairs[0].categories.light
      .passed,
    1,
  );
  assert.throws(
    () =>
      pairResult(pairs[0], capture.schemes.light, {
        ...alternate,
        normalAA: NaN,
      }),
    /criterion/,
  );
  assert.deepEqual(capture, original);
});

test("stored pair reports do not affect duplicate detection or rendered results", async () => {
  const capture = fixture("historical");
  for (const snapshot of Object.values(capture.schemes))
    snapshot.pairs = [
      { id: pairs[0].id, ratio: 21, grades: { normalAA: true } },
    ];
  const original = structuredClone(capture);
  const raw = observationCapture(capture);
  const source = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  assert.equal(renderIndex(source, [capture]), renderIndex(source, [raw]));
  assert.equal(mergeCaptures([capture], [raw]).duplicates, 1);
  assert.equal(mergeCaptures([raw], [capture]).duplicates, 1);
  assert.deepEqual(capture, original);
  const changed = structuredClone(raw);
  changed.environment.notes = "Different setting";
  assert.throws(() => mergeCaptures([capture], [changed]), /Conflicting/);
});

test("precision differences remain separate observations even when byte colors match", () => {
  const first = preciseCapture();
  const next = structuredClone(first);
  next.id = "different-precision";
  for (const snapshot of Object.values(next.schemes)) {
    snapshot.colors.CanvasText.computed = "rgb(118.7, 118.7, 118.7)";
    snapshot.colors.CanvasText.rgbaFloat = [118.7, 118.7, 118.7, 255];
  }
  validateCollection({ ...versions, captures: [first, next] });
  assert.equal(comparisonGroups([first, next])[0].columns.length, 4);
  next.id = first.id;
  assert.throws(() => mergeCaptures([first], [next]), /Conflicting/);
});
