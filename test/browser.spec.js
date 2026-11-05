import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/published.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        protocolVersion: 1,
        catalogVersion: 1,
        captures: [],
      }),
    }),
  );
  await page.goto("./test.html");
});

test("one capture measures both schemes independently and shows both recorded grids", async ({
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
      ) {
        window.schemeProbes.push({
          scheme: node.parentElement.style.colorScheme,
          color: style.color,
        });
      }
      return style;
    };
  });
  await page.getByLabel("Browser and version").fill("Independent probes");
  await page.getByLabel("OS and version").fill("Test OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const probes = await page.evaluate(() => window.schemeProbes);
  expect(probes.map((probe) => probe.scheme)).toEqual(["light", "dark"]);
  for (const { scheme, color } of probes) {
    const group = page.getByRole("region", {
      name: `Captured ${scheme} mode`,
      exact: true,
    });
    await expect(group.locator(".color-card")).toHaveCount(19);
    await expect(
      group.locator(".color-card").filter({
        has: page.getByRole("heading", { name: "Canvas", exact: true }),
      }),
    ).toContainText(color);
  }
});

test("metadata is prefilled but editable, and exports identify browser and OS versions", async ({
  page,
}) => {
  await expect(page.getByLabel("Browser and version")).not.toHaveValue("");
  await expect(page.getByLabel("OS and version")).not.toHaveValue("");
  await page.getByLabel("Browser and version").fill("Chrome 156.1.2.3");
  await page.getByLabel("OS and version").fill("macOS 27.0.1");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await waiting).suggestedFilename()).toMatch(
    /chrome-156\.1\.2\.3-macos-27\.0\.1/,
  );
});

test("full version hints are requested only after an explicit action", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.hintRequests = 0;
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        async getHighEntropyValues() {
          window.hintRequests++;
          return {
            fullVersionList: [{ brand: "Chromium", version: "156.1.2.3" }],
            platform: "macOS",
            platformVersion: "27.0.1",
          };
        },
      },
    });
  });
  await page.reload();
  expect(await page.evaluate(() => window.hintRequests)).toBe(0);
  await page
    .getByRole("button", { name: "Fill available full versions" })
    .click();
  await expect(page.getByLabel("Browser and version")).toHaveValue(
    "Chromium 156.1.2.3",
  );
  await expect(page.getByLabel("OS and version")).toHaveValue(
    "macOS 27.0.1 (reported; verify)",
  );
});

test("live page samples every keyword, captures both modes, and exports portable data", async ({
  page,
}) => {
  await expect(page.locator("#palette .color-card")).toHaveCount(19);
  await page.getByLabel("Include deprecated keywords").check();
  await expect(page.locator("#palette .color-card")).toHaveCount(42);
  await page.getByLabel("Browser and version").fill("Test browser 1");
  await page.getByLabel("OS and version").fill("Test OS 1");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#individual-table thead")).toContainText(
    "Test browser 1",
  );
  await expect(page.locator('#pair-table tbody td[rowspan="2"]')).toHaveCount(
    15,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const file = await download;
  const data = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile(await file.path(), "utf8"),
  );
  expect(data.schemaVersion).toBe(1);
  expect(data.captures).toHaveLength(1);
  expect(Object.keys(data.captures[0].schemes)).toEqual(["light", "dark"]);
  expect(Object.keys(data.captures[0].schemes.light.colors)).toHaveLength(42);
  expect(data.captures[0].schemes.dark.colors.Canvas.computed).toBeTruthy();
});

test("JSON import builds independent columns and round-trips original captures", async ({
  page,
}) => {
  await page
    .getByLabel("Browser and version")
    .fill("<img src=x onerror=alert(1)>");
  await page.getByLabel("OS and version").fill("OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const exported = await waiting;
  const path = await exported.path();
  await page.reload();
  await page.getByLabel("Import capture JSON files").setInputFiles(path);
  await expect(page.locator("#individual-table thead")).toContainText(
    "<img src=x",
  );
  await expect(page.locator("#individual-table thead img")).toHaveCount(0);
  await page.getByLabel("Import capture JSON files").setInputFiles(path);
  await expect(page.locator("#status")).toContainText("duplicate");
  await expect(page.locator("#individual-table thead tr th")).toHaveCount(2);
  await page.getByLabel("Browser and version").fill("Second browser");
  await page.getByLabel("OS and version").fill("Second OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#individual-table thead tr th")).toHaveCount(3);
  await expect(page.locator('#pair-table thead th[colspan="2"]')).toHaveCount(
    2,
  );
  await expect(page.locator('#pair-table tbody td[rowspan="2"]')).toHaveCount(
    20,
  );
  await page.getByLabel("Display mode").selectOption("dark");
  await expect(page.locator("#individual-table thead tr th")).toHaveCount(3);
  await page.getByLabel("Opaque backdrop for contrast").selectOption("white");
  await expect(page.locator("#individual-table thead tr th")).toHaveCount(3);
});

test("invalid import is visible and does not replace existing results", async ({
  page,
}) => {
  await page.getByLabel("Import capture JSON files").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.locator("#error")).toContainText("version");
  await expect(page.locator("#individual-table thead tr th")).toHaveCount(1);
});

test("unsupported keywords are N/A, never inherited-looking successful measurements", async ({
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
  await expect(
    page.locator(".color-card").filter({
      has: page.getByRole("heading", { name: "AccentColor", exact: true }),
    }),
  ).toContainText("N/A");
});

test("narrow screens retain keyboard operation and contained table scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByLabel("Browser and version").fill("Mobile test");
  await page.getByLabel("OS and version").fill("Mobile OS");
  await page.getByRole("button", { name: "Capture light and dark" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("Captured");
  const widths = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
});

test("table swatches use each capture backdrop, not the viewing page background", async ({
  page,
}) => {
  await page.getByLabel("Opaque backdrop for contrast").selectOption("black");
  await page.getByLabel("Browser and version").fill("Backdrop test");
  await page.getByLabel("OS and version").fill("OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  const row = page.locator("#individual-table tbody tr").filter({
    has: page.getByRole("rowheader", { name: "Highlight", exact: true }),
  });
  await expect(row.locator(".table-swatch")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
});

test("without JavaScript, instructions remain and measurement controls are disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto("./test.html");
  await expect(page.locator("noscript p")).toContainText(
    "JavaScript is required",
  );
  await expect(
    page.getByRole("button", { name: "Capture light and dark" }),
  ).toBeDisabled();
  await context.close();
});

test("forced-color emulation is recorded as a distinct environment, not normal mode", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "This media emulation check uses Chromium; real OS palettes are separate study runs.",
  );
  await page.emulateMedia({ forcedColors: "active", colorScheme: "dark" });
  await page.getByLabel("Browser and version").fill("Emulation fixture");
  await page
    .getByLabel("OS and version")
    .fill("Fixture, not a real Windows run");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await page.getByRole("button", { name: "Export JSON" }).click();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  expect(data.captures[0].media.forcedColors).toBe(true);
  expect(data.captures[0].media.prefersColorScheme).toBe("dark");
  expect(data.captures[0].schemes.light.computedColorScheme).toBeTruthy();
  await expect(page.locator("#individual-table thead")).toContainText(
    "forced colors: active",
  );
});

test("a published collection populates comparison tables without uploading local data", async ({
  page,
}) => {
  await page.getByLabel("Browser and version").fill("Published fixture");
  await page.getByLabel("OS and version").fill("Fixture OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await page.getByRole("button", { name: "Export JSON" }).click();
  const body = await page.getByLabel("Exported JSON").inputValue();
  await page.route("**/published.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body,
    }),
  );
  await page.goto("./");
  await expect(page.locator("#individual-table thead")).toContainText(
    "Published fixture",
  );
  await expect(page.locator("#pair-table tbody td[rowspan='2']")).toHaveCount(
    10,
  );
  await page.getByLabel("Display mode").selectOption("dark");
  const capture = JSON.parse(body).captures[0];
  await expect(page.locator("#individual-table tbody")).toContainText(
    capture.schemes.dark.colors.Canvas.hex,
  );
  await page.goto("./test.html");
  await expect(page.locator("#captures li")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export JSON" }),
  ).toBeDisabled();
});

test("homepage shows published results without sampling or capture controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.systemColorProbeCalls = 0;
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (...args) => {
      if (args[0] === "color") window.systemColorProbeCalls++;
      return supports(...args);
    };
  });
  await page.goto("./");
  await expect(page.locator("#capture-form")).toHaveCount(0);
  await expect(page.locator("#palette")).toHaveCount(0);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Run the test" }),
  ).toHaveAttribute("href", "./test.html");
  await expect(page.locator("#status")).toContainText("0 published captures");
  expect(await page.evaluate(() => window.systemColorProbeCalls)).toBe(0);
});

test("invalid published data fails visibly without pretending the dataset is empty", async ({
  page,
}) => {
  await page.route("**/published.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ schemaVersion: 99 }),
    }),
  );
  await page.goto("./");
  await expect(page.locator("#error")).toBeVisible();
  await expect(page.locator("#status")).toContainText("failed");
  await expect(page.locator("#empty")).toBeHidden();
  await expect(page.getByLabel("Display mode")).toBeDisabled();
});
