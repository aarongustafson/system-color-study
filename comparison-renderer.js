import {
  keywords,
  pairs,
  hex,
  backdropRGB,
  pairResult,
  comparisonGroups,
  comparisonSections,
  compactEnvironmentLabel,
  composite,
  contrast,
} from "./model.js";

export const forcedLabel = (value) =>
  value === null ? "unknown" : value ? "active" : "inactive";

export function createComparisonRenderer(document) {
  const byId = (id) => document.getElementById(id);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
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
          ...(capture.environment.notes.trim()
            ? [["Notes", capture.environment.notes]]
            : []),
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
    button.setAttribute(
      "aria-labelledby",
      `${id}-browser ${id}-os ${button.id}`,
    );
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

  function rowGroups(table) {
    const current = element("tbody");
    const deprecated = element("tbody");
    deprecated.dataset.deprecated = "";
    deprecated.hidden = !byId("deprecated").checked;
    for (const body of [...table.tBodies]) body.remove();
    table.append(current, deprecated);
    return [current, deprecated];
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
    const [rows, deprecatedRows] = rowGroups(individual);
    keywords.forEach(({ name, deprecated }, rowIndex) => {
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
      (deprecated ? deprecatedRows : rows).append(row);
    });
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
    const [pairRows, deprecatedPairRows] = rowGroups(table);
    pairs.forEach((pair, rowIndex) => {
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
      (pair.deprecated ? deprecatedPairRows : pairRows).append(
        background,
        foreground,
      );
    });
    individual.hidden = table.hidden = columns.length === 0;
  }

  function renderTables(captures) {
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
    byId("empty").hidden = captures.length !== 0;
  }

  return { renderTables, renderVerdict };
}
