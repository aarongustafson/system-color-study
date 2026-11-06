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
const compactLabel = (value) => {
  const match = value.match(
    /^(.+?)\s+(\d+)(?:\.\d+)*(?:\s+(?:arm64|x86_64|x64|ia32|aarch64))?$/,
  );
  return match ? `${match[1]} ${match[2]}` : value;
};

function renderDialogs(groups) {
  const fragment = document.createDocumentFragment();
  const ids = new Map();
  groups.forEach((group, index) => {
    const id = `capture-dialog-${index}`;
    ids.set(environmentKey(group), id);
    const dialog = element("dialog");
    dialog.id = id;
    const title = element("h2", `${group.browser} / ${group.os}`);
    title.id = `${id}-title`;
    dialog.setAttribute("aria-labelledby", title.id);
    const close = element("button", "Close details");
    close.type = "button";
    close.autofocus = true;
    close.setAttribute("commandfor", id);
    close.setAttribute("command", "close");
    dialog.addEventListener("close", () =>
      byId(dialog.dataset.opener)?.focus(),
    );
    dialog.append(title, close);
    for (const { capture } of group.runs) {
      const section = element("section");
      const heading = element("h3", `Captured ${capture.capturedAt}`);
      const dl = element("dl");
      dl.className = "capture-metadata";
      const metadata = [
        ["Capture identifier", capture.id],
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
        ...["light", "dark"].flatMap((scheme) => [
          [`${scheme} backdrop`, capture.schemes[scheme].backdrop],
          [
            `${scheme} scheme supported`,
            capture.schemes[scheme].schemeSupported ? "Yes" : "No",
          ],
          [
            `${scheme} computed scheme`,
            capture.schemes[scheme].computedColorScheme || "Unsupported",
          ],
        ]),
        ["Schema version", String(versions.schemaVersion)],
        ["Protocol version", String(versions.protocolVersion)],
        ["Catalog version", String(versions.catalogVersion)],
      ];
      for (const [name, value] of metadata)
        dl.append(element("dt", name), element("dd", value));
      section.append(heading, dl);
      dialog.append(section);
    }
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
    const line = element("p", compactLabel(text));
    line.id = `${id}-${type}`;
    line.className = `capture-${type}${forced && type === "os" ? " visually-hidden" : ""}`;
    heading.append(line);
  }
  if (group.context !== "normal") heading.append(element("p", group.context));
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
    const chip = element("span");
    chip.className = "table-swatch";
    const backdrop = backdropRGB(snapshot);
    if (backdrop) chip.style.backgroundColor = hex([...backdrop, 255]);
    const fill = element("span");
    fill.className = "table-swatch-fill";
    fill.style.backgroundColor = color.hex;
    chip.append(fill);
    chip.setAttribute("aria-hidden", "true");
    if (backdrop || color.rgba[3] === 255) cell.append(chip);
    cell.append(element("code", color.hex));
    cell.title = color.computed;
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

function renderComparisonTables(groups, dialogs, forced = false) {
  const prefix = forced ? "forced-" : "";
  const columns = groups.flatMap((group, groupIndex) =>
    group.columns.map((column) => ({ ...column, groupIndex })),
  );
  const themeIds = new Map();
  const themeHeadings = (multiplier, tableId) => {
    const row = element("tr");
    for (const theme of new Set(groups.map((group) => group.theme))) {
      const heading = element("th", theme);
      heading.className = "theme-heading";
      heading.scope = "colgroup";
      heading.id = `${tableId}-theme-${themeIds.size}`;
      heading.colSpan = groups
        .filter((group) => group.theme === theme)
        .reduce((sum, group) => sum + group.columns.length * multiplier, 0);
      themeIds.set(`${tableId}:${theme}`, heading.id);
      row.append(heading);
    }
    return row;
  };
  const individual = byId(`${prefix}individual-table`);
  const heading = element("tr");
  const modes = element("tr");
  const keywordHeading = element("th", "Keyword");
  keywordHeading.scope = "col";
  keywordHeading.rowSpan = forced ? 3 : 2;
  const themes = forced ? themeHeadings(1, individual.id) : null;
  (themes || heading).prepend(keywordHeading);
  groups.forEach((group, index) => {
    const id = `${prefix}individual-group-${index}`;
    const th = captureHeading(
      group,
      id,
      dialogs.get(environmentKey(group)),
      forced,
    );
    th.scope = "colgroup";
    th.colSpan = group.columns.length;
    th.id = id;
    heading.append(th);
  });
  columns.forEach((column, index) => {
    const th = modeHeading(column, forced);
    th.scope = "col";
    th.id = `${prefix}individual-column-${index}`;
    modes.append(th);
  });
  individual.tHead.replaceChildren(...(themes ? [themes] : []), heading, modes);
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
        `${th.id} ${forced ? themeIds.get(`${individual.id}:${groups[groupIndex].theme}`) + " " : ""}${prefix}individual-group-${groupIndex} ${prefix}individual-column-${index}`,
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
  first.rowSpan = forced ? 4 : 3;
  first.scope = "col";
  const pairThemes = forced ? themeHeadings(2, table.id) : null;
  (pairThemes || firstHeader).prepend(first);
  groups.forEach((group, index) => {
    const id = `${prefix}pair-group-${index}`;
    const column = captureHeading(
      group,
      id,
      dialogs.get(environmentKey(group)),
      forced,
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
    ...(pairThemes ? [pairThemes] : []),
    firstHeader,
    secondHeader,
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
          `${header.id} ${forced ? themeIds.get(`${table.id}:${groups[groupIndex].theme}`) + " " : ""}${prefix}pair-group-${groupIndex} ${prefix}pair-column-${index} ${prefix}color-column-${index}`,
        );
        row.append(cell);
      }
      const result = pairResult(pair, snapshot);
      const cell = element("td");
      cell.rowSpan = 2;
      cell.setAttribute(
        "headers",
        `${bg.id} ${fg.id} ${forced ? themeIds.get(`${table.id}:${groups[groupIndex].theme}`) + " " : ""}${prefix}pair-group-${groupIndex} ${prefix}pair-column-${index} ${prefix}contrast-column-${index}`,
      );
      renderVerdict(cell, result);
      background.append(cell);
    });
    pairRows.append(background, foreground);
  });
  table.tBodies[0].replaceChildren(pairRows);
  individual.hidden = table.hidden = columns.length === 0;
  prepareHover(individual);
  prepareHover(table);
}

function renderTables() {
  const deprecated = byId("deprecated").checked;
  if (renderedCaptures === captures && renderedDeprecated === deprecated)
    return;
  const dialogs = renderDialogs(comparisonGroups(captures));
  renderComparisonTables(
    comparisonGroups(
      captures.filter((capture) => capture.media.forcedColors !== true),
    ),
    dialogs,
  );
  const forced = captures.filter(
    (capture) => capture.media.forcedColors === true,
  );
  const themes = [
    ...new Set(
      forced.map(
        (capture) =>
          capture.environment.forcedColorTheme?.trim() || "Unnamed theme",
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const forcedGroups = themes.flatMap((theme) =>
    comparisonGroups(
      forced.filter(
        (capture) =>
          (capture.environment.forcedColorTheme?.trim() || "Unnamed theme") ===
          theme,
      ),
    )
      .sort(
        (a, b) =>
          a.browser.localeCompare(b.browser) || a.os.localeCompare(b.os),
      )
      .map((group) => ({ ...group, theme })),
  );
  renderComparisonTables(forcedGroups, dialogs, true);
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

const hoverTables = new WeakMap();
function prepareHover(table) {
  const grid = [],
    rows = new Map(),
    columns = new Map(),
    cells = new Map();
  const add = (map, index, cell) => {
    if (!map.has(index)) map.set(index, new Set());
    map.get(index).add(cell);
  };
  [...table.rows].forEach((row, y) => {
    let x = 0;
    for (const cell of row.cells) {
      while (grid[y]?.[x]) x++;
      const bounds = {
        top: y,
        bottom: y + cell.rowSpan - 1,
        left: x,
        right: x + cell.colSpan - 1,
      };
      cells.set(cell, bounds);
      for (let r = bounds.top; r <= bounds.bottom; r++) {
        grid[r] ||= [];
        add(rows, r, cell);
        for (let c = bounds.left; c <= bounds.right; c++) grid[r][c] = cell;
      }
      for (let c = bounds.left; c <= bounds.right; c++) add(columns, c, cell);
      x += cell.colSpan;
    }
  });
  hoverTables.set(table, {
    rows,
    columns,
    cells,
    rowActive: new Set(),
    columnActive: new Set(),
    target: null,
  });
}

function highlight(table, cell) {
  const state = hoverTables.get(table);
  if (!state || state.target === cell) return;
  state.target = cell;
  const bounds = state.cells.get(cell);
  const nextRows = new Set(),
    nextColumns = new Set();
  if (bounds) {
    for (let r = bounds.top; r <= bounds.bottom; r++)
      for (const node of state.rows.get(r)) nextRows.add(node);
    for (let c = bounds.left; c <= bounds.right; c++)
      for (const node of state.columns.get(c)) nextColumns.add(node);
  }
  for (const [previous, next, className] of [
    [state.rowActive, nextRows, "is-hover-row"],
    [state.columnActive, nextColumns, "is-hover-column"],
  ]) {
    for (const node of previous)
      if (!next.has(node)) node.classList.remove(className);
    for (const node of next)
      if (!previous.has(node)) node.classList.add(className);
  }
  state.rowActive = nextRows;
  state.columnActive = nextColumns;
}

for (const id of [
  "individual-table",
  "pair-table",
  "forced-individual-table",
  "forced-pair-table",
]) {
  const table = byId(id);
  const activate = (event) =>
    highlight(
      table,
      event.target instanceof Element ? event.target.closest("td, th") : null,
    );
  table.addEventListener("pointerover", activate);
  table.addEventListener("pointerleave", () => highlight(table, null));
  table.addEventListener("focusin", (event) => {
    activate(event);
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
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    table.parentElement.scrollBy({
      left: event.key === "ArrowRight" ? 40 : -40,
      behavior: "auto",
    });
  });
  table.addEventListener("focusout", (event) => {
    if (!table.contains(event.relatedTarget)) highlight(table, null);
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
