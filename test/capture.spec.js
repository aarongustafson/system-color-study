import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

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
    "Save each snapshot separately",
  );
  await page.getByLabel("OS and version").press("Enter");
  await expect(
    page.getByRole("link", { name: "Download JSON", exact: true }),
  ).toBeFocused();
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
  expect(JSON.parse(await readFile(await download.path(), "utf8"))).toEqual(
    data,
  );
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
});

test("editing metadata hides the stale download until another capture", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#capture-result")).toBeVisible();
  await page.getByLabel("Browser and version").fill("Browser 2");
  await expect(page.locator("#capture-result")).toBeHidden();
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
