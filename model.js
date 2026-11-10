export const versions = {
  schemaVersion: 1,
  protocolVersion: 1,
  catalogVersion: 1,
};
export const maxCaptures = 100;
export const maxIssueJSONLength = 20_000;
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
export function channels(value, count, bytes = false) {
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

export function rgbFromCSS(computed) {
  const rgb = computed.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1]
    .replaceAll(",", " ")
    .replace("/", " ")
    .trim()
    .split(/\s+/);
  if (
    ![3, 4].includes(parts.length) ||
    parts.some(
      (part) => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?$/i.test(part),
    )
  )
    throw new TypeError("Invalid computed RGB serialization.");
  const values = parts
    .slice(0, 3)
    .map((part) =>
      part.endsWith("%") ? (parseFloat(part) / 100) * 255 : Number(part),
    );
  const alpha =
    parts[3] === undefined
      ? 1
      : parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1);
  if (![...values, alpha].every(Number.isFinite))
    throw new TypeError("Invalid computed RGB serialization.");
  return [
    ...values.map((value) => Math.max(0, Math.min(255, value))),
    Math.max(0, Math.min(1, alpha)) * 255,
  ];
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
            color.computed !== null ||
            color.rgbaFloat !== undefined
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
          if (color.rgbaFloat !== undefined) {
            channels(color.rgbaFloat, 4);
            const parsed = rgbFromCSS(color.computed);
            if (
              color.conversion !== "rgb-serialization" ||
              !parsed ||
              color.rgbaFloat.some(
                (value, index) =>
                  value !== parsed[index] ||
                  Math.round(value) !== color.rgba[index],
              )
            )
              throw new TypeError(
                `Inconsistent precise capture value for ${name}.`,
              );
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

export function observationCapture(capture) {
  if (!capture.schemes) return capture;
  return {
    ...capture,
    schemes: Object.fromEntries(
      Object.entries(capture.schemes).map(([scheme, snapshot]) => {
        const { pairs, ...measurements } = snapshot;
        return [scheme, measurements];
      }),
    ),
  };
}

export function issueSubmissionJSON(data) {
  const captures = validateSubmission(data);
  if (captures.length !== 1)
    throw new TypeError("Submit one snapshot per issue.");
  const text = JSON.stringify({
    ...data,
    captures: captures.map(observationCapture),
  });
  if (text.length > maxIssueJSONLength)
    throw new RangeError(
      "This snapshot exceeds GitHub's 20,000-character field limit. Download the complete JSON and ask a maintainer to submit the file.",
    );
  return text;
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
        return JSON.stringify(observationCapture(value), (_key, item) =>
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
      return [
        color.supported,
        color.rgba,
        color.rgbaFloat,
        color.computed,
        color.conversion,
      ];
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
