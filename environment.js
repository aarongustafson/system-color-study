export function detectEnvironment(userAgent) {
  const browsers = [
    ["Edge", /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
    ["Opera", /(?:OPR|OPiOS)\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS|HeadlessChrome)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  const browser =
    browsers
      .map(([name, pattern]) => {
        const match = userAgent.match(pattern);
        return match ? `${name} ${match[1]}` : "";
      })
      .find(Boolean) || "";
  let os = "";
  const ios = userAgent.match(/(?:CPU (?:iPhone )?OS|iPhone OS) ([\d_]+)/);
  const android = userAgent.match(/Android ([\d.]+)/);
  const mac = userAgent.match(/Mac OS X ([\d_.]+)/);
  const windows = userAgent.match(/Windows NT ([\d.]+)/);
  if (ios) os = `iOS ${ios[1].replaceAll("_", ".")} (reported; verify)`;
  else if (android) os = `Android ${android[1]} (reported; verify)`;
  else if (windows) os = `Windows (NT ${windows[1]}; verify release)`;
  else if (mac) os = `macOS ${mac[1].replaceAll("_", ".")} (reported; verify)`;
  else if (userAgent.includes("Linux"))
    os = "Linux (verify distribution/version)";
  return { browser, os };
}

export function environmentFromHints(hints) {
  const brands = hints.fullVersionList || [];
  const brand =
    brands.find((item) =>
      /^(Google Chrome|Microsoft Edge|Opera)$/.test(item.brand),
    ) || brands.find((item) => item.brand === "Chromium");
  const platform = hints.platform;
  const version = hints.platformVersion;
  return {
    browser: brand ? `${brand.brand} ${brand.version}` : "",
    os:
      platform && version
        ? platform === "Windows"
          ? `Windows (platform ${version}; verify release)`
          : `${platform} ${version} (reported; verify)`
        : "",
  };
}

export function exportFilename(captures, timestamp) {
  const slug = (value) =>
    value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 55) || "unknown";
  const environments = [
    ...new Set(
      captures.map(
        (capture) =>
          `${slug(capture.environment.browser)}-${slug(capture.environment.os)}`,
      ),
    ),
  ];
  const label = environments[0] || "empty";
  const more =
    environments.length > 1 ? `-and-${environments.length - 1}-more` : "";
  return `system-colors-${label}${more}-${timestamp.replaceAll(":", "-")}.json`;
}
