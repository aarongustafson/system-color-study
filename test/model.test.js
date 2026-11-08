import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
  versions,
  comparisonGroups,
  comparisonSections,
} from "../model.js";
import { fixture } from "./fixtures.js";

test("comparison sections group OS major releases, then themes, then browser identities without changing captures", () => {
  const chrome = fixture("ipad-chrome");
  chrome.environment.os = "iPadOS 26.5.0";
  chrome.environment.browser = "Chrome 155.0.8059.37";
  chrome.environment.context = "webview";
  const safari = fixture("ipad-safari");
  safari.environment.os = "iPadOS 26.5";
  safari.environment.browser = "Safari 26.5";
  const original = structuredClone([safari, chrome]);
  const sections = comparisonSections([safari, chrome]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].os, "iPadOS 26");
  assert.deepEqual(
    sections[0].themes.map((theme) => theme.name),
    ["Light", "Dark"],
  );
  for (const theme of sections[0].themes) {
    assert.deepEqual(
      theme.groups.map((group) => group.browser),
      ["Chrome 155.0.8059.37", "Safari 26.5"],
    );
    assert.equal(theme.groups[0].context, "webview");
  }
  assert.deepEqual([safari, chrome], original);
});

test("recorded contrast preferences retain separate themes without an authored forced-palette name", () => {
  const capture = fixture("more");
  capture.media.prefersContrast = "more";
  const sections = comparisonSections([capture]);
  assert.deepEqual(
    sections[0].themes.map((t) => t.name),
    [
      "more contrast (forced colors inactive) · Light",
      "more contrast (forced colors inactive) · Dark",
    ],
  );
  assert.equal(capture.environment.forcedColorTheme, undefined);
});

test("confirmed device batch uses Windows 11, one Chrome identifier, and unprefixed headed engine names", async () => {
  const directory = new URL("../data/", import.meta.url);
  const paths = (await readdir(directory, { recursive: true })).filter((path) =>
    path.endsWith(".json"),
  );
  const captures = (
    await Promise.all(
      paths.map(async (path) =>
        validateCollection(
          JSON.parse(await readFile(new URL(path, directory), "utf8")),
        ),
      ),
    )
  ).flat();
  assert.ok(
    captures.every(
      (capture) => !/^Chromium(?:\s|$)/.test(capture.environment.browser),
    ),
    "Stored browser labels should use Chrome rather than Chromium.",
  );
  const chromiumEngine = captures.find(
    (capture) => capture.id === "mw45lv5z-oef6a7xgvq",
  );
  assert.equal(chromiumEngine.environment.browser, "Chrome 158.0.8127.18");
  assert.match(chromiumEngine.environment.notes, /headed bundled Chromium/);
  const windows = captures.filter(
    (c) =>
      c.capturedAt >= "2026-11-06T00:50:00.000Z" &&
      c.capturedAt <= "2026-11-06T01:20:00.000Z" &&
      c.environment.os.startsWith("Windows"),
  );
  assert.equal(windows.length, 16);
  assert.ok(windows.every((c) => c.environment.os === "Windows 11"));
  const chrome = windows.filter((c) => /Chrome/.test(c.environment.browser));
  assert.equal(chrome.length, 4);
  assert.deepEqual(
    [...new Set(chrome.map((c) => c.environment.browser))],
    ["Chrome 157.0.8103.39"],
  );
  const headed = captures.filter((c) =>
    c.environment.notes.includes("headed bundled"),
  );
  assert.equal(headed.length, 3);
  assert.ok(
    headed.every((c) => !c.environment.browser.startsWith("Playwright ")),
  );
  assert.ok(headed.every((c) => c.environment.notes.includes("Playwright")));
  const webkit = headed.find((c) =>
    c.environment.notes.includes("bundled WebKit"),
  );
  assert.equal(webkit.environment.browser, "Safari 27.2");
  assert.ok(
    webkit.environment.notes.includes(
      "Not an installed Chrome/Firefox/Safari release",
    ),
  );
});

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

test("theme metadata is optional for legacy captures, typed, and independent of browser media detection", () => {
  const capture = fixture("theme");
  const data = { ...versions, captures: [capture] };
  assert.equal(validateCollection(data)[0], capture);
  capture.media.forcedColors = true;
  assert.equal(validateCollection(data)[0], capture);
  capture.environment.forcedColorTheme = "Aquatic";
  assert.equal(
    validateCollection(data)[0].environment.forcedColorTheme,
    "Aquatic",
  );
  for (const name of [null, 42, "x".repeat(161)]) {
    capture.environment.forcedColorTheme = name;
    assert.throws(() => validateCollection(data), /theme/i);
  }
  capture.environment.forcedColorTheme = "Aquatic";
  capture.media.forcedColors = false;
  assert.equal(
    validateCollection(data)[0].environment.forcedColorTheme,
    "Aquatic",
  );
  assert.equal(capture.media.forcedColors, false);
  capture.environment.forcedColorTheme = "";
  assert.equal(validateCollection(data)[0], capture);
});

test("comparison groups retain both normal modes and collapse only identical forced palettes", () => {
  const normal = fixture("normal");
  const forced = fixture("forced");
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = "Aquatic";
  forced.schemes.dark = structuredClone(forced.schemes.light);
  forced.schemes.dark.computedColorScheme = "dark";
  const split = structuredClone(forced);
  split.id = "split";
  split.environment.forcedColorTheme = "Desert";
  split.schemes.dark.colors.SelectedItem.rgba = [1, 2, 3, 255];
  split.schemes.dark.colors.SelectedItem.hex = "#010203";
  split.schemes.dark.colors.SelectedItem.computed = "rgb(1, 2, 3)";
  const input = [normal, forced, split];
  const original = structuredClone(input);
  const groups = comparisonGroups(input);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].columns.map((c) => c.schemes),
    [["light"], ["dark"], ["light", "dark"], ["light"], ["dark"]],
  );
  assert.equal(
    groups[0].columns[4].snapshot.colors.SelectedItem.hex,
    "#010203",
  );
  assert.deepEqual(input, original);
});

test("identical repeat measurements share columns without discarding provenance or hiding differences", () => {
  const first = fixture("first");
  const repeat = structuredClone(first);
  repeat.id = "repeat";
  repeat.capturedAt = "2001-01-01T00:00:00.000Z";
  repeat.environment.notes = "Second independent run";
  const changed = structuredClone(first);
  changed.id = "changed";
  changed.schemes.dark.backdrop = "black";
  const differentContext = structuredClone(first);
  differentContext.id = "private";
  differentContext.environment.context = "private";
  const groups = comparisonGroups([first, repeat, changed, differentContext]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].columns.length, 4);
  assert.deepEqual(
    groups[0].columns[0].runs.map((r) => r.capture.id),
    ["first", "repeat"],
  );
  assert.equal(groups[0].runs.length, 3);
  assert.equal(groups[1].context, "private");
});

test("forced palette collapse checks all keywords, support, alpha, and backdrop", () => {
  for (const change of [
    (s) => {
      s.backdrop = "black";
    },
    (s) => {
      s.schemeSupported = false;
    },
    (s) => {
      s.colors.Window.rgba[3] = 128;
    },
    (s) => {
      s.colors.Window.supported = false;
    },
  ]) {
    const capture = fixture("forced-difference");
    capture.media.forcedColors = true;
    capture.schemes.dark = structuredClone(capture.schemes.light);
    change(capture.schemes.dark);
    assert.equal(comparisonGroups([capture])[0].columns.length, 2);
  }
});
