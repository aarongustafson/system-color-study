import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { renderIndex } from "../scripts/build.js";
import { fixture } from "./fixtures.js";
import {
  versions,
  hex,
  contrast,
  comparisonSections,
  composite,
  pairResult,
  pairs,
} from "../model.js";

const indexSource = await readFile(
  new URL("../index.html", import.meta.url),
  "utf8",
);

for (const javaScriptEnabled of [true, false]) {
  test(`recommendations expose named recorded examples and keyboard disclosures with JavaScript ${javaScriptEnabled ? "enabled" : "disabled"}`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled });
    try {
      const page = await context.newPage();
      await page.goto(baseURL);
      const section = page.getByRole("region", {
        name: "Which pairs held up across these captures?",
      });
      const forcedAdjustmentSupported = await page.evaluate(() =>
        CSS.supports("forced-color-adjust", "none"),
      );
      await expect(section).toBeVisible();
      const canvas = section.locator("[data-recommended='true']").filter({
        has: page.getByRole("heading", {
          name: "CanvasText on Canvas",
          exact: true,
        }),
      });
      await expect(canvas).toHaveCount(1);
      await expect(canvas.locator(".recommendation-use")).toHaveText(
        "Use for: Page content and general reading surfaces.",
      );
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "16.1px";
      });
      for (const width of [320, 1400]) {
        await page.setViewportSize({ width, height: 900 });
        const disclosure = canvas.locator(":scope > details > summary");
        await expect(disclosure).toHaveText(
          /View the \d+ rendered combinations?/,
        );
        await expect(disclosure).toHaveAccessibleName(
          /CanvasText on Canvas View the \d+ rendered combinations?/,
        );
        await expect(canvas.locator("h4")).toHaveCSS("font-weight", "700");
        await expect(canvas.locator(".recommendation-stats li")).toHaveCount(5);
        const layout = await canvas.evaluate((node) => {
          const title = node.querySelector("h4");
          const use = node.querySelector(".recommendation-use");
          const bullets = [
            ...node.querySelectorAll(".recommendation-stats li"),
          ];
          return {
            gap:
              use.getBoundingClientRect().top -
              title.getBoundingClientRect().bottom,
            largerTitle:
              parseFloat(getComputedStyle(title).fontSize) >
              parseFloat(getComputedStyle(use).fontSize),
            minimumBulletGap: Math.min(
              ...bullets
                .slice(1)
                .map(
                  (bullet, index) =>
                    bullet.getBoundingClientRect().top -
                    bullets[index].getBoundingClientRect().bottom,
                ),
            ),
          };
        });
        expect(Math.abs(layout.gap)).toBeLessThan(0.01);
        expect(layout.largerTitle).toBe(true);
        expect(layout.minimumBulletGap).toBeGreaterThanOrEqual(-0.01);
        await disclosure.focus();
        await expect(disclosure).toBeFocused();
        await disclosure.press("Enter");
        await expect(canvas.locator(".recommendation-examples")).toBeVisible();
        const examples = canvas.locator(".paired-example");
        await expect(
          examples.first().getByRole("img", {
            name: "Smiling face: all five contrast thresholds pass",
          }),
        ).toBeVisible();
        if (forcedAdjustmentSupported)
          await expect(examples.first()).toHaveCSS(
            "forced-color-adjust",
            "none",
          );
        const provenance = canvas.locator("figcaption details").first();
        await provenance.locator("summary").focus();
        await provenance.locator("summary").press("Enter");
        await expect(provenance.locator("ul")).toBeVisible();
        await expect(provenance.locator("li").first()).toHaveText(
          /.+ \/ .+, (light|dark)(, .+)?/,
        );
        await expect(provenance).not.toContainText("requested");
        await expect(provenance).toContainText("forced colors");
        const geometry = await section.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          return [...node.querySelectorAll("article, figure")].every(
            (child) => {
              const rect = child.getBoundingClientRect();
              return (
                rect.width === 0 ||
                (rect.left >= bounds.left && rect.right <= bounds.right + 1)
              );
            },
          );
        });
        expect(geometry).toBe(true);
        await provenance.locator("summary").press("Enter");
        await disclosure.focus();
        await disclosure.press("Enter");
        await expect(canvas.locator(".recommendation-examples")).toBeHidden();
      }
      await page.emulateMedia({ forcedColors: "active" });
      await canvas.locator(":scope > details > summary").click();
      if (forcedAdjustmentSupported) {
        await expect(canvas.locator(".paired-example").first()).toHaveCSS(
          "forced-color-adjust",
          "none",
        );
        await expect(canvas.locator("figcaption").first()).toHaveCSS(
          "forced-color-adjust",
          "auto",
        );
      }
    } finally {
      await context.close();
    }
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("./test.html");
});

async function publish(page, captures) {
  const body = renderIndex(indexSource, captures);
  await page.route("**/system-color-study/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body,
    }),
  );
  await page.goto("./");
}

test("prebuilt headers initialize and resize even when observer callbacks are delayed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  const forced = fixture("delayed-forced");
  forced.media.forcedColors = true;
  await publish(page, [fixture("delayed-normal"), forced]);
  for (const table of await page.locator("table").all())
    await expect(table.locator("thead")).toHaveCSS("position", "sticky");
  await page.setViewportSize({ width: 320, height: 240 });
  for (const table of await page.locator("table").all())
    await expect(table.locator("thead")).toHaveCSS("position", "static");
});

test("SVG faces share definitions, inherit the recorded foreground, and match the text verdict", async ({
  page,
}) => {
  const capture = fixture("faces");
  for (const snapshot of Object.values(capture.schemes)) {
    snapshot.colors = { ...snapshot.colors };
    for (const [name, value] of [
      ["Canvas", 255],
      ["LinkText", 128],
      ["VisitedText", 255],
    ])
      snapshot.colors[name] = {
        ...snapshot.colors[name],
        rgba: [value, value, value, 255],
        hex: "#" + value.toString(16).padStart(2, "0").repeat(3),
        computed: `rgb(${value}, ${value}, ${value})`,
      };
  }
  await publish(page, [capture]);
  await expect(page.locator("#contrast-face-symbols")).toHaveCount(1);
  await expect(page.locator("#contrast-face-symbols symbol")).toHaveCount(3);
  for (const [foreground, verdict, value] of [
    ["CanvasText", "pass", 0],
    ["LinkText", "mixed", 128],
    ["VisitedText", "fail", 255],
  ]) {
    const row = page.locator("#pair-table tbody tr").filter({
      has: page.getByRole("rowheader", {
        name: `${foreground} on Canvas`,
        exact: true,
      }),
    });
    for (const face of await row.locator(".sample-face").all()) {
      await expect(face).not.toHaveAttribute("aria-hidden");
      await expect(face).toHaveRole("img");
      await expect(face).toHaveAccessibleName(
        {
          pass: "Smiling face: all five contrast thresholds pass",
          mixed: "Neutral face: some contrast thresholds pass",
          fail: "Frowning face: no contrast thresholds pass",
        }[verdict],
      );
      await expect(face).toHaveAttribute("focusable", "false");
      await expect(face.locator("use")).toHaveAttribute(
        "href",
        `#contrast-face-${verdict}`,
      );
      await expect(face).toHaveCSS("fill", `rgb(${value}, ${value}, ${value})`);
      await expect(face).toHaveCSS("width", "48px");
      await expect(face).toHaveCSS("height", "48px");
    }
    await expect(row.locator(".sample-face")).toHaveCount(2);
    await expect(row.getByRole("img")).toHaveCount(2);
    await expect(row.locator(".contrast-result").first()).toHaveAttribute(
      "data-verdict",
      verdict,
    );
  }
  await page.locator("#deprecated").check();
  await expect(page.locator("#contrast-face-symbols")).toHaveCount(1);
});

test("single-row paired examples preserve recorded alpha, text sizes, thresholds, and unavailable states", async ({
  page,
  browserName,
}) => {
  const normal = fixture("paired-normal");
  for (const [scheme, snapshot] of Object.entries(normal.schemes)) {
    snapshot.backdrop = scheme === "light" ? "white" : "black";
    snapshot.colors = { ...snapshot.colors };
    for (const [name, rgba] of [
      ["Field", [51, 181, 229, 102]],
      ["FieldText", [230, 20, 120, scheme === "light" ? 128 : 129]],
    ])
      snapshot.colors[name] = {
        supported: true,
        rgba,
        hex: hex(rgba),
        computed: `rgba(${rgba.slice(0, 3).join(", ")}, ${rgba[3] / 255})`,
        conversion: "rgb-serialization",
      };
  }
  const forced = structuredClone(normal);
  forced.id = "paired-forced";
  forced.media.forcedColors = true;
  await publish(page, [normal, forced]);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "12px";
  });
  const forcedAdjustmentSupported = await page.evaluate(() =>
    CSS.supports("forced-color-adjust", "none"),
  );
  const pair = pairs.find((item) => item.background === "Field");
  for (const id of ["pair-table", "forced-pair-table"]) {
    const table = page.locator(`#${id}`);
    await expect(table.locator("tbody:not([hidden]) tr")).toHaveCount(10);
    await expect(table.locator("tbody td[rowspan], tbody code")).toHaveCount(0);
    await expect(table.locator("thead")).toContainText("Paired example");
    const row = table.locator("tbody tr").filter({
      has: page.getByRole("rowheader", {
        name: "FieldText on Field",
        exact: true,
      }),
    });
    const samples = row.locator(".paired-example");
    for (const [index, scheme] of ["light", "dark"].entries()) {
      const sample = samples.nth(index);
      await expect(sample.locator(".sample-normal")).toHaveText("Normal");
      await expect(sample.locator(".sample-large")).toHaveText("Large");
      await expect(sample.locator(".sample-normal")).toHaveCSS(
        "font-size",
        "16px",
      );
      await expect(sample.locator(".sample-large")).toHaveCSS(
        "font-size",
        "24px",
      );
      await expect(sample.locator(".sample-large")).toHaveCSS(
        "font-weight",
        "400",
      );
      await expect(sample).toHaveCSS(
        "background-color",
        scheme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
      );
      if (forcedAdjustmentSupported)
        await expect(sample).toHaveCSS("forced-color-adjust", "none");
      const style = await sample.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { background: computed.backgroundImage, color: computed.color };
      });
      await expect(sample.locator(".sample-face")).toHaveCSS(
        "fill",
        style.color,
      );
      expect(style.background).toMatch(/rgba\(51,\s*181,\s*229,\s*0\.4\)/);
      const rgba = style.color.match(/[\d.]+/g).map(Number);
      expect(rgba.slice(0, 3)).toEqual([230, 20, 120]);
      // CSS can serialize byte 128 as 0.5 rather than 128/255.
      expect(Math.round(rgba[3] * 255)).toBe(
        normal.schemes[scheme].colors.FieldText.rgba[3],
      );
      await expect(
        row
          .locator(".contrast-result strong")
          .filter({ hasText: ":1" })
          .nth(index),
      ).toHaveText(
        `${pairResult(pair, normal.schemes[scheme]).ratio.toFixed(2)}:1`,
      );
    }
    if (browserName === "chromium") {
      const before = await samples.first().evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundImage, color: style.color };
      });
      await page.emulateMedia({ forcedColors: "active" });
      await expect(samples.first()).toHaveCSS(
        "background-image",
        before.background,
      );
      await expect(samples.first().locator(".sample-face")).toHaveCSS(
        "fill",
        before.color,
      );
      await page.emulateMedia({ forcedColors: "none" });
    }
  }
  const unknown = fixture("paired-unknown-backdrop");
  for (const snapshot of Object.values(unknown.schemes)) {
    snapshot.backdrop = "canvas";
    snapshot.colors.Canvas = {
      supported: true,
      rgba: [0, 0, 0, 128],
      hex: "#00000080",
      computed: "rgba(0, 0, 0, 0.502)",
      conversion: "rgb-serialization",
    };
  }
  await publish(page, [unknown]);
  await expect(
    page.locator("#pair-table .sample-normal, #pair-table .sample-large"),
  ).toHaveCount(0);
  await expect(page.locator("#pair-table .sample-face")).toHaveCount(0);
  await expect(
    page.locator("#pair-table .paired-example").first(),
  ).toContainText("Preview unavailable");
  await expect(
    page.locator("#pair-table .contrast-result[data-verdict='unavailable']"),
  ).toHaveCount(30);
});

test("the header hierarchy sticks as a group during vertical scrolling only when body space remains", async ({
  page,
}) => {
  const normal = fixture("sticky-head");
  const forced = fixture("sticky-forced-head");
  forced.environment.os = "Windows 11";
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = "Aquatic";
  await publish(page, [normal, forced]);
  await page.setViewportSize({ width: 1400, height: 900 });
  for (const direction of ["ltr", "rtl"]) {
    await page.evaluate((value) => {
      document.documentElement.dir = value;
    }, direction);
    for (const table of await page.locator("table").all()) {
      const region = table.locator(".."),
        head = table.locator("thead");
      await expect(table).toHaveCSS("border-collapse", "separate");
      await expect(table).toHaveCSS("border-spacing", "0px");
      await expect(head).toHaveCSS("position", "sticky");
      await region.evaluate((node) => {
        node.scrollTop = 0;
      });
      await region.focus();
      await page.keyboard.press("ArrowDown");
      await expect
        .poll(() => region.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(0);
      await region.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const area = await region.boundingBox(),
        header = await head.boundingBox();
      expect(Math.abs(header.y - area.y)).toBeLessThanOrEqual(2);
    }
  }
  await page.setViewportSize({ width: 320, height: 240 });
  for (const table of await page.locator("table").all()) {
    const region = table.locator(".."),
      head = table.locator("thead");
    await expect(head).toHaveCSS("position", "static");
    await region.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const area = await region.boundingBox(),
      header = await head.boundingBox();
    expect(header.y + header.height).toBeLessThanOrEqual(area.y + 2);
  }
});

test("OS and theme headers put browsers side by side and identify every data column", async ({
  page,
}) => {
  const zeta = fixture("hierarchy-z");
  zeta.environment.os = "iPadOS 26.5.0";
  zeta.environment.browser = "Zeta 99.1";
  zeta.environment.context = "webview";
  const alpha = fixture("hierarchy-a");
  alpha.environment.os = "iPadOS 26.5";
  alpha.environment.browser = "Alpha 12.0";
  const other = fixture("hierarchy-other");
  other.environment.os = "macOS 27.0.1 arm64";
  other.environment.browser = "Other 7.2";
  await publish(page, [zeta, other, alpha]);
  for (const id of ["individual-table", "pair-table"]) {
    await expect(page.locator(`#${id} .os-heading`)).toHaveText([
      "iPadOS 26",
      "macOS 27",
    ]);
    await expect(page.locator(`#${id} .theme-heading`)).toHaveText([
      "Light",
      "Dark",
      "Light",
      "Dark",
    ]);
    await expect(page.locator(`#${id} .capture-browser`)).toHaveText([
      "Alpha 12",
      "Zeta 99",
      "Alpha 12",
      "Zeta 99",
      "Other 7",
      "Other 7",
    ]);
  }
  const associations = await page
    .locator("#individual-table tbody td")
    .first()
    .evaluate((cell) =>
      cell
        .getAttribute("headers")
        .split(" ")
        .map((id) => document.getElementById(id).textContent),
    );
  expect(associations[0]).toBe("AccentColor");
  expect(associations[1]).toBe("iPadOS 26");
  expect(associations[2]).toBe("Light");
  expect(associations[3]).toContain("Alpha 12");
});

test("color cells fill their backgrounds with readable raw hex, handle alpha, and stay unchanged on hover", async ({
  page,
  browserName,
}) => {
  const capture = fixture("color-backgrounds");
  for (const [name, rgba] of [
    ["Canvas", [255, 255, 255, 255]],
    ["Field", [119, 119, 119, 255]],
    ["SelectedItem", [51, 181, 229, 102]],
  ])
    capture.schemes.light.colors[name] = {
      supported: true,
      rgba,
      hex: hex(rgba),
      computed: `rgba(${rgba.slice(0, 3).join(", ")}, ${rgba[3] / 255})`,
      conversion: "rgb-serialization",
    };
  await publish(page, [capture]);
  const cell = (name) =>
    page
      .locator("#individual-table tbody tr")
      .filter({
        has: page.getByRole("rowheader", { name, exact: true }),
      })
      .locator("td")
      .first();
  await expect(page.locator(".table-swatch")).toHaveCount(0);
  for (const name of ["Canvas", "Field", "SelectedItem", "ButtonFace"]) {
    const target = cell(name);
    await expect(target.locator("code")).toHaveText(
      capture.schemes.light.colors[name].hex,
    );
    const styles = await target.evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
    }));
    const channels = (value) => value.match(/\d+/g).map(Number);
    expect(
      contrast(channels(styles.color), channels(styles.background)),
    ).toBeGreaterThanOrEqual(4.5);
    await target.hover();
    expect(
      await target.evaluate((node) => ({
        color: getComputedStyle(node).color,
        background: getComputedStyle(node).backgroundColor,
      })),
    ).toEqual(styles);
  }
  await expect(cell("SelectedItem")).toHaveCSS(
    "background-color",
    `rgb(${composite([51, 181, 229, 102], [255, 255, 255]).map(Math.round).join(", ")})`,
  );
  await expect(
    page.locator("table .is-hover-row, table .is-hover-column"),
  ).toHaveCount(0);
  if (browserName === "chromium") {
    await page.emulateMedia({ forcedColors: "active" });
    await expect(cell("Field")).toHaveCSS(
      "background-color",
      "rgb(119, 119, 119)",
    );
  }
});

test("a translucent color with no recorded opaque backdrop keeps its hex without inventing a preview", async ({
  page,
}) => {
  const capture = fixture("unknown-alpha");
  for (const snapshot of Object.values(capture.schemes)) {
    snapshot.backdrop = "canvas";
    snapshot.colors.Canvas = {
      supported: false,
      computed: null,
      rgba: null,
      hex: null,
    };
    snapshot.colors.Highlight = {
      supported: true,
      computed: "rgba(51, 181, 229, 0.4)",
      rgba: [51, 181, 229, 102],
      hex: "#33b5e566",
      conversion: "rgb-serialization",
    };
  }
  await publish(page, [capture]);
  const row = page.locator("#individual-table tbody tr").filter({
    has: page.getByRole("rowheader", { name: "Highlight", exact: true }),
  });
  await expect(row.locator("td").first()).toContainText("#33b5e566");
  await expect(row.locator("td").first()).toContainText("Preview unavailable");
  await expect(row.locator("td.color-value")).toHaveCount(0);
});

test("sticky keyword headers preserve native associations and keyboard-visible controls while tables scroll", async ({
  page,
}) => {
  const ordinary = fixture("sticky-normal");
  const forced = fixture("sticky-forced");
  forced.environment.os = "Windows 11";
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = "Aquatic";
  await publish(page, [ordinary, forced]);
  for (const direction of ["ltr", "rtl"]) {
    await page.evaluate((value) => {
      document.documentElement.dir = value;
    }, direction);
    for (const width of [320, 1400]) {
      await page.setViewportSize({ width, height: 900 });
      for (const id of [
        "individual-table",
        "pair-table",
        "forced-individual-table",
        "forced-pair-table",
      ]) {
        const table = page.locator(`#${id}`);
        const region = table.locator("..");
        const first = table.locator("tbody th[scope='row']").first();
        await region.evaluate((node) => {
          node.scrollLeft =
            getComputedStyle(node).direction === "rtl"
              ? -node.scrollWidth
              : node.scrollWidth;
        });
        const area = await region.boundingBox();
        const header = await first.boundingBox();
        expect(
          Math.abs(
            direction === "rtl"
              ? header.x + header.width - area.x - area.width
              : header.x - area.x,
          ),
        ).toBeLessThanOrEqual(2);
        await expect(first).toHaveCSS("position", "sticky");
        const button = table.locator(".details-button").first();
        await button.focus();
        const control = await button.boundingBox();
        const pinned = await first.boundingBox();
        expect(control.x).toBeGreaterThanOrEqual(
          direction === "rtl" ? area.x - 1 : pinned.x + pinned.width - 1,
        );
        expect(control.x + control.width).toBeLessThanOrEqual(
          direction === "rtl" ? pinned.x + 1 : area.x + area.width + 1,
        );
        expect(
          await table.locator("td[headers]").evaluateAll((cells) =>
            cells.every((cell) =>
              cell
                .getAttribute("headers")
                .split(" ")
                .every((id) => document.getElementById(id)?.tagName === "TH"),
            ),
          ),
        ).toBe(true);
        if (
          width === 320 &&
          (await region.evaluate((node) => node.scrollWidth > node.clientWidth))
        ) {
          await region.evaluate((node) => {
            node.scrollLeft = 0;
          });
          await region.focus();
          await page.keyboard.press(
            direction === "rtl" ? "ArrowLeft" : "ArrowRight",
          );
          await expect
            .poll(() => region.evaluate((node) => Math.abs(node.scrollLeft)))
            .toBeGreaterThan(0);
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
  }
});

for (const fallback of [false, true]) {
  test(`shared command dialogs keep headers compact, preserve metadata, and restore focus (${fallback ? "fallback" : "native"})`, async ({
    page,
  }) => {
    if (fallback)
      await page.addInitScript(() => {
        delete HTMLButtonElement.prototype.commandForElement;
      });
    const normal = fixture("dialog-normal");
    normal.environment.browser = "Chrome 157.0.8103.39";
    normal.environment.os = "Windows 11";
    const forced = structuredClone(normal);
    forced.id = "dialog-forced";
    forced.media.forcedColors = true;
    forced.environment.forcedColorTheme = "Aquatic";
    await publish(page, [normal, forced]);
    const buttons = await page.locator("table .details-button").all();
    expect(buttons).toHaveLength(6);
    const target = await buttons[0].getAttribute("commandfor");
    await expect(page.locator("#capture-dialogs dialog")).toHaveCount(1);
    for (const button of buttons) {
      await expect(button).toHaveText("Details");
      await expect(button).toHaveAccessibleName(
        "Chrome 157 Windows 11 Details",
      );
      await expect(button).toHaveAttribute("commandfor", target);
      await expect(button).toHaveAttribute("command", "show-modal");
    }
    await expect(page.locator("table details")).toHaveCount(0);
    for (const table of await page.locator("table").all())
      await expect(table).not.toContainText(/Runs? \d/);
    const dialog = page.locator(`#${target}`);
    await buttons[0].focus();
    const before = await page.locator("#individual-table").boundingBox();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2 > span")).toHaveText([
      "Chrome 157",
      "Windows 11",
    ]);
    await expect(dialog).toHaveAccessibleName("Chrome 157 Windows 11");
    await expect(dialog.locator("h3")).toHaveCount(0);
    await expect(
      dialog.locator(".capture-metadata").first().locator("dt"),
    ).toHaveText([
      "Captured at",
      "Browser",
      "OS",
      "Context",
      "Forced-color theme",
      "Forced colors",
      "OS color preference",
      "Contrast preference",
      "Display mode",
      "User agent",
    ]);
    const close = dialog.getByRole("button", {
      name: "Close details",
      exact: true,
    });
    await expect(close).toHaveText("Close");
    await expect(dialog.locator(":scope > :last-child")).toHaveAttribute(
      "command",
      "close",
    );
    await expect(close).toBeFocused();
    const originalViewport = page.viewportSize();
    for (const width of [1400, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const direction of ["ltr", "rtl"]) {
        await page.evaluate((value) => {
          document.documentElement.dir = value;
        }, direction);
        for (const fontSize of ["100%", "200%"]) {
          await page.evaluate((value) => {
            document.documentElement.style.fontSize = value;
          }, fontSize);
          const titleBox = await dialog.locator("h2").boundingBox(),
            closeBox = await close.boundingBox(),
            box = await dialog.boundingBox();
          const inlineGap =
            direction === "ltr"
              ? closeBox.x - titleBox.x - titleBox.width
              : titleBox.x - closeBox.x - closeBox.width;
          expect(
            closeBox.y + closeBox.height <= titleBox.y || inlineGap >= 8,
          ).toBe(true);
          const padding = await dialog.evaluate((node) =>
            parseFloat(getComputedStyle(node).paddingBlockStart),
          );
          expect(Math.abs(closeBox.y - box.y - padding)).toBeLessThanOrEqual(3);
          expect(
            await dialog.evaluate((node) => node.scrollWidth),
          ).toBeLessThanOrEqual(
            await dialog.evaluate((node) => node.clientWidth),
          );
        }
      }
    }
    await page.evaluate(() => {
      document.documentElement.dir = "ltr";
      document.documentElement.style.removeProperty("font-size");
    });
    await page.setViewportSize(originalViewport);
    expect(await dialog.evaluate((node) => node.matches(":modal"))).toBe(true);
    await expect(dialog.locator("dd")).toContainText([
      "Chrome 157.0.8103.39",
      "Windows 11",
    ]);
    await expect(dialog.locator(".capture-metadata")).toHaveCount(2);
    const after = await page.locator("#individual-table").boundingBox();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(buttons[0]).toBeFocused();
    for (const button of buttons.slice(1)) {
      await button.click();
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Close details", exact: true })
        .click();
      await expect(button).toBeFocused();
    }
  });
}

test("dialogs omit empty Notes but preserve supplied Notes for each observation", async ({
  page,
}) => {
  const notes = ["", " \t ", "  Keep this observation note.  "];
  await publish(
    page,
    notes.map((note, index) => {
      const capture = fixture(`notes-${index}`);
      capture.environment.notes = note;
      return capture;
    }),
  );
  await page.locator("#individual-table .details-button").first().click();
  const metadata = page.locator("dialog[open] .capture-metadata");
  await expect(metadata).toHaveCount(3);
  for (const index of [0, 1])
    await expect(
      metadata
        .nth(index)
        .locator("dt")
        .filter({ hasText: /^Notes$/ }),
    ).toHaveCount(0);
  const label = metadata
    .nth(2)
    .locator("dt")
    .filter({ hasText: /^Notes$/ });
  await expect(label).toHaveCount(1);
  expect(
    await label.evaluate((node) => node.nextElementSibling.textContent),
  ).toBe(notes[2]);
});

test("Chrome iOS headers omit webview without hiding other contexts or changing metadata", async ({
  page,
}) => {
  const cases = [
    ["Chrome 155", "iPadOS 26.5", "webview", false],
    ["Chrome 156", "iOS 26.5", "webview", false],
    ["Chrome 157", "Android 17", "webview", true],
    ["Safari 26", "iPadOS 26.5", "webview", true],
    ["Chrome 158", "iPadOS 26.5", "private", true],
  ];
  await publish(
    page,
    cases.map(([browser, os, context], index) => {
      const capture = fixture(`context-${index}`);
      Object.assign(capture.environment, { browser, os, context });
      return capture;
    }),
  );
  for (const [browser, , context, shown] of cases) {
    const headings = page
      .locator("table .capture-heading")
      .filter({ has: page.getByText(browser, { exact: true }) });
    for (const heading of await headings.all()) {
      await expect(heading.getByText(context, { exact: true })).toHaveCount(
        shown ? 1 : 0,
      );
      await expect(heading).toHaveAccessibleName(
        `${browser}${shown ? ` ${context}` : ""}`,
      );
    }
    await headings
      .first()
      .getByRole("button", { name: /Details$/ })
      .click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    expect(
      await dialog
        .locator("dt")
        .filter({ hasText: /^Context$/ })
        .evaluate((node) => node.nextElementSibling.textContent),
    ).toBe(context);
    await page.keyboard.press("Escape");
  }
});

test("forced tables organize theme, browser, and mode without leaking into ordinary tables", async ({
  page,
}) => {
  const normal = fixture("ordinary");
  const forced = fixture("aquatic");
  forced.environment.os = "Windows 11";
  forced.environment.browser = "Firefox 159.0";
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = "Aquatic";
  const split = structuredClone(forced);
  split.id = "desert";
  split.environment.forcedColorTheme = "Desert";
  split.schemes.dark = structuredClone(split.schemes.dark);
  split.schemes.dark.colors.SelectedItem = {
    supported: true,
    rgba: [1, 2, 3, 255],
    hex: "#010203",
    computed: "rgb(1, 2, 3)",
    conversion: "rgb-serialization",
  };
  await publish(page, [normal, forced, split]);
  await expect(page.locator("#individual-table .mode-label")).toHaveText([
    "Light",
    "Dark",
  ]);
  for (const id of ["forced-individual-table", "forced-pair-table"]) {
    await expect(page.locator(`#${id} .theme-heading`)).toHaveText([
      "Aquatic",
      "Desert",
    ]);
    await expect(page.locator(`#${id} .capture-browser`)).toHaveText([
      "Firefox 159",
      "Firefox 159",
    ]);
    await expect(page.locator(`#${id} .mode-label`)).toHaveText([
      "Light & Dark",
      "Light",
      "Dark",
    ]);
  }
  await expect(page.locator("#forced-heading")).toHaveText(
    "Evaluating forced colors",
  );
  for (const width of [320, 1400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  expect(
    await page.locator("td[headers]").evaluateAll((cells) =>
      cells.every((cell) =>
        cell
          .getAttribute("headers")
          .split(" ")
          .every((id) => document.getElementById(id)?.tagName === "TH"),
      ),
    ),
  ).toBe(true);
});

test("comparison tables group environments, show both modes, and retain split forced palettes and repeat provenance", async ({
  page,
}) => {
  const normal = fixture("normal-matrix");
  normal.schemes.light = structuredClone(normal.schemes.light);
  normal.schemes.light.colors.Canvas = {
    supported: true,
    rgba: [255, 255, 255, 255],
    hex: "#ffffff",
    computed: "rgb(255, 255, 255)",
    conversion: "rgb-serialization",
  };
  const forced = fixture("forced-matrix");
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = "Aquatic";
  forced.schemes.dark = structuredClone(forced.schemes.light);
  forced.schemes.dark.computedColorScheme = "dark";
  const repeat = structuredClone(forced);
  repeat.id = "repeat-matrix";
  repeat.environment.notes = "Independent repeated observation";
  const split = structuredClone(forced);
  split.id = "split-matrix";
  split.environment.forcedColorTheme = "Desert";
  split.schemes.dark.colors.SelectedItem = {
    supported: true,
    rgba: [1, 2, 3, 255],
    hex: "#010203",
    computed: "rgb(1, 2, 3)",
    conversion: "rgb-serialization",
  };
  await publish(page, [normal, forced, repeat, split]);
  await expect(page.getByLabel("Display mode")).toHaveCount(0);
  await expect(page.locator("#individual-table .capture-heading")).toHaveCount(
    2,
  );
  for (const table of ["individual-table", "pair-table"]) {
    await expect(page.locator(`#${table} .mode-label`)).toHaveText([
      "Light",
      "Dark",
    ]);
  }
  await expect(page.locator("#forced-individual-table .mode-label")).toHaveText(
    ["Light & Dark", "Light", "Dark"],
  );
  const canvas = page.locator("#individual-table tbody tr").filter({
    has: page.getByRole("rowheader", { name: "Canvas", exact: true }),
  });
  await expect(canvas.locator("td code").first()).toHaveText("#ffffff");
  await expect(canvas.locator("td code").nth(1)).toHaveText("#000000");
  const verdicts = page
    .locator("#pair-table tbody tr")
    .filter({
      has: page.getByRole("rowheader", {
        name: "CanvasText on Canvas",
        exact: true,
      }),
    })
    .first()
    .locator("td.contrast-result");
  await expect(verdicts.nth(0).locator("strong").first()).toHaveText("21.00:1");
  await expect(verdicts.nth(1).locator("strong").first()).toHaveText("1.00:1");
  const summary = page.locator("#individual-table .details-button").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#capture-dialogs dialog[open]")).toContainText(
    "Independent repeated observation",
  );
  expect(
    await page.locator("td[headers]").evaluateAll((cells) =>
      cells.every((cell) =>
        cell
          .getAttribute("headers")
          .split(" ")
          .every((id) => document.getElementById(id)?.tagName === "TH"),
      ),
    ),
  ).toBe(true);
});

test("forced-color scroll regions have caption-based names and keyboard focus with or without JavaScript", async ({
  browser,
  baseURL,
  browserName,
}) => {
  const forced = fixture("named-forced-regions");
  forced.media.forcedColors = true;
  forced.environment.forcedColorTheme = "Aquatic";
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ baseURL, javaScriptEnabled });
    try {
      const page = await context.newPage();
      await publish(page, [fixture("normal-region"), forced]);
      for (const [table, name] of [
        [
          "forced-individual-table",
          "Forced-color values by theme, browser, and mode",
        ],
        [
          "forced-pair-table",
          "Forced-color pairs and contrast by theme, browser, and mode",
        ],
      ]) {
        const region = page.locator(`#${table}`).locator("..");
        await expect(region).toHaveAccessibleName(name);
        await region.focus();
        await expect(region).toBeFocused();
        // Script-disabled WebKit test contexts suppress native arrow scrolling.
        if (javaScriptEnabled || browserName !== "webkit") {
          await region.press("ArrowDown");
          await expect
            .poll(() => region.evaluate((node) => node.scrollTop))
            .toBeGreaterThan(0);
        }
      }
    } finally {
      await context.close();
    }
  }
});

test("verdict cells distinguish all, some, no, and unavailable thresholds with readable separate lines", async ({
  page,
  browserName,
}) => {
  const capture = fixture("verdicts");
  for (const snapshot of Object.values(capture.schemes)) {
    for (const [name, rgba] of [
      ["Canvas", [255, 255, 255, 255]],
      ["Field", [255, 255, 255, 255]],
      ["FieldText", [119, 119, 119, 255]],
    ]) {
      snapshot.colors[name] = {
        supported: true,
        computed: `rgb(${rgba.slice(0, 3).join(", ")})`,
        rgba,
        hex: hex(rgba),
        conversion: "rgb-serialization",
      };
    }
    snapshot.colors.Mark = {
      supported: false,
      computed: null,
      rgba: null,
      hex: null,
    };
  }
  await publish(page, [capture]);
  const verdict = (name) =>
    page
      .locator("#pair-table tbody tr")
      .filter({
        has: page.getByRole("rowheader", {
          name: new RegExp(` on ${name}$`),
        }),
      })
      .first()
      .locator(".contrast-result")
      .first();
  const success = verdict("Canvas");
  const mixed = verdict("Field");
  const failure = verdict("ButtonFace");
  const unavailable = verdict("Mark");
  for (const [cell, status] of [
    [success, "pass"],
    [mixed, "mixed"],
    [failure, "fail"],
    [unavailable, "unavailable"],
  ]) {
    await expect(cell).toHaveAttribute("data-verdict", status);
  }
  await expect(success.locator(":scope > p > strong")).toHaveText([
    "21.00:1",
    "Normal AA:",
    "Normal AAA:",
    "Large AA:",
    "Large AAA:",
    "Non-text:",
  ]);
  await expect(mixed.locator(":scope > p")).toHaveText([
    "4.48:1",
    "Normal AA: fail",
    "Normal AAA: fail",
    "Large AA: pass",
    "Large AAA: fail",
    "Non-text: pass",
  ]);
  await expect(unavailable).toContainText("Not measured:");
  for (const mode of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: mode });
    const backgrounds = [];
    for (const cell of [success, mixed, failure, unavailable]) {
      const style = await cell.evaluate((node) => ({
        foreground: getComputedStyle(node).color,
        background: getComputedStyle(node).backgroundColor,
      }));
      const channels = (value) => value.match(/\d+/g).map(Number);
      expect(
        contrast(channels(style.foreground), channels(style.background)),
      ).toBeGreaterThanOrEqual(4.5);
      backgrounds.push(style.background);
    }
    expect(new Set(backgrounds).size).toBe(4);
  }
  if (browserName === "chromium") {
    await page.emulateMedia({ forcedColors: "active" });
    const forcedStyle = await success.evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
      canvas: getComputedStyle(document.documentElement).backgroundColor,
      text: getComputedStyle(document.body).color,
    }));
    expect(forcedStyle.background).toBe(forcedStyle.canvas);
    expect(forcedStyle.color).toBe(forcedStyle.text);
  }
});

test("compact headers keep full provenance in keyboard-accessible details and preserve unknown theme states", async ({
  page,
}) => {
  const captures = [
    fixture("none"),
    fixture("named"),
    fixture("legacy"),
    fixture("unknown"),
    fixture("named-inactive"),
  ];
  captures[1].media.forcedColors = true;
  captures[1].environment.forcedColorTheme = "Aquatic";
  captures[2].media.forcedColors = true;
  for (const capture of captures.slice(1, 3)) {
    capture.schemes.dark = structuredClone(capture.schemes.light);
    capture.schemes.dark.computedColorScheme = "dark";
  }
  captures[3].media.forcedColors = null;
  captures[4].environment.forcedColorTheme = "Desert";
  await publish(page, captures);
  const headings = page.locator("#individual-table .capture-heading");
  await expect(page.locator("#individual-table .mode-label")).toHaveText([
    "Desert (forced colors inactive) · Light",
    "Forced colors unknown · Light",
    "Light",
    "Dark",
    "Desert (forced colors inactive) · Dark",
    "Forced colors unknown · Dark",
  ]);
  await expect(
    page.locator("#forced-individual-table .theme-heading"),
  ).toHaveText(["Aquatic", "Unnamed theme"]);
  const first = headings.first();
  await expect(first.locator(":scope > p")).toHaveText([
    "Unit fixture",
    "Fixture",
  ]);
  const details = page.locator("#capture-dialogs dialog").first();
  await expect(details).not.toBeVisible();
  await first.locator(".details-button").focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(details).toContainText("2000-01-01T00:00:00.000Z");
  await expect(details.locator("dt")).not.toContainText(["light backdrop"]);
});

test("the capture page gets directly to metadata and offers a download immediately", async ({
  page,
}) => {
  await expect(
    page.locator("#scheme, #backdrop, #palette, #import"),
  ).toHaveCount(0);
  await page.getByLabel("Browser and version").fill("Capture browser 1");
  await page.getByLabel("OS and version").fill("Capture OS 1");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(
    page.getByRole("link", { name: "Download JSON", exact: true }),
  ).toBeFocused();
  const data = JSON.parse(await page.getByLabel("Exported JSON").inputValue());
  expect(data.captures).toHaveLength(1);
  expect(Object.keys(data.captures[0].schemes.light.colors)).toHaveLength(42);
  await expect(
    page.getByRole("link", { name: "Submit this snapshot on GitHub" }),
  ).toHaveAttribute("href", /issues\/new\?template=color-snapshot.yml/);
});

test("capture metadata containing verify is rejected until corrected", async ({
  page,
}) => {
  await page.getByLabel("Browser and version").fill("Browser 1");
  await page.getByLabel("OS and version").fill("OS 1");
  for (const field of ["browser", "os", "notes"]) {
    if (field === "notes")
      await page
        .getByText("Optional context and notes", { exact: true })
        .click();
    await page.locator(`#${field}`).fill("Reported; VERIFY");
    if (field === "notes")
      await page
        .getByText("Optional context and notes", { exact: true })
        .click();
    await page.getByRole("button", { name: "Capture light and dark" }).click();
    await expect(page.locator("#capture-result")).toBeHidden();
    expect(
      await page.locator(`#${field}`).evaluate((n) => n.validity.customError),
    ).toBe(true);
    await page
      .locator(`#${field}`)
      .fill(field === "notes" ? "" : "Confirmed 1");
  }
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#capture-result")).toBeVisible();
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
            platformVersion: "26.4.2",
          };
        },
      },
    });
  });
  await page.reload();
  expect(await page.evaluate(() => window.hintRequests)).toBe(0);
  await expect(page.locator("#metadata-source")).toContainText("user-agent");
  await expect(page.locator("#metadata-source")).toContainText(
    "freeze or shorten",
  );
  await page
    .getByRole("button", { name: "Populate from Client Hints" })
    .click();
  await expect(page.getByLabel("Browser and version")).toHaveValue(
    "Chromium 156.1.2.3",
  );
  await expect(page.getByLabel("OS and version")).toHaveValue(
    "macOS 26.4.2 (reported; verify)",
  );
  await expect(page.locator("#metadata-source")).toContainText("Client Hints");
  await expect(page.locator("#metadata-source")).toContainText(
    "different browser brand",
  );
  await expect(page.locator("#status")).toBeEmpty();
});

test("refused version hints preserve entered metadata and report the failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        async getHighEntropyValues() {
          throw new Error("Version details denied");
        },
      },
    });
  });
  await page.reload();
  await page.getByLabel("Browser and version").fill("Verified browser");
  const source = await page.locator("#metadata-source").textContent();
  await page
    .getByRole("button", { name: "Populate from Client Hints" })
    .click();
  await expect(page.locator("#error")).toContainText("Version details denied");
  await expect(page.getByLabel("Browser and version")).toHaveValue(
    "Verified browser",
  );
  await expect(
    page.getByRole("button", { name: "Populate from Client Hints" }),
  ).toBeEnabled();
  await expect(page.locator("#metadata-source")).toHaveText(source);
});

test("partial Client Hints describe only the fields they replace", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        async getHighEntropyValues() {
          return { platform: "macOS", platformVersion: "27.0.1" };
        },
      },
    });
  });
  await page.reload();
  await page.getByLabel("Browser and version").fill("Confirmed browser");
  await page.getByLabel("OS and version").fill("Confirmed OS");
  await page.getByRole("button", { name: "Capture light and dark" }).click();
  await expect(page.locator("#status")).toContainText("download is ready");
  await page
    .getByRole("button", { name: "Populate from Client Hints" })
    .click();
  await expect(page.getByLabel("Browser and version")).toHaveValue(
    "Confirmed browser",
  );
  await expect(page.locator("#metadata-source")).toContainText(
    "Browser: edited by you",
  );
  await expect(page.locator("#metadata-source")).toContainText(
    "OS: reported through Client Hints",
  );
  await expect(page.locator("#status")).toBeEmpty();
  await page.getByLabel("OS and version").fill("Confirmed OS");
  await expect(page.locator("#metadata-source")).toContainText(
    "Browser and OS: edited by you",
  );
  await expect(page.locator("#metadata-source")).not.toContainText(
    "reported through Client Hints",
  );
});

test("the study protocol is a linked, readable HTML page without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await page
      .getByRole("link", { name: "Study protocol", exact: true })
      .click();
    await expect(page).toHaveURL(/\/protocol\.html$/);
    await expect(
      page.getByRole("heading", { name: "Study protocol", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("main")).toContainText("/approve-snapshot");
    await expect(page.locator("main")).toContainText("42");
    await expect(page.locator("main")).toContainText("100");
    await expect(page.locator("main")).toContainText("5 MB");
    await expect(page.locator("script")).toHaveCount(0);
    await expect(page.locator('a[href*="PLAN.md"]')).toHaveCount(0);
    await expect(page.locator("footer")).toContainText("Aaron Gustafson");
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Take a snapshot", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Take a system color snapshot",
        level: 1,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
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
  await expect(page.locator("#capture-heading")).toBeVisible();
  await expect(page.locator("#published-match")).toHaveCount(0);
  await expect(page.locator("#scheme, #import")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Capture light and dark" }),
  ).toBeDisabled();
  await page.goto("./");
  await expect(page.locator("#study-intro")).toBeVisible();
  await expect(page.locator("#forced-colors-guide")).toBeVisible();
  await expect(page.locator("#individual-table")).toBeVisible();
  await expect(page.locator("#pair-table")).toBeVisible();
  await expect(
    page.locator("#individual-table tbody:not([hidden]) tr"),
  ).toHaveCount(19);
  await expect(page.locator("#pair-table tbody:not([hidden]) tr")).toHaveCount(
    10,
  );
  await expect(
    page.locator("#individual-table tbody:not([hidden]) td code").first(),
  ).toHaveText(/^#[\da-f]{6}(?:[\da-f]{2})?$/);
  await expect(page.locator("#forced-section")).toBeVisible();
  await expect(page.locator("tbody[data-deprecated][hidden]")).toHaveCount(4);
  await expect(page.getByLabel("Include deprecated keywords")).toHaveCount(0);
  await expect(page.locator("#deprecated-note")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Take a snapshot", exact: true }),
  ).toHaveAttribute("href", "./test.html");
  await context.close();
});

test("deprecated controls only toggle the prebuilt row groups without replacing tables or dialogs", async ({
  page,
}) => {
  const forced = fixture("forced-toggle");
  forced.media.forcedColors = true;
  await publish(page, [fixture("normal-toggle"), forced]);
  await page.evaluate(() => {
    window.comparisonNodes = [
      ...document.querySelectorAll("table *, #capture-dialogs *"),
    ];
  });
  const toggle = page.getByLabel("Include deprecated keywords");
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAccessibleDescription(
    /current-generation system color keywords/,
  );
  await expect(page.locator("#deprecated-controls-template")).toHaveCount(0);
  await expect(page.locator("#deprecated, #deprecated-note")).toHaveCount(2);
  for (const width of [320, 1400]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.locator("#deprecated-note").evaluate((note) => {
        const controls = note.nextElementSibling;
        return [note, controls].every((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        });
      }),
    ).toBe(true);
  }
  await toggle.focus();
  for (const checked of [true, false, true]) {
    await toggle.press("Space");
    if (checked) await expect(toggle).toBeChecked();
    else await expect(toggle).not.toBeChecked();
    for (const id of [
      "individual-table",
      "forced-individual-table",
      "pair-table",
      "forced-pair-table",
    ]) {
      const body = page.locator(`#${id} tbody[data-deprecated]`);
      await expect(body.locator("tr")).toHaveCount(
        id.endsWith("pair-table") ? 5 : 23,
      );
      if (checked) await expect(body).toBeVisible();
      else await expect(body).toBeHidden();
    }
    await expect(toggle).toBeFocused();
    expect(
      await page.evaluate(() =>
        window.comparisonNodes.every((node) => node.isConnected),
      ),
    ).toBe(true);
  }
});

test("deprecated instructions and controls remain absent if their module cannot load", async ({
  page,
}) => {
  await page.route("**/comparison-ui.js", (route) => route.abort());
  await page.goto("./");
  await expect(page.locator("#individual-table")).toBeVisible();
  await expect(page.locator("#deprecated, #deprecated-note")).toHaveCount(0);
  await expect(page.locator("tbody[data-deprecated][hidden]")).toHaveCount(4);
});

test("deprecated controls are not injected when enhancement initialization fails", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.ResizeObserver = class {
      constructor() {
        throw new Error("Header observation failed");
      }
    };
  });
  await page.goto("./");
  await expect(page.locator("#error")).toContainText(
    "Header observation failed",
  );
  await expect(page.locator("#deprecated, #deprecated-note")).toHaveCount(0);
  await expect(page.locator("#individual-table")).toBeVisible();
  await expect(page.locator("tbody[data-deprecated][hidden]")).toHaveCount(4);
});

test("study pages explain color preferences and invite designers to contribute snapshots", async ({
  page,
}) => {
  await publish(page, []);
  await expect(page.locator("#capture-count")).toHaveText("0");
  await expect(page.locator("#status")).toBeEmpty();
  await expect(
    page.locator(
      "#study-intro a[href='https://github.com/aarongustafson/tabbed-interface/issues/8']",
    ),
  ).toBeVisible();
  await expect(page.locator("#study-intro")).toContainText("if it’s missing");
  await expect(page.locator("#study-intro")).toContainText(
    "light, dark, forced-color, and high-contrast",
  );
  await expect(page.locator("#deprecated-note")).toContainText(
    "current-generation system color keywords",
  );
  await expect(page.locator("#forced-guide-heading")).toHaveText(
    "Forced colors",
  );
  await expect(page.locator("#forced-guide-heading")).toHaveJSProperty(
    "tagName",
    "H2",
  );
  await expect(
    page.locator("#forced-colors-guide > #forced-section"),
  ).toHaveCount(1);
  await expect(page.locator("#forced-heading")).toHaveJSProperty(
    "tagName",
    "H3",
  );
  await expect(
    page.getByText("We need observations from those other settings too.", {
      exact: false,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("The default view uses current CSS names.", {
      exact: false,
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const root = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const heading = parseFloat(
        getComputedStyle(document.getElementById("individual-heading"))
          .fontSize,
      );
      return [...document.querySelectorAll("caption")].every((caption) => {
        const size = parseFloat(getComputedStyle(caption).fontSize);
        return size >= root * 1.2 && size < heading;
      });
    }),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Why this study?", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#study-intro > p").first()).not.toHaveCSS(
    "max-inline-size",
    "none",
  );
  await expect(
    page
      .locator("#study-intro")
      .getByRole("link", { name: "system color keywords", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/system-color",
  );
  await expect(page.locator("#forced-colors-guide")).toBeVisible();
  await expect(
    page.locator("#forced-colors-guide").getByRole("link", {
      name: "Firefox’s own color overrides can also activate them on macOS and Linux",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    "https://firefox-source-docs.mozilla.org/accessible/HCMMediaQueries.html",
  );
  await expect(page.locator("#forced-section")).toBeHidden();
  await page
    .getByRole("region", { name: "Don’t see your browser?", exact: true })
    .getByRole("link", { name: "Take a snapshot", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Take a system color snapshot",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("header")).toContainText("system colors");
  await expect(page.locator("#capture-heading")).toBeVisible();
  await page.getByLabel("Browser and version").fill("Confirmed browser");
  await page.getByLabel("OS and version").fill("Confirmed OS");
  await page
    .getByRole("button", {
      name: "Capture light and dark system colors",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Submit this snapshot on GitHub",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    "https://github.com/aarongustafson/system-color-study/issues/new?template=color-snapshot.yml",
  );
  await expect(
    page.getByRole("button", {
      name: "Capture light and dark system colors",
      exact: true,
    }),
  ).toBeEnabled();
  expect(
    await page
      .locator("[aria-labelledby], [aria-describedby]")
      .evaluateAll((nodes) =>
        nodes.every((node) =>
          ["aria-labelledby", "aria-describedby"].every(
            (name) =>
              !node.hasAttribute(name) ||
              node
                .getAttribute(name)
                .split(/\s+/)
                .every((id) => document.getElementById(id)),
          ),
        ),
      ),
  ).toBe(true);
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
  await publish(page, []);
  await expect(page.locator("#capture-form")).toHaveCount(0);
  await expect(page.locator("#palette")).toHaveCount(0);
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Take a snapshot" }),
  ).toHaveAttribute("href", "./test.html");
  await expect(page.locator("#capture-count")).toHaveText("0");
  expect(await page.evaluate(() => window.systemColorProbeCalls)).toBe(0);
});

test("the built homepage needs no runtime dataset or rendering modules", async ({
  page,
}) => {
  const forbidden = [];
  await page.route(
    /\/(?:published\.json|app\.js|model\.js|sampler\.js|comparison-renderer\.js)$/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto("./");
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.locator("#capture-count")).toHaveText(/^\d+$/);
  await expect(page.locator("#individual-table")).toBeVisible();
  await expect(page.locator("#empty")).toHaveCount(0);
  await expect(page.getByLabel("Include deprecated keywords")).toBeEnabled();
  expect(forbidden).toEqual([]);
});

test("the built homepage renders every actual committed capture", async ({
  page,
}) => {
  const response = await page.request.get(
    new URL("./published.json", page.url()).href,
  );
  expect(response.ok()).toBe(true);
  const data = await response.json();
  await page.goto("./");
  await expect(page.locator("#capture-count")).toHaveText(
    String(data.captures.length),
  );
  const sections = comparisonSections(
    data.captures.filter((capture) => capture.media.forcedColors !== true),
  );
  const groups = sections.flatMap((section) =>
    section.themes.flatMap((theme) => theme.groups),
  );
  const columns = groups.reduce(
    (count, group) => count + group.columns.length,
    0,
  );
  await expect(page.locator("#individual-table .capture-heading")).toHaveCount(
    groups.length,
  );
  await expect(page.locator("#individual-table .mode-heading")).toHaveCount(
    sections.reduce((count, section) => count + section.themes.length, 0),
  );
  await expect(page.locator("#individual-table .os-heading")).toHaveText(
    sections.map((section) => section.os),
  );
  const ipad = sections.find((section) => section.os === "iPadOS 26");
  for (const [browser, forcedColors] of [
    ["Firefox 160.0", true],
    ["Safari 27.0.1", false],
    ["Chrome 157.0.8103.39", false],
    ["Edge 155.0.4283.62", false],
  ]) {
    expect(data.captures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          environment: expect.objectContaining({ browser }),
          media: expect.objectContaining({
            prefersContrast: "more",
            forcedColors,
          }),
        }),
      ]),
    );
  }
  const windows = sections.find((section) => section.os === "Windows 11");
  expect(windows.themes.map((theme) => theme.name)).toEqual(["Light", "Dark"]);
  for (const theme of windows.themes)
    expect(theme.groups.map((group) => group.browser)).toEqual(
      expect.arrayContaining([
        "Chrome 157.0.0.0",
        "Edge 156.0.0.0",
        "Firefox 159.0",
      ]),
    );
  for (const theme of ipad.themes)
    expect(theme.groups.map((group) => [group.browser, group.context])).toEqual(
      expect.arrayContaining([
        ["Chrome 155.0.8059.37", "webview"],
        ["Safari 26.5", "normal"],
      ]),
    );
  await expect(
    page.locator("#pair-table tbody:not([hidden]) .contrast-result"),
  ).toHaveCount(columns * 10);
  for (const capture of data.captures) {
    await expect(page.locator("#capture-dialogs")).toContainText(
      capture.environment.browser,
    );
  }
});
