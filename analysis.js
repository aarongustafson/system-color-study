import { channels, keywords } from "./model.js";

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
  deprecated: keywords.some(
    ({ name, deprecated }) => name === background && deprecated,
  ),
}));

export const analysisMethod = Object.freeze({
  version: 1,
  metric: "WCAG 2 relative luminance (sRGB)",
  criteria: "WCAG 2.2",
  compositing: "Encoded-sRGB source-over on the recorded opaque backdrop",
  precision: "Unrounded rgbaFloat when recorded; otherwise legacy 8-bit rgba",
  thresholds: Object.freeze({
    normalAA: 4.5,
    normalAAA: 7,
    largeAA: 3,
    largeAAA: 4.5,
    nonText: 3,
  }),
});

export const colorRGBA = (color) => color.rgbaFloat ?? color.rgba;

export function colorCSS(color) {
  const rgba = colorRGBA(color);
  return `rgba(${rgba.slice(0, 3).join(", ")}, ${rgba[3] / 255})`;
}

export function composite(rgba, background) {
  channels(rgba, 4);
  channels(background, 3);
  const alpha = rgba[3] / 255;
  return rgba
    .slice(0, 3)
    .map((channel, index) =>
      Math.max(
        0,
        Math.min(255, channel * alpha + background[index] * (1 - alpha)),
      ),
    );
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

export function grades(ratio, criteria = analysisMethod.thresholds) {
  if (!Number.isFinite(ratio) || ratio < 1 || ratio > 21)
    throw new TypeError("Invalid contrast ratio.");
  for (const key of Object.keys(analysisMethod.thresholds))
    if (
      !Number.isFinite(criteria[key]) ||
      criteria[key] < 1 ||
      criteria[key] > 21
    )
      throw new TypeError("Invalid contrast criterion.");
  return Object.fromEntries(
    ["normalAA", "normalAAA", "largeAA", "largeAAA"].map((key) => [
      key,
      ratio >= criteria[key],
    ]),
  );
}

export function backdropRGB(snapshot) {
  if (snapshot.backdrop === "white") return [255, 255, 255];
  if (snapshot.backdrop === "black") return [0, 0, 0];
  const canvas = snapshot.colors.Canvas;
  const rgba = canvas?.supported ? colorRGBA(canvas) : null;
  return rgba?.[3] === 255 ? rgba.slice(0, 3) : null;
}

export function pairResult(
  pair,
  snapshot,
  criteria = analysisMethod.thresholds,
) {
  const background = snapshot.colors[pair.background];
  const foreground = snapshot.colors[pair.foreground];
  if (!background?.supported || !foreground?.supported)
    return { id: pair.id, ratio: null, reason: "A keyword is unsupported." };
  const backdrop = backdropRGB(snapshot);
  if (!backdrop)
    return {
      id: pair.id,
      ratio: null,
      reason:
        "Canvas is unsupported or translucent; choose an opaque backdrop.",
    };
  const paintedBackground = composite(colorRGBA(background), backdrop);
  const paintedForeground = composite(colorRGBA(foreground), paintedBackground);
  const ratio = contrast(paintedForeground, paintedBackground);
  return {
    id: pair.id,
    ratio,
    grades: grades(ratio, criteria),
    nonTextThreshold: ratio >= criteria.nonText,
    paintedBackground,
    paintedForeground,
  };
}

export function recommendationSummary(
  captures,
  criteria = analysisMethod.thresholds,
) {
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
          const result = pairResult(pair, snapshot, criteria);
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
