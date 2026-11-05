import { keywords } from "../model.js";

export function fixture(id) {
  const colors = Object.fromEntries(
    keywords.map(({ name }) => [
      name,
      {
        supported: true,
        computed: "rgb(0, 0, 0)",
        rgba: [0, 0, 0, 255],
        hex: "#000000",
        conversion: "rgb-serialization",
      },
    ]),
  );
  return {
    id,
    capturedAt: "2000-01-01T00:00:00.000Z",
    environment: {
      browser: "Unit fixture",
      os: "Fixture",
      notes: "",
      userAgent: "",
      context: "normal",
    },
    media: {
      forcedColors: false,
      prefersColorScheme: "light",
      prefersContrast: "no-preference",
      displayMode: "browser",
    },
    schemes: Object.fromEntries(
      ["light", "dark"].map((scheme) => [
        scheme,
        {
          colors,
          backdrop: "white",
          schemeSupported: true,
          computedColorScheme: scheme,
        },
      ]),
    ),
  };
}
