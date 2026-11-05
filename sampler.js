import { keywords, hex, pairs, pairResult } from "./model.js";

function bytesFromCSS(computed, context) {
  const rgb = computed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1]
      .replaceAll(",", " ")
      .replace("/", " ")
      .trim()
      .split(/\s+/);
    const values = parts
      .slice(0, 3)
      .map((part) => parseFloat(part) * (part.endsWith("%") ? 2.55 : 1));
    const alpha =
      parts[3] === undefined
        ? 1
        : parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1);
    if (values.length === 3 && [...values, alpha].every(Number.isFinite)) {
      return {
        rgba: [
          ...values.map((value) =>
            Math.round(Math.max(0, Math.min(255, value))),
          ),
          Math.round(Math.max(0, Math.min(1, alpha)) * 255),
        ],
        conversion: "rgb-serialization",
      };
    }
  }
  context.fillStyle = "#010203";
  context.fillStyle = computed;
  const first = context.fillStyle;
  context.fillStyle = "#040506";
  context.fillStyle = computed;
  if (context.fillStyle !== first)
    throw new Error(`Cannot convert computed color: ${computed}`);
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  return {
    rgba: [...context.getImageData(0, 0, 1, 1).data],
    conversion: "canvas-srgb-8",
  };
}

export function measureScheme(scheme, backdrop) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", {
    colorSpace: "srgb",
    willReadFrequently: true,
  });
  if (!context)
    throw new Error("A 2D canvas is required for color conversion.");
  const stage = document.createElement("div");
  stage.className = "probe-zone";
  stage.style.colorScheme = scheme;
  const probe = document.createElement("span");
  stage.append(probe);
  document.body.append(stage);
  try {
    const colors = Object.fromEntries(
      keywords.map(({ name }) => {
        const supported = CSS.supports("color", name);
        if (!supported)
          return [
            name,
            { supported: false, computed: null, rgba: null, hex: null },
          ];
        probe.style.color = name;
        const computed = getComputedStyle(probe).color;
        const converted = bytesFromCSS(computed, context);
        return [
          name,
          { supported, computed, ...converted, hex: hex(converted.rgba) },
        ];
      }),
    );
    const snapshot = {
      schemeSupported: CSS.supports("color-scheme", scheme),
      computedColorScheme: getComputedStyle(stage)
        .getPropertyValue("color-scheme")
        .trim(),
      backdrop,
      colors,
    };
    snapshot.pairs = pairs.map((pair) => pairResult(pair, snapshot));
    return snapshot;
  } finally {
    stage.remove();
  }
}

export function mediaSnapshot() {
  const matches = (query) => matchMedia(query).matches;
  return {
    prefersColorScheme:
      ["dark", "light"].find((value) =>
        matches(`(prefers-color-scheme: ${value})`),
      ) || "unknown",
    forcedColors: matches("(forced-colors: active)")
      ? true
      : matches("(forced-colors: none)")
        ? false
        : null,
    prefersContrast:
      ["more", "less", "custom", "no-preference"].find((value) =>
        matches(`(prefers-contrast: ${value})`),
      ) || "unknown",
    displayMode:
      ["standalone", "fullscreen", "minimal-ui", "browser"].find((value) =>
        matches(`(display-mode: ${value})`),
      ) || "unknown",
  };
}
