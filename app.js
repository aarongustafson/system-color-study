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

function captureHeading(group) {
  const heading = element("th");
  heading.className = "capture-heading";
  for (const [type, text] of [
    ["browser", group.browser],
    ["os", group.os],
  ]) {
    const line = element("p", text);
    line.className = `capture-${type}`;
    heading.append(line);
  }
  if (group.context !== "normal") heading.append(element("p", group.context));
  const details = element("details");
  details.append(
    element(
      "summary",
      `${group.runs.length === 1 ? "Run" : "Runs"} ${group.runs.map((run) => run.number).join(", ")} details`,
    ),
  );
  for (const { capture, number } of group.runs) {
    details.append(element("p", `Run ${number}: ${label(capture)}`));
    if (capture.environment.notes)
      details.append(element("p", "Notes: " + capture.environment.notes));
    if (capture.environment.userAgent)
      details.append(
        element("p", "User agent: " + capture.environment.userAgent),
      );
  }
  heading.append(details);
  return heading;
}

function modeHeading(column) {
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
      ? theme
      : theme === "No forced colors"
        ? mode
        : `${theme} · ${mode}`;
  const line = element("p", text);
  line.className = "mode-label";
  heading.append(line);
  if (column.schemes.length === 2) heading.append(element("p", "Light = dark"));
  heading.append(
    element(
      "p",
      `${column.runs.length === 1 ? "Run" : "Runs"} ${column.runs.map((run) => run.number).join(", ")}`,
    ),
  );
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

function renderTables() {
  const groups = comparisonGroups(captures);
  const columns = groups.flatMap((group, groupIndex) =>
    group.columns.map((column) => ({ ...column, groupIndex })),
  );
  const individual = byId("individual-table");
  const heading = element("tr");
  const modes = element("tr");
  const keywordHeading = element("th", "Keyword");
  keywordHeading.scope = "col";
  keywordHeading.rowSpan = 2;
  heading.append(keywordHeading);
  groups.forEach((group, index) => {
    const th = captureHeading(group);
    th.scope = "colgroup";
    th.colSpan = group.columns.length;
    th.id = `individual-group-${index}`;
    heading.append(th);
  });
  columns.forEach((column, index) => {
    const th = modeHeading(column);
    th.scope = "col";
    th.id = `individual-column-${index}`;
    modes.append(th);
  });
  individual.tHead.replaceChildren(heading, modes);
  const rows = document.createDocumentFragment();
  visibleKeywords().forEach(({ name }, rowIndex) => {
    const row = element("tr");
    const th = element("th", name);
    th.scope = "row";
    th.id = `keyword-${rowIndex}`;
    row.append(th);
    columns.forEach(({ snapshot, groupIndex }, index) => {
      const cell = colorCell(snapshot.colors[name], snapshot);
      cell.setAttribute(
        "headers",
        `${th.id} individual-group-${groupIndex} individual-column-${index}`,
      );
      row.append(cell);
    });
    rows.append(row);
  });
  individual.tBodies[0].replaceChildren(rows);
  const table = byId("pair-table");
  const firstHeader = element("tr");
  const secondHeader = element("tr");
  const thirdHeader = element("tr");
  const first = element("th", "Keyword and role");
  first.rowSpan = 3;
  first.scope = "col";
  firstHeader.append(first);
  groups.forEach((group, index) => {
    const column = captureHeading(group);
    column.colSpan = group.columns.length * 2;
    column.scope = "colgroup";
    column.id = `pair-group-${index}`;
    firstHeader.append(column);
  });
  columns.forEach((entry, index) => {
    const column = modeHeading(entry);
    column.colSpan = 2;
    column.scope = "colgroup";
    column.id = `pair-column-${index}`;
    secondHeader.append(column);
    for (const [type, text] of [
      ["color", "Resolved hex"],
      ["contrast", "Contrast thresholds"],
    ]) {
      const th = element("th", text);
      th.scope = "col";
      th.id = `${type}-column-${index}`;
      thirdHeader.append(th);
    }
  });
  table.tHead.replaceChildren(firstHeader, secondHeader, thirdHeader);
  const pairRows = document.createDocumentFragment();
  visiblePairs().forEach((pair, rowIndex) => {
    const background = element("tr"),
      foreground = element("tr");
    const bg = element("th", `${pair.background} (background)`);
    const fg = element("th", `${pair.foreground} (foreground)`);
    bg.scope = fg.scope = "row";
    bg.id = `background-${rowIndex}`;
    fg.id = `foreground-${rowIndex}`;
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
          `${header.id} pair-group-${groupIndex} pair-column-${index} color-column-${index}`,
        );
        row.append(cell);
      }
      const result = pairResult(pair, snapshot);
      const cell = element("td");
      cell.rowSpan = 2;
      cell.setAttribute(
        "headers",
        `${bg.id} ${fg.id} pair-group-${groupIndex} pair-column-${index} contrast-column-${index}`,
      );
      renderVerdict(cell, result);
      background.append(cell);
    });
    pairRows.append(background, foreground);
  });
  table.tBodies[0].replaceChildren(pairRows);
  individual.hidden = table.hidden = captures.length === 0;
  byId("empty").hidden = captures.length !== 0;
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
