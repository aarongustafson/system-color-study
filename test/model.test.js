import test from "node:test";
import assert from "node:assert/strict";
import {
  keywords,
  pairs,
  hex,
  composite,
  contrast,
  grades,
  pairResult,
  validateCollection,
  mergeCaptures,
} from "../model.js";

test("catalog covers all modern and deprecated keywords without duplicates", () => {
  assert.equal(keywords.filter((item) => !item.deprecated).length, 19);
  assert.equal(keywords.filter((item) => item.deprecated).length, 23);
  assert.equal(new Set(keywords.map((item) => item.name)).size, 42);
  for (const pair of pairs) {
    assert.ok(keywords.some((item) => item.name === pair.background));
    assert.ok(keywords.some((item) => item.name === pair.foreground));
  }
});

test("hex retains alpha instead of presenting translucent colors as opaque", () => {
  assert.equal(hex([51, 181, 229, 102]), "#33b5e566");
  assert.equal(hex([0, 117, 255, 255]), "#0075ff");
});

test("source-over compositing includes both background and foreground alpha", () => {
  assert.deepEqual(composite([0, 0, 0, 128], [255, 255, 255]), [127, 127, 127]);
  assert.equal(contrast([0, 0, 0], [255, 255, 255]), 21);
  const blue = [51, 181, 229, 102];
  assert.ok(contrast([0, 0, 0], composite(blue, [255, 255, 255])) > 14);
  assert.ok(contrast([0, 0, 0], composite(blue, [18, 18, 18])) < 3);
});

test("grades use unrounded thresholds and distinguish normal and large text", () => {
  assert.deepEqual(grades(4.49999), {
    normalAA: false,
    normalAAA: false,
    largeAA: true,
    largeAAA: false,
  });
  assert.equal(grades(4.5).normalAA, true);
  assert.equal(grades(7).normalAAA, true);
  assert.equal(grades(2.99999).largeAA, false);
});

test("unsupported colors and an unknown backdrop never receive contrast grades", () => {
  const colors = {
    Canvas: { supported: true, rgba: [255, 255, 255, 255] },
    Highlight: { supported: false },
    HighlightText: { supported: true, rgba: [0, 0, 0, 255] },
  };
  const pair = pairs.find((item) => item.background === "Highlight");
  assert.equal(pairResult(pair, { colors, backdrop: "canvas" }).ratio, null);
  colors.Highlight = { supported: true, rgba: [51, 181, 229, 102] };
  const result = pairResult(pair, { colors, backdrop: "black" });
  assert.ok(result.ratio < 3);
  assert.equal(result.grades.normalAA, false);
  colors.Canvas = { supported: false };
  assert.equal(pairResult(pair, { colors, backdrop: "canvas" }).ratio, null);
});

test("imports reject unversioned and incomplete data rather than guessing", () => {
  assert.throws(() => validateCollection({}), /version/i);
  assert.throws(
    () =>
      validateCollection({
        schemaVersion: 1,
        protocolVersion: 1,
        catalogVersion: 1,
        captures: [{ id: "partial" }],
      }),
    /capture/i,
  );
});

test("repeat imports preserve runs and report conflicting identifiers", () => {
  const a = { id: "one", browser: "A" };
  const b = { id: "two", browser: "A" };
  const result = mergeCaptures([a], [a, b]);
  assert.equal(result.captures.length, 2);
  assert.equal(result.duplicates, 1);
  assert.throws(
    () => mergeCaptures([a], [{ ...a, browser: "B" }]),
    /conflict/i,
  );
});

test("equivalent imports are duplicates even if JSON object keys were reordered", () => {
  const capture = { id: "same", environment: { browser: "A", os: "B" } };
  const reordered = { environment: { os: "B", browser: "A" }, id: "same" };
  assert.equal(mergeCaptures([capture], [reordered]).duplicates, 1);
});

test("complete captures validate, but forged hex and missing modes are rejected", () => {
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
  const snapshot = {
    colors,
    backdrop: "white",
    schemeSupported: true,
    computedColorScheme: "light",
  };
  const capture = {
    id: "unit-fixture",
    capturedAt: "2000-01-01T00:00:00.000Z",
    environment: {
      browser: "Fixture",
      os: "Fixture",
      notes: "",
      userAgent: "",
      context: "normal",
    },
    media: {
      forcedColors: null,
      prefersColorScheme: "unknown",
      prefersContrast: "unknown",
      displayMode: "unknown",
    },
    schemes: { light: snapshot, dark: structuredClone(snapshot) },
  };
  const data = {
    schemaVersion: 1,
    protocolVersion: 1,
    catalogVersion: 1,
    captures: [capture],
  };
  assert.deepEqual(validateCollection(data), [capture]);
  const forged = structuredClone(data);
  forged.captures[0].schemes.light.colors.Canvas.hex = "#ffffff";
  assert.throws(() => validateCollection(forged), /Inconsistent/);
  const missing = structuredClone(data);
  delete missing.captures[0].schemes.dark;
  assert.throws(() => validateCollection(missing), /Missing capture dark/);
});
