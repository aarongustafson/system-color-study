import {
  keywords,
  pairs,
  versions,
  hex,
  backdropRGB,
  pairResult,
  validateCollection,
  mergeCaptures,
  comparisonGroups,
  comparisonSections,
  compactEnvironmentLabel,
  composite,
  contrast,
} from "./model.js";
import { measureScheme, mediaSnapshot } from "./sampler.js";
import {
  detectEnvironment,
  environmentFromHints,
  exportFilename,
} from "./environment.js";

const byId = (id) => document.getElementById(id);
const isTestPage = document.body.dataset.studyPage === "test";
let captures = [];
let live;
let renderedCaptures;
let renderedDeprecated;
const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const visibleKeywords = () =>
  keywords.filter((item) => byId("deprecated").checked || !item.deprecated);
const visiblePairs = () =>
  pairs.filter((item) => byId("deprecated").checked || !item.deprecated);
const forcedLabel = (value) =>
  value === null ? "unknown" : value ? "active" : "inactive";
const label = (capture) =>
  `${capture.environment.browser} / ${capture.environment.os} · ${capture.environment.context} · ${capture.capturedAt} · ${["light", "dark"].map((scheme) => `${scheme}: ${capture.schemes[scheme].backdrop} backdrop, computed ${capture.schemes[scheme].computedColorScheme || "unsupported"}${capture.schemes[scheme].schemeSupported ? "" : ", requested CSS scheme unsupported"}`).join(" · ")} · OS preference: ${capture.media.prefersColorScheme} · contrast preference: ${capture.media.prefersContrast} · forced colors: ${forcedLabel(capture.media.forcedColors)}${capture.environment.forcedColorTheme?.trim() ? " · theme: " + capture.environment.forcedColorTheme.trim() : ""}`;

const environmentKey = (group) =>
  JSON.stringify([group.browser, group.os, group.context]);

function renderDialogs(groups) {
  const fragment = document.createDocumentFragment();
  const ids = new Map();
  groups.forEach((group, index) => {
    const id = `capture-dialog-${index}`;
    ids.set(environmentKey(group), id);
    const dialog = element("dialog");
    dialog.id = id;
    const title = element("h2");
    title.append(
      element("span", compactEnvironmentLabel(group.browser)),
      " ",
      element("span", compactEnvironmentLabel(group.os)),
    );
    title.id = `${id}-title`;
    dialog.setAttribute("aria-labelledby", title.id);
    const close = element("button", "Close");
    close.type = "button";
    close.autofocus = true;
    close.className = "dialog-close";
    close.setAttribute("aria-label", "Close details");
    close.setAttribute("commandfor", id);
    close.setAttribute("command", "close");
    dialog.addEventListener("close", () =>
      byId(dialog.dataset.opener)?.focus(),
    );
    dialog.append(title);
    for (const { capture } of group.runs) {
      const dl = element("dl");
      dl.className = "capture-metadata";
      const metadata = [
        ["Captured at", capture.capturedAt],
        ["Browser", capture.environment.browser],
        ["OS", capture.environment.os],
        ["Context", capture.environment.context],
        [
          "Forced-color theme",
          capture.environment.forcedColorTheme || "Not supplied",
        ],
        ["Forced colors", forcedLabel(capture.media.forcedColors)],
        ["OS color preference", capture.media.prefersColorScheme],
        ["Contrast preference", capture.media.prefersContrast],
        ["Display mode", capture.media.displayMode],
        ["Notes", capture.environment.notes || "Not supplied"],
        ["User agent", capture.environment.userAgent || "Not supplied"],
      ];
      for (const [name, value] of metadata)
        dl.append(element("dt", name), element("dd", value));
      dialog.append(dl);
    }
    dialog.append(close);
    fragment.append(dialog);
  });
  byId("capture-dialogs").replaceChildren(fragment);
  return ids;
}

function captureHeading(group, id, dialogId, forced = false) {
  const heading = element("th");
  heading.className = "capture-heading";
  for (const [type, text] of [
    ["browser", group.browser],
    ["os", group.os],
  ]) {
    const line = element("p", compactEnvironmentLabel(text));
    line.id = `${id}-${type}`;
    line.className = `capture-${type}${forced && type === "os" ? " visually-hidden" : ""}`;
    heading.append(line);
  }
  const showContext =
    group.context !== "normal" &&
    !(
      group.context === "webview" &&
      /^Chrome(?:\s|$)/i.test(group.browser) &&
      /^(?:iOS|iPadOS)(?:\s|$)/i.test(group.os)
    );
  if (showContext) {
    const context = element("p", group.context);
    context.id = `${id}-context`;
    heading.append(context);
  }
  heading.setAttribute(
    "aria-labelledby",
    `${id}-browser${showContext ? ` ${id}-context` : ""}`,
  );
  const button = element("button", "Details");
  button.type = "button";
  button.id = `${id}-details`;
  button.className = "details-button";
  button.setAttribute("aria-labelledby", `${id}-browser ${id}-os ${button.id}`);
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("commandfor", dialogId);
  button.setAttribute("command", "show-modal");
  heading.append(button);
  return heading;
}

function modeHeading(column, forced = false) {
  const heading = element("th");
  heading.className = "mode-heading";
  const capture = column.runs[0].capture;
  const name = capture.environment.forcedColorTheme?.trim();
  const theme =
    capture.media.forcedColors === false
      ? name
        ? `${name} (forced colors inactive)`
        : "No forced colors"
      : capture.media.forcedColors === true
        ? name || "Forced colors (unnamed)"
        : name
          ? `${name} (forced colors unknown)`
          : "Forced colors unknown";
  const mode = column.schemes[0] === "light" ? "Light" : "Dark";
  const text =
    column.schemes.length === 2
      ? "Light & Dark"
      : forced
        ? mode
        : theme === "No forced colors"
          ? mode
          : `${theme} · ${mode}`;
  const line = element("p", text);
  line.className = "mode-label";
  heading.append(line);
  if (!column.snapshot.schemeSupported)
    heading.append(element("p", "Requested scheme unsupported"));
  return heading;
}

function report(error) {
  console.error("System color study:", error);
  byId("status").textContent = "The operation failed. See the error message.";
  byId("error").textContent =
    error instanceof Error ? error.message : String(error);
  byId("error").hidden = false;
}
function clearError() {
  byId("error").hidden = true;
}
function renderVerdict(target, result) {
  target.classList.add("contrast-result");
  if (result.ratio === null) {
    target.dataset.verdict = "unavailable";
    target.append(element("p", "Not measured: " + result.reason));
    return;
  }
  const thresholds = [
    ["Normal AA", result.grades.normalAA],
    ["Normal AAA", result.grades.normalAAA],
    ["Large AA", result.grades.largeAA],
    ["Large AAA", result.grades.largeAAA],
    ["Non-text", result.nonTextThreshold],
  ];
  const passes = thresholds.filter(([, pass]) => pass).length;
  target.dataset.verdict =
    passes === thresholds.length ? "pass" : passes === 0 ? "fail" : "mixed";
  const ratio = element("p");
  ratio.append(element("strong", `${result.ratio.toFixed(2)}:1`));
  target.append(ratio);
  for (const [name, pass] of thresholds) {
    const line = element("p");
    line.append(element("strong", name + ":"), pass ? " pass" : " fail");
    target.append(line);
  }
}
function colorCell(color, snapshot) {
  const cell = element("td");
  if (!color.supported) {
    cell.textContent = "N/A";
  } else {
    cell.append(element("code", color.hex));
    cell.title = color.computed;
    const backdrop = backdropRGB(snapshot);
    if (color.rgba[3] === 255 || backdrop) {
      const rgb = (
        color.rgba[3] === 255
          ? color.rgba.slice(0, 3)
          : composite(color.rgba, backdrop)
      ).map(Math.round);
      cell.className = "color-value";
      cell.style.backgroundColor = hex([...rgb, 255]);
      cell.style.color =
        contrast([0, 0, 0], rgb) >= contrast([255, 255, 255], rgb)
          ? "#000000"
          : "#ffffff";
    } else
      cell.append(
        element("small", "Preview unavailable: no recorded opaque backdrop."),
      );
  }
  return cell;
}

function renderPalette(
  snapshot = live,
  colorTarget = byId("palette"),
  pairTarget = byId("live-pairs"),
  headingLevel = 3,
) {
  const grid = document.createDocumentFragment();
  const backdrop = backdropRGB(snapshot);
  for (const { name, deprecated } of visibleKeywords()) {
    const color = snapshot.colors[name];
    const card = element("article");
    card.className = "color-card";
    card.append(element(`h${headingLevel}`, name));
    if (color.supported) {
      const swatch = element("div");
      swatch.className = "swatch";
      if (backdrop) swatch.style.backgroundColor = hex([...backdrop, 255]);
      const fill = element("div");
      fill.className = "swatch-color";
      fill.style.backgroundColor = color.hex;
      swatch.append(fill);
      swatch.setAttribute("aria-hidden", "true");
      if (backdrop || color.rgba[3] === 255) card.append(swatch);
      else
        card.append(element("p", "Preview unavailable: no opaque backdrop."));
      card.append(element("code", color.hex));
      const raw = element("p", color.computed);
      raw.className = "raw";
      card.append(raw);
    } else card.append(element("p", "N/A — keyword unsupported."));
    if (deprecated)
      card.append(
        element("p", "Deprecated; measured for historical comparison."),
      );
    grid.append(card);
  }
  colorTarget.replaceChildren(grid);
  const cards = document.createDocumentFragment();
  for (const pair of visiblePairs()) {
    const result = pairResult(pair, snapshot);
    const card = element("article");
    card.className = "pair-card";
    card.append(
      element(
        `h${headingLevel + 1}`,
        `${pair.background} / ${pair.foreground}`,
      ),
    );
    if (result.ratio !== null) {
      const sample = element("div");
      sample.className = "pair-sample";
      sample.style.backgroundColor = hex([...backdrop, 255]);
      const text = element("span", "Sample text: Aa 0123456789");
      text.style.backgroundColor = snapshot.colors[pair.background].hex;
      text.style.color = snapshot.colors[pair.foreground].hex;
      sample.append(text);
      card.append(sample);
    }
    const verdict = element("div");
    renderVerdict(verdict, result);
    card.append(verdict);
    cards.append(card);
  }
  pairTarget.replaceChildren(cards);
}

function renderCapturedModes() {
  const capture = captures.at(-1);
  byId("captured-preview").hidden = !capture;
  byId("captured-modes").replaceChildren();
  if (!capture) return;
  byId("capture-summary").textContent = label(capture);
  for (const scheme of ["light", "dark"]) {
    const snapshot = capture.schemes[scheme];
    const group = element("section");
    group.className = "captured-mode";
    group.setAttribute("aria-label", `Captured ${scheme} mode`);
    group.style.colorScheme = scheme;
    group.append(
      element("h3", `Captured ${scheme} mode`),
      element(
        "p",
        `Requested CSS scheme: ${scheme}. Computed: ${snapshot.computedColorScheme || "unsupported"}. These are saved values, not a resample.`,
      ),
    );
    const colors = element("div");
    colors.className = "palette";
    const pairs = element("div");
    pairs.className = "palette pairs";
    group.append(colors, element("h4", "Color pairs"), pairs);
    renderPalette(snapshot, colors, pairs, 4);
    byId("captured-modes").append(group);
  }
}

function renderComparisonTables(sections, dialogs, forced = false) {
  const prefix = forced ? "forced-" : "";
  const groups = sections.flatMap((section, osIndex) =>
    section.themes.flatMap((theme, themeIndex) =>
      theme.groups.map((group) => ({ ...group, osIndex, themeIndex })),
    ),
  );
  const columns = groups.flatMap((group, groupIndex) =>
    group.columns.map((column) => ({ ...column, groupIndex })),
  );
  const themeIds = new Map();
  const osHeadings = (multiplier, tableId) => {
    const row = element("tr");
    sections.forEach((section, index) => {
      const heading = element("th", section.os);
      heading.className = "os-heading";
      heading.scope = "colgroup";
      heading.id = `${tableId}-os-${index}`;
      heading.colSpan = groups
        .filter((group) => group.osIndex === index)
        .reduce((sum, group) => sum + group.columns.length * multiplier, 0);
      row.append(heading);
    });
    return row;
  };
  const themeHeadings = (multiplier, tableId) => {
    const row = element("tr");
    sections.forEach((section, osIndex) =>
      section.themes.forEach((theme, themeIndex) => {
        const heading = element("th");
        if (forced) heading.textContent = theme.name;
        else {
          const label = element("p", theme.name);
          label.className = "mode-label";
          heading.append(label);
        }
        heading.className = `theme-heading${forced ? "" : " mode-heading"}`;
        heading.scope = "colgroup";
        heading.id = `${tableId}-theme-${osIndex}-${themeIndex}`;
        heading.colSpan = groups
          .filter(
            (group) =>
              group.osIndex === osIndex && group.themeIndex === themeIndex,
          )
          .reduce((sum, group) => sum + group.columns.length * multiplier, 0);
        themeIds.set(`${tableId}:${osIndex}:${themeIndex}`, heading.id);
        row.append(heading);
      }),
    );
    return row;
  };
  const columnHeaders = (tableId, groupIndex) => {
    const group = groups[groupIndex];
    return `${tableId}-os-${group.osIndex} ${themeIds.get(`${tableId}:${group.osIndex}:${group.themeIndex}`)} ${tableId.replace("-table", "")}-group-${groupIndex}`;
  };
  const individual = byId(`${prefix}individual-table`);
  const heading = element("tr");
  const modes = element("tr");
  const keywordHeading = element("th", "Keyword");
  keywordHeading.scope = "col";
  keywordHeading.rowSpan = forced ? 4 : 3;
  const os = osHeadings(1, individual.id);
  const themes = themeHeadings(1, individual.id);
  os.prepend(keywordHeading);
  groups.forEach((group, index) => {
    const id = `${prefix}individual-group-${index}`;
    const th = captureHeading(
      group,
      id,
      dialogs.get(environmentKey(group)),
      true,
    );
    th.scope = "colgroup";
    th.colSpan = group.columns.length;
    th.id = id;
    heading.append(th);
  });
  if (forced)
    columns.forEach((column, index) => {
      const th = modeHeading(column, forced);
      th.scope = "col";
      th.id = `${prefix}individual-column-${index}`;
      modes.append(th);
    });
  individual.tHead.replaceChildren(
    os,
    themes,
    heading,
    ...(forced ? [modes] : []),
  );
  const rows = document.createDocumentFragment();
  visibleKeywords().forEach(({ name }, rowIndex) => {
    const row = element("tr");
    const th = element("th", name);
    th.scope = "row";
    th.id = `${prefix}keyword-${rowIndex}`;
    row.append(th);
    columns.forEach(({ snapshot, groupIndex }, index) => {
      const cell = colorCell(snapshot.colors[name], snapshot);
      cell.setAttribute(
        "headers",
        `${th.id} ${columnHeaders(individual.id, groupIndex)}${forced ? ` ${prefix}individual-column-${index}` : ""}`,
      );
      row.append(cell);
    });
    rows.append(row);
  });
  individual.tBodies[0].replaceChildren(rows);
  const table = byId(`${prefix}pair-table`);
  const firstHeader = element("tr");
  const secondHeader = element("tr");
  const thirdHeader = element("tr");
  const first = element("th", "Keyword and role");
  first.rowSpan = forced ? 5 : 4;
  first.scope = "col";
  const pairOS = osHeadings(2, table.id);
  const pairThemes = themeHeadings(2, table.id);
  pairOS.prepend(first);
  groups.forEach((group, index) => {
    const id = `${prefix}pair-group-${index}`;
    const column = captureHeading(
      group,
      id,
      dialogs.get(environmentKey(group)),
      true,
    );
    column.colSpan = group.columns.length * 2;
    column.scope = "colgroup";
    column.id = id;
    firstHeader.append(column);
  });
  columns.forEach((entry, index) => {
    const column = modeHeading(entry, forced);
    column.colSpan = 2;
    column.scope = "colgroup";
    column.id = `${prefix}pair-column-${index}`;
    secondHeader.append(column);
    for (const [type, text] of [
      ["color", "Resolved hex"],
      ["contrast", "Contrast thresholds"],
    ]) {
      const th = element("th", text);
      th.scope = "col";
      th.id = `${prefix}${type}-column-${index}`;
      thirdHeader.append(th);
    }
  });
  table.tHead.replaceChildren(
    pairOS,
    pairThemes,
    firstHeader,
    ...(forced ? [secondHeader] : []),
    thirdHeader,
  );
  const pairRows = document.createDocumentFragment();
  visiblePairs().forEach((pair, rowIndex) => {
    const background = element("tr"),
      foreground = element("tr");
    const bg = element("th", `${pair.background} (background)`);
    const fg = element("th", `${pair.foreground} (foreground)`);
    bg.scope = fg.scope = "row";
    bg.id = `${prefix}background-${rowIndex}`;
    fg.id = `${prefix}foreground-${rowIndex}`;
    background.append(bg);
    foreground.append(fg);
    columns.forEach(({ snapshot, groupIndex }, index) => {
      for (const [row, name, header] of [
        [background, pair.background, bg],
        [foreground, pair.foreground, fg],
      ]) {
        const cell = colorCell(snapshot.colors[name], snapshot);
        cell.setAttribute(
          "headers",
          `${header.id} ${columnHeaders(table.id, groupIndex)}${forced ? ` ${prefix}pair-column-${index}` : ""} ${prefix}color-column-${index}`,
        );
        row.append(cell);
      }
      const result = pairResult(pair, snapshot);
      const cell = element("td");
      cell.rowSpan = 2;
      cell.setAttribute(
        "headers",
        `${bg.id} ${fg.id} ${columnHeaders(table.id, groupIndex)}${forced ? ` ${prefix}pair-column-${index}` : ""} ${prefix}contrast-column-${index}`,
      );
      renderVerdict(cell, result);
      background.append(cell);
    });
    pairRows.append(background, foreground);
  });
  table.tBodies[0].replaceChildren(pairRows);
  individual.hidden = table.hidden = columns.length === 0;
}

function renderTables() {
  const deprecated = byId("deprecated").checked;
  if (renderedCaptures === captures && renderedDeprecated === deprecated)
    return;
  const dialogs = renderDialogs(comparisonGroups(captures));
  renderComparisonTables(
    comparisonSections(
      captures.filter((capture) => capture.media.forcedColors !== true),
    ),
    dialogs,
  );
  const forced = captures.filter(
    (capture) => capture.media.forcedColors === true,
  );
  renderComparisonTables(comparisonSections(forced), dialogs, true);
  byId("forced-section").hidden = forced.length === 0;
  byId("forced-heading").textContent =
    forced.length &&
    forced.every((capture) => capture.environment.os === "Windows 11")
      ? "Windows 11 forced colors"
      : "Forced colors";
  byId("empty").hidden = captures.length !== 0;
  renderedCaptures = captures;
  renderedDeprecated = deprecated;
  if (!isTestPage) return;
  renderCapturedModes();
  byId("export").disabled = captures.length === 0;
  const list = document.createDocumentFragment();
  captures.forEach((capture) => {
    const row = element("li", label(capture));
    const remove = element("button", "Remove capture");
    remove.type = "button";
    remove.setAttribute("aria-label", "Remove " + label(capture));
    remove.addEventListener("click", () => {
      captures = captures.filter((item) => item.id !== capture.id);
      byId("export-text").hidden = true;
      renderTables();
      byId("export").disabled
        ? byId("capture").focus()
        : byId("export").focus();
      byId("status").textContent =
        "Capture removed from this tab. Exported files are unchanged.";
    });
    row.append(remove);
    list.append(row);
  });
  byId("captures").replaceChildren(list);
}

function syncThemeField(media) {
  byId("forced-color-theme").disabled = false;
  byId("forced-color-theme").required = media.forcedColors === true;
}

const headerObserver =
  typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
        const tables = new Set(
          entries.map(({ target }) =>
            target.tagName === "THEAD"
              ? target.parentElement
              : target.querySelector("table"),
          ),
        );
        for (const table of tables) {
          table.dataset.stickyHeader = String(
            table.parentElement.clientHeight -
              table.tHead.getBoundingClientRect().height >=
              128,
          );
        }
      })
    : null;
for (const id of [
  "individual-table",
  "pair-table",
  "forced-individual-table",
  "forced-pair-table",
]) {
  const table = byId(id);
  headerObserver?.observe(table.tHead);
  headerObserver?.observe(table.parentElement);
  table.addEventListener("focusin", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const region = table.parentElement;
    const area = region.getBoundingClientRect();
    const pinned = table.tHead.rows[0].cells[0].getBoundingClientRect();
    const target = event.target.getBoundingClientRect();
    const rtl = getComputedStyle(table).direction === "rtl";
    const left = (rtl ? area.left : pinned.right) + 6;
    const right = (rtl ? pinned.left : area.right) - 6;
    const delta =
      target.left < left
        ? target.left - left
        : target.right > right
          ? target.right - right
          : 0;
    if (delta) region.scrollBy({ left: delta, behavior: "auto" });
  });
  table.parentElement.addEventListener("keydown", (event) => {
    if (
      event.target !== table.parentElement ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    table.parentElement.scrollBy({
      left:
        event.key === "ArrowRight" ? 40 : event.key === "ArrowLeft" ? -40 : 0,
      top: event.key === "ArrowDown" ? 40 : event.key === "ArrowUp" ? -40 : 0,
      behavior: "auto",
    });
  });
}

document.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[commandfor]")
      : null;
  if (!button) return;
  const dialog = byId(button.getAttribute("commandfor"));
  if (
    dialog instanceof HTMLDialogElement &&
    button.getAttribute("command") === "show-modal"
  )
    dialog.dataset.opener = button.id;
  if ("commandForElement" in button) return;
  event.preventDefault();
  clearError();
  try {
    if (!(dialog instanceof HTMLDialogElement))
      throw new Error("Details dialog is unavailable.");
    if (button.getAttribute("command") === "show-modal") dialog.showModal();
    else if (button.getAttribute("command") === "close") dialog.close();
  } catch (error) {
    report(error);
  }
});

function refresh() {
  if (isTestPage) {
    live = measureScheme(byId("scheme").value, byId("backdrop").value);
    const media = mediaSnapshot();
    syncThemeField(media);
    byId("environment").textContent =
      `OS preference: ${media.prefersColorScheme}; forced colors: ${forcedLabel(media.forcedColors)}; contrast preference: ${media.prefersContrast}. Requested scheme: ${byId("scheme").value}; computed scheme: ${live.schemeSupported ? live.computedColorScheme : "unsupported"}.`;
    renderPalette();
  }
  renderTables();
}

function refreshWithStatus() {
  clearError();
  try {
    refresh();
    byId("status").textContent = isTestPage
      ? "Live values resampled. Saved captures are unchanged."
      : `Showing ${captures.length} published captures across light, dark, and forced-color columns.`;
  } catch (error) {
    report(error);
  }
}

for (const id of [
  "deprecated",
  ...(isTestPage ? ["scheme", "backdrop", "refresh"] : []),
]) {
  byId(id).addEventListener(
    id === "refresh" ? "click" : "change",
    refreshWithStatus,
  );
}

if (isTestPage) {
  matchMedia("(forced-colors: active)").addEventListener(
    "change",
    refreshWithStatus,
  );
  byId("detect-versions").addEventListener("click", async () => {
    clearError();
    const button = byId("detect-versions");
    button.disabled = true;
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        "fullVersionList",
        "platformVersion",
      ]);
      const detected = environmentFromHints(hints);
      if (!detected.browser && !detected.os)
        throw new Error(
          "The browser did not disclose full version details. Enter verified versions manually.",
        );
      for (const field of ["browser", "os"])
        if (detected[field]) byId(field).value = detected[field];
      byId("status").textContent =
        "Available reported versions filled. Verify them in the About screens before capturing.";
    } catch (error) {
      report(error);
    } finally {
      button.disabled = false;
    }
  });
  byId("capture-form").addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();
    try {
      const media = mediaSnapshot();
      syncThemeField(media);
      byId("forced-color-theme").value =
        byId("forced-color-theme").value.trim();
      if (!byId("capture-form").reportValidity()) return;
      const capturedAt = new Date().toISOString();
      const capture = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        capturedAt,
        environment: {
          browser: byId("browser").value.trim(),
          os: byId("os").value.trim(),
          forcedColorTheme: byId("forced-color-theme").value,
          context: byId("context").value,
          notes: byId("notes").value,
          userAgent: navigator.userAgent,
        },
        media,
        schemes: Object.fromEntries(
          ["light", "dark"].map((scheme) => [
            scheme,
            measureScheme(scheme, byId("backdrop").value),
          ]),
        ),
      };
      validateCollection({ ...versions, captures: [capture] });
      captures = mergeCaptures(captures, [capture]).captures;
      byId("export-text").hidden = true;
      renderTables();
      byId("status").textContent =
        "Captured both modes and all 42 keywords. Review the saved light and dark grids below; export JSON before leaving.";
    } catch (error) {
      report(error);
    }
  });

  byId("export").addEventListener("click", () => {
    clearError();
    try {
      const exportedAt = new Date().toISOString();
      const text = JSON.stringify(
        { ...versions, exportedAt, captures },
        null,
        2,
      );
      byId("json").value = text;
      byId("export-text").hidden = false;
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const link = element("a");
      link.href = url;
      link.download = exportFilename(captures, exportedAt);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      byId("status").textContent =
        "JSON prepared. Save the download or copy it from the text area.";
    } catch (error) {
      report(error);
    }
  });

  byId("import").addEventListener("change", async (event) => {
    clearError();
    const input = event.currentTarget;
    const files = [...input.files];
    if (!files.length) return;
    input.disabled = true;
    byId("capture").disabled = true;
    byId("export").disabled = true;
    byId("status").textContent = "Reading capture files.";
    try {
      if (files.reduce((size, file) => size + file.size, 0) > 5_000_000) {
        throw new Error("Import at most 5 MB at a time.");
      }
      const incoming = [];
      for (const file of files) {
        const collection = JSON.parse(await file.text());
        incoming.push(...validateCollection(collection));
      }
      const result = mergeCaptures(captures, incoming);
      const added = result.captures.length - captures.length;
      captures = result.captures;
      byId("export-text").hidden = true;
      renderTables();
      byId("status").textContent =
        `Imported ${added} captures; skipped ${result.duplicates} duplicate captures.`;
    } catch (error) {
      report(error);
    } finally {
      input.disabled = false;
      input.value = "";
      byId("capture").disabled = false;
      byId("export").disabled = captures.length === 0;
    }
  });
}

async function initialize() {
  if (isTestPage) {
    const detected = detectEnvironment(navigator.userAgent);
    for (const field of ["browser", "os"])
      if (!byId(field).value) byId(field).value = detected[field];
    byId("detect-versions").hidden =
      !navigator.userAgentData?.getHighEntropyValues;
  }
  if (!isTestPage) {
    const response = await fetch("./published.json", { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        `Published collection could not load (HTTP ${response.status}).`,
      );
    const text = await response.text();
    if (new Blob([text]).size > 5_000_000)
      throw new Error("Published collection exceeds 5 MB.");
    captures = mergeCaptures([], validateCollection(JSON.parse(text))).captures;
  }
  refresh();
  for (const id of [
    "deprecated",
    ...(isTestPage
      ? ["scheme", "backdrop", "refresh", "capture", "import"]
      : []),
  ])
    byId(id).disabled = false;
  byId("status").textContent = isTestPage
    ? "Ready. Set metadata, then capture both modes."
    : `Loaded ${captures.length} published captures. Compare light, dark, and forced-color columns side by side.`;
}
initialize().catch(report);
