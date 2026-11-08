import {
  versions,
  validateSubmission,
  forcedLabel,
  maxCaptures,
} from "./model.js";
import { report, clearError } from "./comparison-ui.js";
import { measureScheme, mediaSnapshot } from "./sampler.js";
import {
  detectEnvironment,
  environmentFromHints,
  exportFilename,
  matchesPublishedEnvironment,
} from "./environment.js";

const byId = (id) => document.getElementById(id);
const fields = ["browser", "os", "notes", "forced-color-theme"];
const metadataSources = { browser: "not-reported", os: "not-reported" };
let downloadURL;
let publishedEnvironments;
let publishedMatch;

function reportPublishedMatch() {
  if (!publishedEnvironments || !publishedMatch) return;
  if (
    matchesPublishedEnvironment(
      publishedEnvironments,
      byId("browser").value,
      byId("os").value,
    )
  ) {
    if (!publishedMatch.isConnected)
      byId("metadata-help").append(publishedMatch);
  } else publishedMatch.remove();
}

function reportMetadataSources() {
  const labels = {
    "user-agent": "inferred from the user-agent string",
    "client-hints": "reported through Client Hints",
    edited: "edited by you",
    "not-reported": "not reported",
  };
  const messages = [
    metadataSources.browser === metadataSources.os
      ? `Browser and OS: ${labels[metadataSources.browser]}.`
      : `Browser: ${labels[metadataSources.browser]}. OS: ${labels[metadataSources.os]}.`,
  ];
  const sources = Object.values(metadataSources);
  if (sources.includes("user-agent"))
    messages.push(
      "Browsers may freeze or shorten user-agent values to reduce fingerprinting.",
    );
  if (sources.includes("client-hints"))
    messages.push(
      "Client Hints can disclose fuller versions or a different browser brand, so they may differ from the starting values.",
    );
  if (sources.includes("not-reported"))
    messages.push("Enter any missing values from your About screens.");
  messages.push("Confirm both versions in the browser and OS “About” screens.");
  byId("metadata-source").textContent = messages.join(" ");
  reportPublishedMatch();
}

function validateField(field) {
  field.setCustomValidity(
    /verify/i.test(field.value)
      ? "Confirm this value and remove “verify” before capturing."
      : field.required && !field.value.trim()
        ? "Enter a confirmed value."
        : "",
  );
}

function syncEnvironment() {
  const media = mediaSnapshot();
  const active = media.forcedColors === true;
  byId("forced-color-fields").hidden = !active;
  byId("forced-color-theme").disabled = !active;
  byId("forced-color-theme").required = active;
  byId("environment").textContent =
    `Forced colors: ${forcedLabel(media.forcedColors)}; contrast preference: ${media.prefersContrast}.`;
  for (const id of fields) validateField(byId(id));
}

for (const id of [...fields, "context"])
  byId(id).addEventListener("input", () => {
    if (id !== "context") validateField(byId(id));
    if (id === "browser" || id === "os") {
      metadataSources[id] = "edited";
      reportMetadataSources();
    }
    byId("capture-result").hidden = true;
    byId("status").textContent = "";
  });
for (const query of [
  "(forced-colors: active)",
  "(prefers-contrast: more)",
  "(prefers-contrast: less)",
  "(prefers-color-scheme: dark)",
])
  matchMedia(query).addEventListener("change", () => {
    syncEnvironment();
    byId("capture-result").hidden = true;
    byId("status").textContent = "";
  });

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
        "The browser did not disclose full versions. Enter confirmed versions manually.",
      );
    for (const id of ["browser", "os"])
      if (detected[id]) {
        byId(id).value = detected[id];
        metadataSources[id] = "client-hints";
      }
    reportMetadataSources();
    syncEnvironment();
    byId("capture-result").hidden = true;
    byId("status").textContent = "";
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
    syncEnvironment();
    const invalid = fields
      .map(byId)
      .find((field) => !field.disabled && !field.checkValidity());
    if (invalid?.closest("details")) invalid.closest("details").open = true;
    if (!byId("capture-form").reportValidity()) return;
    const capturedAt = new Date().toISOString();
    const capture = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      capturedAt,
      environment: {
        browser: byId("browser").value.trim(),
        os: byId("os").value.trim(),
        context: byId("context").value,
        notes: byId("notes").value.trim(),
        userAgent: navigator.userAgent,
        ...(byId("forced-color-theme").disabled
          ? {}
          : { forcedColorTheme: byId("forced-color-theme").value.trim() }),
      },
      media: mediaSnapshot(),
      schemes: Object.fromEntries(
        ["light", "dark"].map((scheme) => [
          scheme,
          measureScheme(scheme, "canvas"),
        ]),
      ),
    };
    const collection = {
      ...versions,
      exportedAt: capturedAt,
      captures: [capture],
    };
    validateSubmission(collection);
    const text = JSON.stringify(collection, null, 2);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = url;
    byId("json").value = text;
    byId("download").href = url;
    byId("download").download = exportFilename([capture], capturedAt);
    byId("capture-summary").textContent =
      `${capture.environment.browser} / ${capture.environment.os} · ${capturedAt}`;
    byId("capture-result").hidden = false;
    byId("status").textContent =
      "Captured both schemes and all 42 keywords. Your download is ready.";
    byId("download").focus();
  } catch (error) {
    report(error);
  }
});

byId("copy-json").addEventListener("click", async () => {
  clearError();
  try {
    if (!navigator.clipboard)
      throw new Error(
        "Clipboard access is unavailable. Copy the JSON from the text area.",
      );
    await navigator.clipboard.writeText(byId("json").value);
    byId("status").textContent =
      "JSON copied. Paste it into the GitHub snapshot issue form.";
  } catch (error) {
    byId("export-text").open = true;
    byId("json").focus();
    byId("json").select();
    report(error);
  }
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && downloadURL) URL.revokeObjectURL(downloadURL);
});

try {
  const detected = detectEnvironment(navigator.userAgent);
  for (const id of ["browser", "os"]) {
    byId(id).value = detected[id] || "";
    metadataSources[id] = detected[id] ? "user-agent" : "not-reported";
  }
  reportMetadataSources();
  byId("detect-versions").hidden =
    !navigator.userAgentData?.getHighEntropyValues;
  syncEnvironment();
  byId("capture").disabled = false;
  byId("status").textContent = "";
} catch (error) {
  report(error);
}

try {
  const data = byId("published-environments");
  const template = byId("published-match-template");
  if (
    !(data instanceof HTMLScriptElement) ||
    data.type !== "application/json" ||
    !(template instanceof HTMLTemplateElement)
  )
    throw new Error(
      "The published browser/OS lookup is unavailable. You can still capture a snapshot.",
    );
  const environments = JSON.parse(data.textContent);
  if (
    !Array.isArray(environments) ||
    environments.length > maxCaptures ||
    environments.some(
      (environment) =>
        !environment ||
        typeof environment.browser !== "string" ||
        typeof environment.os !== "string" ||
        environment.browser.length > 160 ||
        environment.os.length > 160,
    )
  )
    throw new Error(
      "The published browser/OS lookup is invalid. You can still capture a snapshot.",
    );
  const message = template.content.querySelector("#published-match");
  if (!(message instanceof HTMLElement))
    throw new Error(
      "The published browser/OS match message is unavailable. You can still capture a snapshot.",
    );
  publishedEnvironments = environments;
  publishedMatch = message.cloneNode(true);
  reportPublishedMatch();
} catch (error) {
  report(error);
}
