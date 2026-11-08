export const versions = {
  schemaVersion: 1,
  protocolVersion: 1,
  catalogVersion: 1,
};
export const maxCaptures = 100;
export const forcedLabel = (value) =>
  value === null ? "unknown" : value ? "active" : "inactive";

const modern = [
  "AccentColor",
  "AccentColorText",
  "ActiveText",
  "ButtonBorder",
  "ButtonFace",
  "ButtonText",
  "Canvas",
  "CanvasText",
  "Field",
  "FieldText",
  "GrayText",
  "Highlight",
  "HighlightText",
  "LinkText",
  "Mark",
  "MarkText",
  "SelectedItem",
  "SelectedItemText",
  "VisitedText",
];
const legacy = [
  "ActiveBorder",
  "ActiveCaption",
  "AppWorkspace",
  "Background",
  "ButtonHighlight",
  "ButtonShadow",
  "CaptionText",
  "InactiveBorder",
  "InactiveCaption",
  "InactiveCaptionText",
  "InfoBackground",
  "InfoText",
  "Menu",
  "MenuText",
  "Scrollbar",
  "ThreeDDarkShadow",
  "ThreeDFace",
  "ThreeDHighlight",
  "ThreeDLightShadow",
  "ThreeDShadow",
  "Window",
  "WindowFrame",
  "WindowText",
];
export const keywords = [...modern, ...legacy].map((name) => ({
  name,
  deprecated: legacy.includes(name),
}));
export const pairs = [
  ["Canvas", "CanvasText"],
  ["Canvas", "LinkText"],
  ["Canvas", "VisitedText"],
  ["Canvas", "ActiveText"],
  ["ButtonFace", "ButtonText"],
  ["Field", "FieldText"],
  ["Highlight", "HighlightText"],
  ["SelectedItem", "SelectedItemText"],
  ["AccentColor", "AccentColorText"],
  ["Mark", "MarkText"],
  ["ActiveCaption", "CaptionText"],
  ["InactiveCaption", "InactiveCaptionText"],
  ["InfoBackground", "InfoText"],
  ["Menu", "MenuText"],
  ["Window", "WindowText"],
].map(([background, foreground]) => ({
  id: `${background}/${foreground}`,
  background,
  foreground,
  deprecated: legacy.includes(background),
}));

function channels(value, count, bytes = false) {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    value.some(
      (channel) =>
        !Number.isFinite(channel) ||
        channel < 0 ||
        channel > 255 ||
        (bytes && !Number.isInteger(channel)),
    )
  ) {
    throw new TypeError("Invalid sRGB channels.");
  }
}

export function hex(rgba) {
  channels(rgba, 4, true);
  return (
    "#" +
    rgba
      .slice(0, rgba[3] === 255 ? 3 : 4)
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function composite(rgba, background) {
  channels(rgba, 4, true);
  channels(background, 3);
  const alpha = rgba[3] / 255;
  return rgba
    .slice(0, 3)
    .map((channel, index) => channel * alpha + background[index] * (1 - alpha));
}

function luminance(rgb) {
  channels(rgb, 3);
  return rgb
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (total, channel, index) =>
        total + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}

export function contrast(first, second) {
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function grades(ratio) {
  if (!Number.isFinite(ratio) || ratio < 1 || ratio > 21) {
    throw new TypeError("Invalid contrast ratio.");
  }
  return {
    normalAA: ratio >= 4.5,
    normalAAA: ratio >= 7,
    largeAA: ratio >= 3,
    largeAAA: ratio >= 4.5,
  };
}

export function backdropRGB(snapshot) {
  if (snapshot.backdrop === "white") return [255, 255, 255];
  if (snapshot.backdrop === "black") return [0, 0, 0];
  const canvas = snapshot.colors.Canvas;
  return canvas?.supported && canvas.rgba[3] === 255
    ? canvas.rgba.slice(0, 3)
    : null;
}

export function pairResult(pair, snapshot) {
  const background = snapshot.colors[pair.background];
  const foreground = snapshot.colors[pair.foreground];
  if (!background?.supported || !foreground?.supported) {
    return { id: pair.id, ratio: null, reason: "A keyword is unsupported." };
  }
  const backdrop = backdropRGB(snapshot);
  if (!backdrop) {
    return {
      id: pair.id,
      ratio: null,
      reason:
        "Canvas is unsupported or translucent; choose an opaque backdrop.",
    };
  }
  const paintedBackground = composite(background.rgba, backdrop);
  const paintedForeground = composite(foreground.rgba, paintedBackground);
  const ratio = contrast(paintedForeground, paintedBackground);
  return {
    id: pair.id,
    ratio,
    grades: grades(ratio),
    nonTextThreshold: ratio >= 3,
    paintedBackground,
    paintedForeground,
  };
}

export function recommendationSummary(captures) {
  const observations = captures.flatMap((capture) =>
    ["light", "dark"].map((scheme) => ({
      capture,
      scheme,
      snapshot: capture.schemes[scheme],
      category:
        capture.media.forcedColors === true
          ? "forced"
          : capture.media.forcedColors !== false
            ? "other"
            : capture.media.prefersContrast === "more"
              ? "more"
              : capture.media.prefersContrast === "no-preference"
                ? scheme
                : "other",
    })),
  );
  const categories = Object.fromEntries(
    ["light", "dark", "forced", "more", "other"].map((category) => [
      category,
      observations.filter((observation) => observation.category === category)
        .length,
    ]),
  );
  return {
    categories,
    moreContrastSystems: [
      ...new Set(
        observations
          .filter((observation) => observation.category === "more")
          .map(({ capture }) => capture.environment.os),
      ),
    ].sort(),
    pairs: pairs
      .filter((pair) => !pair.deprecated)
      .map((pair) => {
        const counts = Object.fromEntries(
          Object.entries(categories).map(([category, total]) => [
            category,
            { total, passed: 0, unavailable: 0 },
          ]),
        );
        const variants = new Map();
        let minimum = null;
        for (const observation of observations) {
          const { snapshot, category } = observation;
          const result = pairResult(pair, snapshot);
          if (!snapshot.schemeSupported || result.ratio === null) {
            counts[category].unavailable++;
            continue;
          }
          if (result.grades.normalAA) counts[category].passed++;
          minimum =
            minimum === null ? result.ratio : Math.min(minimum, result.ratio);
          const signature = JSON.stringify([
            result.paintedForeground,
            result.paintedBackground,
          ]);
          if (!variants.has(signature))
            variants.set(signature, { snapshot, result, observations: [] });
          variants.get(signature).observations.push(observation);
        }
        return {
          ...pair,
          categories: counts,
          minimum,
          recommended:
            categories.other === 0 &&
            ["light", "dark", "forced", "more"].every(
              (category) =>
                counts[category].total > 0 &&
                counts[category].passed === counts[category].total,
            ),
          variants: [...variants.values()],
        };
      }),
  };
}

function record(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

function text(value, max, message, allowEmpty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  ) {
    throw new TypeError(message);
  }
}

export function validateCollection(data) {
  record(data, "Invalid collection.");
  if (Object.entries(versions).some(([key, value]) => data[key] !== value)) {
    throw new TypeError(
      "Unsupported or missing study version. Use matching study files.",
    );
  }
  if (!Array.isArray(data.captures) || data.captures.length > maxCaptures) {
    throw new TypeError(
      `A collection must contain at most ${maxCaptures} captures.`,
    );
  }
  for (const capture of data.captures) {
    record(capture, "Invalid capture.");
    text(capture.id, 120, "Invalid capture identifier.");
    text(capture.capturedAt, 40, "Invalid capture date.");
    if (!Number.isFinite(Date.parse(capture.capturedAt)))
      throw new TypeError("Invalid capture date.");
    if (new Date(capture.capturedAt).toISOString() !== capture.capturedAt)
      throw new TypeError(
        "Capture dates must be canonical UTC ISO timestamps.",
      );
    record(capture.environment, "Invalid capture environment.");
    for (const field of ["browser", "os"])
      text(capture.environment[field], 160, `Invalid capture ${field}.`);
    text(capture.environment.notes, 2000, "Invalid capture notes.", true);
    text(
      capture.environment.userAgent,
      2000,
      "Invalid capture user agent.",
      true,
    );
    if (
      !["normal", "private", "installed-app", "webview"].includes(
        capture.environment.context,
      )
    ) {
      throw new TypeError("Invalid capture context.");
    }
    record(capture.media, "Invalid capture media.");
    if (
      (capture.media.forcedColors !== null &&
        typeof capture.media.forcedColors !== "boolean") ||
      !["light", "dark", "unknown"].includes(
        capture.media.prefersColorScheme,
      ) ||
      !["no-preference", "more", "less", "custom", "unknown"].includes(
        capture.media.prefersContrast,
      ) ||
      ![
        "browser",
        "standalone",
        "fullscreen",
        "minimal-ui",
        "unknown",
      ].includes(capture.media.displayMode)
    ) {
      throw new TypeError("Invalid capture media values.");
    }
    if (capture.environment.forcedColorTheme !== undefined) {
      text(
        capture.environment.forcedColorTheme,
        160,
        "Invalid forced-color theme name.",
        true,
      );
    }
    record(capture.schemes, "Invalid capture schemes.");
    for (const scheme of ["light", "dark"]) {
      const snapshot = capture.schemes[scheme];
      record(snapshot, `Missing capture ${scheme} measurements.`);
      if (
        typeof snapshot.schemeSupported !== "boolean" ||
        !["canvas", "white", "black"].includes(snapshot.backdrop)
      ) {
        throw new TypeError("Invalid capture scheme or backdrop.");
      }
      text(
        snapshot.computedColorScheme,
        100,
        "Invalid computed color scheme.",
        !snapshot.schemeSupported,
      );
      record(snapshot.colors, "Invalid capture colors.");
      if (Object.keys(snapshot.colors).length !== keywords.length) {
        throw new TypeError("Incomplete capture keyword catalog.");
      }
      for (const { name } of keywords) {
        const color = snapshot.colors[name];
        record(color, `Missing capture keyword ${name}.`);
        if (typeof color.supported !== "boolean")
          throw new TypeError(`Invalid support for ${name}.`);
        if (!color.supported) {
          if (
            color.rgba !== null ||
            color.hex !== null ||
            color.computed !== null
          ) {
            throw new TypeError(
              `Unsupported keyword ${name} must have null values.`,
            );
          }
        } else {
          channels(color.rgba, 4, true);
          text(color.computed, 200, `Invalid computed color for ${name}.`);
          if (
            color.hex !== hex(color.rgba) ||
            !["rgb-serialization", "canvas-srgb-8"].includes(color.conversion)
          ) {
            throw new TypeError(`Inconsistent capture value for ${name}.`);
          }
        }
      }
    }
  }
  return data.captures;
}

export function validateSubmission(data) {
  const captures = validateCollection(data);
  if (!captures.length)
    throw new TypeError("The submission contains no captures.");
  for (const capture of captures) {
    for (const field of [
      "browser",
      "os",
      "context",
      "notes",
      "forcedColorTheme",
    ])
      if (/verify/i.test(capture.environment[field] || ""))
        throw new TypeError(
          `Confirm ${field} and remove “verify” before submitting.`,
        );
    if (
      capture.media.forcedColors === true &&
      !capture.environment.forcedColorTheme?.trim()
    )
      throw new TypeError(
        "Name the active forced-color theme before submitting.",
      );
  }
  return captures;
}

export function comparisonThemeName(capture) {
  return (
    capture.environment.forcedColorTheme?.trim() ||
    (capture.media.forcedColors === false &&
    ["more", "less"].includes(capture.media.prefersContrast)
      ? `${capture.media.prefersContrast} contrast`
      : undefined)
  );
}

export function mergeCaptures(existing, incoming) {
  const byId = new Map(existing.map((capture) => [capture.id, capture]));
  let duplicates = 0;
  for (const capture of incoming) {
    const previous = byId.get(capture.id);
    if (previous) {
      if (canonicalJSON(previous) !== canonicalJSON(capture)) {
        throw new TypeError(`Conflicting capture identifier: ${capture.id}`);
      }

      function canonicalJSON(value) {
        return JSON.stringify(value, (_key, item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(
                Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
              )
            : item,
        );
      }
      duplicates++;
    } else byId.set(capture.id, capture);
  }
  if (byId.size > maxCaptures)
    throw new TypeError(`Import at most ${maxCaptures} captures at a time.`);
  return { captures: [...byId.values()], duplicates };
}

function snapshotKey(snapshot, includeScheme = false) {
  return JSON.stringify([
    snapshot.backdrop,
    snapshot.schemeSupported,
    ...(includeScheme ? [snapshot.computedColorScheme] : []),
    keywords.map(({ name }) => {
      const color = snapshot.colors[name];
      return [color.supported, color.rgba, color.computed, color.conversion];
    }),
  ]);
}

export function comparisonGroups(captures) {
  const groups = new Map();
  captures.forEach((capture, index) => {
    const { browser, os, context } = capture.environment;
    const key = JSON.stringify([browser, os, context]);
    if (!groups.has(key))
      groups.set(key, {
        group: { browser, os, context, runs: [], columns: [] },
        observations: new Map(),
      });
    const { group, observations } = groups.get(key);
    const run = { capture, number: index + 1 };
    group.runs.push(run);
    const signature = JSON.stringify([
      capture.environment.forcedColorTheme?.trim() || "",
      capture.media.forcedColors,
      capture.media.prefersColorScheme,
      capture.media.prefersContrast,
      capture.media.displayMode,
      snapshotKey(capture.schemes.light, true),
      snapshotKey(capture.schemes.dark, true),
    ]);
    if (observations.has(signature)) {
      observations.get(signature).push(run);
      return;
    }
    const runs = [run];
    observations.set(signature, runs);
    const same =
      capture.media.forcedColors === true &&
      snapshotKey(capture.schemes.light) === snapshotKey(capture.schemes.dark);
    for (const schemes of same ? [["light", "dark"]] : [["light"], ["dark"]])
      group.columns.push({
        runs,
        schemes,
        snapshot: capture.schemes[schemes[0]],
      });
  });
  return [...groups.values()].map(({ group }) => group);
}

export function compactEnvironmentLabel(value) {
  const match = value.match(
    /^(.+?)\s+(\d+)(?:\.\d+)*(?:\s+(?:arm64|x86_64|x64|ia32|aarch64))?$/,
  );
  return match ? `${match[1]} ${match[2]}` : value;
}

export function comparisonSections(captures) {
  const sections = new Map();
  for (const group of comparisonGroups(captures)) {
    const os = compactEnvironmentLabel(group.os);
    if (!sections.has(os)) sections.set(os, { os, themes: new Map() });
    const section = sections.get(os);
    for (const column of group.columns) {
      const capture = column.runs[0].capture;
      const forced = capture.media.forcedColors;
      const name = comparisonThemeName(capture);
      const mode = column.schemes[0] === "light" ? "Light" : "Dark";
      const theme =
        forced === true
          ? name || "Unnamed theme"
          : forced === null
            ? `${name ? name + " (forced colors unknown)" : "Forced colors unknown"} · ${mode}`
            : name
              ? `${name} (forced colors inactive) · ${mode}`
              : mode;
      if (!section.themes.has(theme))
        section.themes.set(theme, {
          name: theme,
          order: forced === true ? 2 : column.schemes[0] === "light" ? 0 : 1,
          groups: new Map(),
        });
      const entry = section.themes.get(theme);
      const key = JSON.stringify([group.browser, group.os, group.context]);
      if (!entry.groups.has(key))
        entry.groups.set(key, { ...group, columns: [] });
      entry.groups.get(key).columns.push(column);
    }
  }
  return [...sections.values()]
    .sort((a, b) => a.os.localeCompare(b.os))
    .map((section) => ({
      os: section.os,
      themes: [...section.themes.values()]
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map((theme) => ({
          name: theme.name,
          groups: [...theme.groups.values()].sort(
            (a, b) =>
              a.browser.localeCompare(b.browser) ||
              a.os.localeCompare(b.os) ||
              a.context.localeCompare(b.context),
          ),
        })),
    }));
}
