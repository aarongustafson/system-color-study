import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { renderCapturePage } from "../scripts/build.js";
import { fixture } from "./fixtures.js";
import { issueSubmissionJSON, maxIssueJSONLength } from "../model.js";

const captureSource = await readFile(
  new URL("../test.html", import.meta.url),
  "utf8",
);
async function knownEnvironmentPage(page) {
  const capture = fixture("published-match");
  capture.environment.browser = "Chrome 157.0.8103.39";
  capture.environment.os = "macOS 27.0.1 arm64";
  await page.route("**/system-color-study/test.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: renderCapturePage(captureSource, [capture]),
    }),
  );
  await page.goto("./test.html");
}

test("a cautious published-combination hint follows inferred and edited values without fetching measurements", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 27_0_1) Chrome/157.0.0.0 Safari/537.36",
    });
  });
  let datasetRequests = 0;
  await page.route("**/published.json", (route) => {
    datasetRequests++;
    return route.abort();
  });
  await knownEnvironmentPage(page);
  await expect(page.locator("#metadata-help > #published-match")).toBeVisible();
  await expect(page.locator("#published-match")).toContainText("may already");
  await expect(page.locator("#published-match")).toContainText("major-version");
  await expect(page.locator("#published-match")).toContainText(
    "Different built-in themes",
  );
  await expect(
    page.getByLabel("Browser and version"),
  ).toHaveAccessibleDescription(/major-version combination.*About/);
  await expect(page.getByLabel("OS and version")).toHaveValue(
    "macOS 27.0.1 (reported; verify)",
  );
  for (const width of [320, 1400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator("#published-match").evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }),
    ).toBe(true);
  }
  await page.getByLabel("Browser and version").fill("Firefox 160");
  await expect(page.locator("#published-match")).toHaveCount(0);
  await page.getByLabel("Browser and version").fill("Chromium 157.2");
  await expect(page.locator("#published-match")).toHaveCount(1);
  await expect(page.getByLabel("Browser and version")).toHaveValue(
    "Chromium 157.2",
  );
  await page
    .getByLabel("OS and version")
    .fill("Windows (NT 10.0; verify release)");
  await expect(page.locator("#published-match")).toHaveCount(0);
  expect(datasetRequests).toBe(0);
});

test("Client Hints can reveal a published match but are still requested only on demand", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.hintRequests = 0;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/157.0.0.0 Safari/537.36",
    });
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        async getHighEntropyValues() {
          window.hintRequests++;
          return {
            fullVersionList: [{ brand: "Chromium", version: "157.1.2.3" }],
            platform: "macOS",
            platformVersion: "27.0.1",
          };
        },
      },
    });
  });
  await knownEnvironmentPage(page);
  await expect(page.locator("#published-match")).toHaveCount(0);
  expect(await page.evaluate(() => window.hintRequests)).toBe(0);
  await page
    .getByRole("button", { name: "Populate from Client Hints" })
    .click();
  await expect(page.locator("#published-match")).toBeVisible();
  await expect(page.getByLabel("Browser and version")).toHaveValue(
    "Chromium 157.1.2.3",
  );
  await expect(page.getByLabel("OS and version")).toHaveValue(
    "macOS 27.0.1 (reported; verify)",
  );
  expect(await page.evaluate(() => window.hintRequests)).toBe(1);
});

test("an invalid published lookup reports an error without blocking capture", async ({
  page,
}) => {
  const dom = new JSDOM(captureSource);
  dom.window.document.getElementById("published-environments").textContent =
    "null";
  const body = dom.serialize();
  dom.window.close();
  await page.route("**/system-color-study/test.html", (route) =>
    route.fulfill({ contentType: "text/html", body }),
  );
  await page.goto("./test.html");
  await expect(page.locator("#error")).toContainText("lookup is invalid");
  await expect(page.locator("#published-match")).toHaveCount(0);
  await expect(page.locator("#capture")).toBeEnabled();
  await page.getByLabel("Browser and version").fill("Chrome 157");
  await page.getByLabel("OS and version").fill("macOS 27");
  await page.locator("#capture").click();
  await expect(
    page.getByRole("link", { name: "Download JSON", exact: true }),
  ).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await page.goto("./test.html");
  await page.getByLabel("Browser and version").fill("Chrome 156.1.2.3");
  await page.getByLabel("OS and version").fill("macOS 27.0.1");
});

test("capture guidance stays with its controls without a redundant ready message", async ({
  page,
}) => {
  await expect(page.locator("#status")).toBeEmpty();
  await expect(page.locator("#metadata-help")).toContainText("inference");
  await expect(page.locator("#capture-form > #capture")).toHaveCount(1);
  await expect(page.locator("fieldset #capture")).toHaveCount(0);
  const capture = page.getByRole("button", {
    name: "Capture light and dark system colors",
    exact: true,
  });
  await expect(capture).toHaveAttribute("aria-describedby", "capture-help");
  await expect(capture).toHaveAccessibleDescription(
    /both CSS light and dark schemes.*doesn’t change your OS settings/,
  );
  expect(await capture.evaluate((button) => button.nextElementSibling.id)).toBe(
    "capture-help",
  );
  await expect(page.locator("details #environment")).toHaveCount(1);
  await expect(page.locator("#environment")).toBeHidden();
  await page.getByText("Optional context and notes", { exact: true }).click();
  await expect(page.locator("#environment")).toBeVisible();
  await expect(page.locator("#repeat-capture-help")).toContainText(
    "macOS Increase Contrast",
  );
  await expect(page.locator("#repeat-capture-help")).toContainText(
    "Submit each snapshot separately",
  );
  await page.getByLabel("OS and version").press("Enter");
  await expect(
    page.getByRole("link", { name: "Download JSON", exact: true }),
  ).toBeFocused();
});

test("required metadata errors persist without native validation tooltips", async ({
  page,
}) => {
  await page.evaluate(() => {
    HTMLFormElement.prototype.reportValidity = () => {
      throw new Error("Native validation tooltips must not be required.");
    };
  });
  await page.getByLabel("Browser and version").fill("");
  await page.getByLabel("OS and version").fill("   ");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.getByLabel("Browser and version")).toBeFocused();
  await expect(page.locator("#status")).toContainText(
    "No snapshot was generated",
  );
  for (const id of ["browser", "os"]) {
    await expect(page.locator(`#${id}-error`)).toHaveText(
      "Enter a confirmed value.",
    );
    await expect(page.locator(`#${id}-error`)).toBeVisible();
    await expect(page.locator(`#${id}`)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  }
  await page.getByLabel("Browser and version").fill("Confirmed browser");
  await expect(page.locator("#browser-error")).toBeHidden();
  await expect(page.locator("#os-error")).toBeVisible();
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.getByLabel("OS and version")).toBeFocused();
  await page.getByLabel("OS and version").fill("Confirmed OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#capture-result")).toBeVisible();
  await expect(page.locator("#error")).toBeHidden();
});

test("capture probes both schemes independently and downloads exactly the recorded values", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.schemeProbes = [];
    const original = window.getComputedStyle;
    window.getComputedStyle = function (node, ...args) {
      const style = original.call(this, node, ...args);
      if (
        node.parentElement?.classList.contains("probe-zone") &&
        node.style.color.toLowerCase() === "canvas"
      )
        window.schemeProbes.push({
          scheme: node.parentElement.style.colorScheme,
          color: style.color,
        });
      return style;
    };
  });
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  const probes = await page.evaluate(() => window.schemeProbes);
  expect(probes.map((p) => p.scheme)).toEqual(["light", "dark"]);
  for (const { scheme, color } of probes) {
    expect(data.captures[0].schemes[scheme].colors.Canvas.computed).toBe(color);
    expect(Object.keys(data.captures[0].schemes[scheme].colors)).toHaveLength(
      42,
    );
    expect(data.captures[0].schemes[scheme].backdrop).toBe("canvas");
  }
  const waiting = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download JSON", exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toMatch(
    /chrome-156\.1\.2\.3-macos-27\.0\.1/,
  );
  const full = JSON.parse(await readFile(await download.path(), "utf8"));
  for (const scheme of ["light", "dark"]) {
    expect(full.captures[0].schemes[scheme]).not.toHaveProperty("pairs");
    expect(data.captures[0].schemes[scheme]).not.toHaveProperty("pairs");
  }
  expect(JSON.parse(issueSubmissionJSON(full))).toEqual(data);
  expect(full).toEqual(data);
  await expect(page.locator(".probe-zone")).toHaveCount(0);
});

test("theme controls are absent when forced colors are inactive", async ({
  page,
}) => {
  await expect(
    page.getByLabel("Forced-color theme name", { exact: true }),
  ).toBeHidden();
  await expect(
    page.getByLabel("Forced-color theme name", { exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  expect(data.captures[0].media.forcedColors).toBe(false);
  expect(data.captures[0].environment).not.toHaveProperty("forcedColorTheme");
});

for (const [computed, conversion] of [
  ["rgba(12.345, 67.89, 123.456, 0.1234)", "rgb-serialization"],
  ["color(display-p3 1 0 0)", "canvas-srgb-8"],
]) {
  test(`capture preserves ${computed} without inventing conversion precision`, async ({
    page,
  }) => {
    let analysisRequests = 0;
    await page.route("**/analysis.js", (route) => {
      analysisRequests++;
      return route.abort();
    });
    await page.route("**/sampler.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          "const computed = getComputedStyle(probe).color;",
          `const computed = ${JSON.stringify(computed)};`,
        ),
      });
    });
    await page.reload();
    await page.getByLabel("Browser and version").fill("Test browser");
    await page.getByLabel("OS and version").fill("Test OS");
    await page.getByRole("button", { name: "Capture light and dark" }).click();
    const waiting = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download JSON", exact: true })
      .click();
    const download = await waiting;
    const data = JSON.parse(await readFile(await download.path(), "utf8"));
    for (const scheme of ["light", "dark"]) {
      expect(data.captures[0].schemes[scheme]).not.toHaveProperty("pairs");
      const color = data.captures[0].schemes[scheme].colors.Canvas;
      expect(color.computed).toBe(computed);
      expect(color.conversion).toBe(conversion);
      expect(color.rgba.every(Number.isInteger)).toBe(true);
      if (conversion === "rgb-serialization")
        expect(color.rgbaFloat).toEqual([12.345, 67.89, 123.456, 0.1234 * 255]);
      else expect(color).not.toHaveProperty("rgbaFloat");
    }
    expect(analysisRequests).toBe(0);
    expect(JSON.stringify(data)).not.toMatch(
      /"(ratio|grades|paintedBackground|nonTextThreshold)":/,
    );
  });
}

test("active forced colors require a confirmed theme and hide the field again when disabled", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Forced-color emulation is Chromium-specific; named OS palettes require real captures.",
  );
  await page.emulateMedia({ forcedColors: "active" });
  const theme = page.getByLabel("Forced-color theme name", { exact: true });
  await expect(theme).toBeVisible();
  await expect(theme).toHaveAttribute("required", "");
  for (const value of ["   ", "Theme; verify"]) {
    await theme.fill(value);
    await page.getByRole("button", { name: "Capture light and dark" }).click();
    await expect(page.locator("#capture-result")).toBeHidden();
    await expect(theme).toBeFocused();
    await expect(theme).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#forced-color-theme-error")).toBeVisible();
  }
  await theme.fill("Emulated palette");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  expect(data.captures[0].environment.forcedColorTheme).toBe(
    "Emulated palette",
  );
  expect(data.captures[0].media.forcedColors).toBe(true);
  await page.emulateMedia({ forcedColors: "none" });
  await expect(theme).toBeHidden();
  await expect(theme).toBeDisabled();
  await expect(page.locator("#forced-color-theme-error")).toBeHidden();
});

test("editing metadata hides the stale download until another capture", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#capture-result")).toBeVisible();
  await page.getByLabel("Browser and version").fill("Browser 2");
  await expect(page.locator("#capture-result")).toBeHidden();
  await expect(page.locator("#status")).toBeEmpty();
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  expect(data.captures).toHaveLength(1);
  expect(data.captures[0].environment.browser).toBe("Browser 2");
});

test("download URLs survive back-forward caching and are cleaned up on replacement or unload", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.revokedURLs = [];
    const revoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      window.revokedURLs.push(url);
      revoke.call(URL, url);
    };
  });
  const capture = page.getByRole("button", { name: "Capture light and dark" });
  await capture.click();
  const first = await page.locator("#download").getAttribute("href");
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  expect(await page.evaluate(() => window.revokedURLs)).toEqual([]);
  await capture.click();
  const second = await page.locator("#download").getAttribute("href");
  expect(second).not.toBe(first);
  expect(await page.evaluate(() => window.revokedURLs)).toEqual([first]);
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    ),
  );
  expect(await page.evaluate(() => window.revokedURLs)).toEqual([
    first,
    second,
  ]);
});

test("clipboard failure exposes a manual copy option and reports the error", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard denied");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await page.getByRole("button", { name: "Copy JSON" }).click();
  await expect(page.locator("#error")).toContainText("Clipboard denied");
  await expect(page.locator("#export-text")).toHaveAttribute("open", "");
  await expect(page.getByLabel("Exported JSON")).toBeFocused();
});

test("clipboard and manual issue JSON are identical and fit the GitHub field", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedJSON = text;
        },
      },
    });
  });
  await page.getByText("Optional context and notes", { exact: true }).click();
  await page
    .locator("#notes")
    .fill('Quotes, slashes, and Unicode: "\\ 😀'.repeat(40));
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await page.getByRole("button", { name: "Copy JSON" }).click();
  const text = await page.evaluate(() => window.copiedJSON);
  expect(text).toBe(await page.getByLabel("Exported JSON").inputValue());
  expect(text.length).toBeLessThanOrEqual(maxIssueJSONLength);
  expect(text).toBe(JSON.stringify(JSON.parse(text)));
  await expect(page.locator("#status")).toContainText("JSON copied");
});

test("oversized issue copies report an error but keep the full download available", async ({
  page,
}) => {
  await page.route("**/sampler.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: source.replace(
        "const computed = getComputedStyle(probe).color;",
        'const computed = "rgb(" + " ".repeat(170) + "0, 0, 0)";',
      ),
    });
  });
  await page.reload();
  await page.getByLabel("Browser and version").fill("Test browser");
  await page.getByLabel("OS and version").fill("Test OS");
  const capture = page.getByRole("button", { name: "Capture light and dark" });
  await capture.click();
  await expect(page.locator("#error")).toContainText("20,000-character");
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeDisabled();
  await expect(page.locator("#export-text")).toBeHidden();
  const waiting = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download JSON", exact: true }).click();
  const download = await waiting;
  const full = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(full.captures[0].schemes.dark.colors.Canvas.computed).toContain(
    " ".repeat(170),
  );
  await page.unroute("**/sampler.js");
  await page.reload();
  await page.getByLabel("Browser and version").fill("Test browser");
  await page.getByLabel("OS and version").fill("Test OS");
  await capture.click();
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.getByRole("button", { name: "Copy JSON" })).toBeEnabled();
  await expect(page.locator("#export-text")).toBeVisible();
});

test("unsupported colors remain explicitly unsupported in the snapshot", async ({
  page,
}) => {
  await page.route("**/sampler.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: source.replace(
        'CSS.supports("color", name)',
        '(name !== "AccentColor" && CSS.supports("color", name))',
      ),
    });
  });
  await page.reload();
  await page.getByLabel("Browser and version").fill("Test browser");
  await page.getByLabel("OS and version").fill("Test OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  expect(data.captures[0].schemes.light.colors.AccentColor).toMatchObject({
    supported: false,
    rgba: null,
    hex: null,
    computed: null,
  });
});
