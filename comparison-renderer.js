import {
  keywords,
  pairs,
  hex,
  backdropRGB,
  pairResult,
  comparisonGroups,
  comparisonSections,
  comparisonThemeName,
  compactEnvironmentLabel,
  composite,
  contrast,
  forcedLabel,
  recommendationSummary,
} from "./model.js";

export { forcedLabel } from "./model.js";

function hasVisibleContext(group) {
  return (
    group.context !== "normal" &&
    !(
      group.context === "webview" &&
      /^Chrome(?:\s|$)/i.test(group.browser) &&
      /^(?:iOS|iPadOS)(?:\s|$)/i.test(group.os)
    )
  );
}

function contrastVerdict(result) {
  return result.ratio === null
    ? "unavailable"
    : result.grades.normalAAA
      ? "pass"
      : result.nonTextThreshold
        ? "mixed"
        : "fail";
}

export function createComparisonRenderer(document) {
  const byId = (id) => document.getElementById(id);
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const environmentKey = (group) =>
    JSON.stringify([group.browser, group.os, group.context]);
  const svgElement = (tag) =>
    document.createElementNS("http://www.w3.org/2000/svg", tag);

  function ensureFaceSymbols() {
    if (byId("contrast-face-symbols")) return;
    const library = svgElement("svg");
    library.id = "contrast-face-symbols";
    library.setAttribute("class", "contrast-face-symbols");
    library.setAttribute("width", "0");
    library.setAttribute("height", "0");
    library.setAttribute("aria-hidden", "true");
    library.setAttribute("focusable", "false");
    const definitions = svgElement("defs");
    const head =
      "M12 1a11 11 0 1 0 0 22a11 11 0 1 0 0-22Z" +
      "M7.5 7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3Z" +
      "M16.5 7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3Z";
    for (const [verdict, mouth] of [
      ["pass", "M6 13h2c0 5 8 5 8 0h2c0 8-12 8-12 0Z"],
      ["mixed", "M6 14h12v2H6Z"],
      ["fail", "M6 18h2c0-5 8-5 8 0h2c0-8-12-8-12 0Z"],
    ]) {
      const symbol = svgElement("symbol");
      symbol.id = `contrast-face-${verdict}`;
      symbol.setAttribute("viewBox", "0 0 24 24");
      const path = svgElement("path");
      path.setAttribute("d", head + mouth);
      path.setAttribute("fill", "currentColor");
      path.setAttribute("fill-rule", "evenodd");
      symbol.append(path);
      definitions.append(symbol);
    }
    library.append(definitions);
    document.body.prepend(library);
  }

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
    const showContext = hasVisibleContext(group);
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
    const name = comparisonThemeName(capture);
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
    target.dataset.verdict = contrastVerdict(result);
    if (result.ratio === null) {
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
    deprecated.hidden = true;
    for (const body of [...table.tBodies]) body.remove();
    table.append(current, deprecated);
    return [current, deprecated];
  }

  function pairedExample(pair, snapshot, result, verdict, tag = "td") {
    const cell = element(tag);
    cell.className = "paired-example";
    if (result.ratio === null) {
      cell.textContent = "Preview unavailable: " + result.reason;
      return cell;
    }
    const background = snapshot.colors[pair.background].hex;
    cell.style.backgroundColor = hex([...backdropRGB(snapshot), 255]);
    cell.style.backgroundImage = `linear-gradient(${background}, ${background})`;
    cell.style.color = snapshot.colors[pair.foreground].hex;
    const normal = element("p", "Normal");
    normal.className = "sample-normal";
    const large = element("p", "Large");
    large.className = "sample-large";
    const face = svgElement("svg");
    face.setAttribute("class", "sample-face");
    face.setAttribute("viewBox", "0 0 24 24");
    face.setAttribute("width", "48");
    face.setAttribute("height", "48");
    face.setAttribute("role", "img");
    face.setAttribute(
      "aria-label",
      {
        pass: "Smiling face: all five contrast thresholds pass",
        mixed: "Neutral face: some contrast thresholds pass",
        fail: "Frowning face: no contrast thresholds pass",
      }[verdict],
    );
    face.setAttribute("focusable", "false");
    const use = svgElement("use");
    use.setAttribute("href", `#contrast-face-${verdict}`);
    face.append(use);
    cell.append(normal, large, face);
    return cell;
  }

  function renderRecommendations(captures) {
    const summary = recommendationSummary(captures);
    const labels = {
      light: "Light",
      dark: "Dark",
      forced: "Forced colors",
      more: "More contrast",
      other: "Other or unknown settings",
    };
    const uses = {
      "Canvas/CanvasText": "Page content and general reading surfaces.",
      "Canvas/LinkText": "Links in page content.",
      "Canvas/VisitedText": "Visited links on the page surface.",
      "Canvas/ActiveText": "Links while they are being activated.",
      "ButtonFace/ButtonText": "Button labels and surfaces.",
      "Field/FieldText": "Text-entry fields.",
      "Highlight/HighlightText": "Text in a highlighted selection.",
      "SelectedItem/SelectedItemText": "Selected items in a control.",
      "AccentColor/AccentColorText": "Text on an accent-colored surface.",
      "Mark/MarkText": "Marked passages, such as search matches.",
    };
    const coverage = byId("recommendation-coverage");
    coverage.replaceChildren(
      element(
        "p",
        captures.length
          ? `These ${captures.length} captures each measure two requested schemes. Counts below are scheme observations, not independent setups. Forced-color and more-contrast observations are kept separate from ordinary light and dark observations.`
          : "No captures are available yet. There isn’t enough evidence to recommend a pair.",
      ),
    );
    if (summary.moreContrastSystems.length)
      coverage.append(
        element(
          "p",
          `More-contrast coverage comes from: ${summary.moreContrastSystems.join("; ")}. That doesn’t establish how these pairs behave on other systems or settings.`,
        ),
      );
    if (summary.categories.other)
      coverage.append(
        element(
          "p",
          `${summary.categories.other} observations have other or unknown settings. They’re reported separately and prevent an across-mode recommendation.`,
        ),
      );
    const starting = byId("recommended-pairs");
    const cautious = byId("caution-pairs");
    starting.replaceChildren();
    cautious.replaceChildren();
    if (!captures.length) return;
    for (const pair of summary.pairs) {
      const card = element("article");
      card.className = "pair-card recommendation-card";
      card.dataset.recommended = String(pair.recommended);
      const heading = element("h4", `${pair.foreground} on ${pair.background}`);
      heading.id = `recommendation-${pair.foreground}-${pair.background}`;
      const use = element("p", `Use for: ${uses[pair.id]}`);
      use.className = "recommendation-use";
      card.append(heading, use);
      const counts = element("ul");
      counts.className = "recommendation-stats";
      for (const [category, { total, passed, unavailable }] of Object.entries(
        pair.categories,
      )) {
        if (category === "other" && !total) continue;
        counts.append(
          element(
            "li",
            total
              ? `${labels[category]}: ${passed}/${total} meet AA; ${total - passed - unavailable} fail; ${unavailable} unavailable.`
              : `${labels[category]}: no observations.`,
          ),
        );
      }
      counts.append(
        element(
          "li",
          pair.minimum === null
            ? "No contrast measurements are available."
            : `Lowest recorded contrast: ${pair.minimum.toFixed(2)}:1.`,
        ),
      );
      card.append(counts);
      if (pair.variants.length) {
        const disclosure = element("details");
        const control = element(
          "summary",
          `View the ${pair.variants.length} rendered combination${pair.variants.length === 1 ? "" : "s"}`,
        );
        control.id = `${heading.id}-summary`;
        control.setAttribute("aria-labelledby", `${heading.id} ${control.id}`);
        disclosure.append(control);
        const examples = element("div");
        examples.className = "recommendation-examples";
        for (const variant of pair.variants) {
          const figure = element("figure");
          figure.append(
            pairedExample(
              pair,
              variant.snapshot,
              variant.result,
              contrastVerdict(variant.result),
              "div",
            ),
          );
          const caption = element("figcaption");
          caption.append(
            element(
              "p",
              `${variant.result.ratio.toFixed(2)}:1 · Normal AA: ${variant.result.grades.normalAA ? "pass" : "fail"} · Normal AAA: ${variant.result.grades.normalAAA ? "pass" : "fail"}`,
            ),
          );
          const provenance = element("details");
          provenance.append(
            element(
              "summary",
              `Seen in ${variant.observations.length} scheme observation${variant.observations.length === 1 ? "" : "s"}`,
            ),
          );
          const list = element("ul");
          for (const { capture, scheme } of variant.observations) {
            const settings = [scheme];
            if (capture.media.forcedColors === true)
              settings.push("forced colors");
            else if (capture.media.forcedColors === null)
              settings.push("forced colors unknown");
            if (capture.media.prefersContrast !== "no-preference")
              settings.push(`${capture.media.prefersContrast} contrast`);
            list.append(
              element(
                "li",
                `${compactEnvironmentLabel(capture.environment.browser)} / ${compactEnvironmentLabel(capture.environment.os)}, ${settings.join(", ")}`,
              ),
            );
          }
          provenance.append(list);
          caption.append(provenance);
          figure.append(caption);
          examples.append(figure);
        }
        disclosure.append(examples);
        card.append(disclosure);
      }
      (pair.recommended ? starting : cautious).append(card);
    }
    if (!starting.childElementCount)
      starting.append(
        element(
          "p",
          "No pair meets the across-mode criterion in this collection yet.",
        ),
      );
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
    const rollupLabel = (column) => {
      const group = groups[column.groupIndex];
      const capture = column.runs[0].capture;
      const settings = [];
      if (hasVisibleContext(group)) settings.push(group.context);
      const name = capture.environment.forcedColorTheme?.trim();
      if (name) settings.push(name);
      if (capture.media.forcedColors === true) settings.push("forced colors");
      else if (capture.media.forcedColors === null)
        settings.push("forced colors unknown");
      else if (name) settings.push("forced colors inactive");
      if (capture.media.prefersContrast !== "no-preference")
        settings.push(`${capture.media.prefersContrast} contrast`);
      settings.push(
        column.schemes.length === 2
          ? "Light & Dark"
          : column.schemes[0] === "light"
            ? "Light"
            : "Dark",
      );
      if (!column.snapshot.schemeSupported)
        settings.push("Requested scheme unsupported");
      return `${compactEnvironmentLabel(group.browser)} / ${compactEnvironmentLabel(group.os)}, ${settings.join(", ")}`;
    };
    const prepareHeaders = (table, labels) => {
      const lastRow = table.tHead.rows[table.tHead.rows.length - 1];
      for (const row of table.tHead.rows) {
        for (const cell of row.cells) {
          if (cell.rowSpan > 1) continue;
          const content = element("div");
          content.className = "header-content";
          content.append(...cell.childNodes);
          cell.append(content);
          if (row !== lastRow) cell.classList.add("hierarchy-heading");
        }
      }
      [...lastRow.cells].forEach((cell, index) => {
        const rollup = element("span", labels[index]);
        rollup.className = "header-rollup";
        rollup.setAttribute("aria-hidden", "true");
        cell.append(rollup);
      });
    };
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
    prepareHeaders(
      individual,
      forced
        ? columns.map(rollupLabel)
        : groups.map((group, groupIndex) =>
            [
              ...new Set(
                group.columns.map((column) =>
                  rollupLabel({ ...column, groupIndex }),
                ),
              ),
            ].join("; "),
          ),
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
    const first = element("th", "Color pair");
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
        ["example", "Paired example"],
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
    prepareHeaders(
      table,
      columns.flatMap((column) => {
        const label = rollupLabel(column);
        return [label, label];
      }),
    );
    const [pairRows, deprecatedPairRows] = rowGroups(table);
    pairs.forEach((pair, rowIndex) => {
      const row = element("tr");
      const heading = element("th", `${pair.foreground} on ${pair.background}`);
      heading.scope = "row";
      heading.id = `${prefix}pair-${rowIndex}`;
      row.append(heading);
      columns.forEach(({ snapshot, groupIndex }, index) => {
        const result = pairResult(pair, snapshot);
        const cell = element("td");
        renderVerdict(cell, result);
        const example = pairedExample(
          pair,
          snapshot,
          result,
          cell.dataset.verdict,
        );
        example.setAttribute(
          "headers",
          `${heading.id} ${columnHeaders(table.id, groupIndex)}${forced ? ` ${prefix}pair-column-${index}` : ""} ${prefix}example-column-${index}`,
        );
        row.append(example);
        cell.setAttribute(
          "headers",
          `${heading.id} ${columnHeaders(table.id, groupIndex)}${forced ? ` ${prefix}pair-column-${index}` : ""} ${prefix}contrast-column-${index}`,
        );
        row.append(cell);
      });
      (pair.deprecated ? deprecatedPairRows : pairRows).append(row);
    });
    individual.hidden = table.hidden = columns.length === 0;
  }

  function renderTables(captures) {
    ensureFaceSymbols();
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
    renderRecommendations(captures);
  }

  return { renderTables, renderVerdict };
}
