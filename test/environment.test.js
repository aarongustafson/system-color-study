import test from "node:test";
import assert from "node:assert/strict";
import {
  detectEnvironment,
  environmentFromHints,
  exportFilename,
} from "../environment.js";

test("UA prefills distinguish browsers and label reported OS versions honestly", () => {
  const chrome = detectEnvironment(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36",
  );
  assert.equal(chrome.browser, "Chrome 156.0.0.0");
  assert.equal(chrome.os, "macOS 10.15.7 (reported; verify)");
  assert.equal(
    detectEnvironment(
      "Mozilla/5.0 Windows NT 10.0 Chrome/156.0.0.0 Edg/156.1.2.3",
    ).browser,
    "Edge 156.1.2.3",
  );
  assert.equal(
    detectEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile Safari/604.1",
    ).os,
    "iOS 26.0 (reported; verify)",
  );
  assert.deepEqual(detectEnvironment("Unrecognized agent"), {
    browser: "",
    os: "",
  });
});

test("explicit client hints supply full versions without mistaking Windows platform versions for release names", () => {
  assert.deepEqual(
    environmentFromHints({
      fullVersionList: [
        { brand: "Not A Brand", version: "99" },
        { brand: "Chromium", version: "156.1.2.3" },
        { brand: "Google Chrome", version: "156.1.2.3" },
      ],
      platform: "macOS",
      platformVersion: "26.4.2",
    }),
    {
      browser: "Google Chrome 156.1.2.3",
      os: "macOS 26.4.2 (reported; verify)",
    },
  );
  assert.equal(
    environmentFromHints({ platform: "Windows", platformVersion: "19.0.0" }).os,
    "Windows (platform 19.0.0; verify release)",
  );
});

test("filenames include environment versions and time, stay path-safe, and flag mixed collections", () => {
  const capture = {
    environment: { browser: "Chrome 156.1.2.3", os: "macOS 27.0.1" },
  };
  const time = "2026-11-05T22:00:00.000Z";
  assert.equal(
    exportFilename([capture], time),
    "system-colors-chrome-156.1.2.3-macos-27.0.1-2026-11-05T22-00-00.000Z.json",
  );
  assert.match(
    exportFilename(
      [capture, { environment: { browser: "Firefox 146", os: "macOS 27" } }],
      time,
    ),
    /and-1-more/,
  );
  const unsafe = exportFilename(
    [{ environment: { browser: "../a/evil", os: "?:\\os" } }],
    time,
  );
  assert.ok(!unsafe.includes("/") && !unsafe.includes("\\"));
  assert.ok(unsafe.length < 255);
});

test("mixed environment counts use complete pairs before truncation or slug normalization", () => {
  const browser =
    "Google Chrome for Testing (Official Build) (arm64) 158.0.8127.";
  const time = "2026-11-05T22:00:00.000Z";
  for (const environments of [
    [
      { browser: browser + "18", os: "macOS 27" },
      { browser: browser + "19", os: "macOS 27" },
    ],
    [
      { browser: "a-b", os: "c" },
      { browser: "a", os: "b-c" },
    ],
  ]) {
    const captures = environments.map((environment) => ({ environment }));
    assert.match(exportFilename(captures, time), /-and-1-more-/);
    assert.doesNotMatch(
      exportFilename([captures[0], captures[0]], time),
      /-and-/,
    );
  }
});
