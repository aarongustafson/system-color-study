import { versions, validateSubmission, forcedLabel } from "./model.js";
import { report, clearError } from "./comparison-ui.js";
import { measureScheme, mediaSnapshot } from "./sampler.js";
import {
  detectEnvironment,
  environmentFromHints,
  exportFilename,
} from "./environment.js";

const byId = (id) => document.getElementById(id);
const fields = ["browser", "os", "notes", "forced-color-theme"];
let downloadURL;

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
    byId("capture-result").hidden = true;
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
      if (detected[id]) byId(id).value = detected[id];
    syncEnvironment();
    byId("capture-result").hidden = true;
    byId("status").textContent =
      "Reported versions filled. Confirm them in the About screens before capturing.";
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
  for (const id of ["browser", "os"]) byId(id).value = detected[id] || "";
  byId("detect-versions").hidden =
    !navigator.userAgentData?.getHighEntropyValues;
  syncEnvironment();
  byId("capture").disabled = false;
  byId("status").textContent =
    "Ready. Confirm the details, then capture both schemes.";
} catch (error) {
  report(error);
}
