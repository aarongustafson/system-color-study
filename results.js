import { enhanceComparisons, report } from "./comparison-ui.js";

try {
  const template = document.getElementById("deprecated-controls-template");
  if (!(template instanceof HTMLTemplateElement))
    throw new Error("Deprecated-keyword controls are unavailable.");
  const controls = template.content.cloneNode(true);
  const deprecated = controls.querySelector("#deprecated");
  if (!(deprecated instanceof HTMLInputElement))
    throw new Error("Deprecated-keyword checkbox is unavailable.");
  enhanceComparisons(deprecated);
  deprecated.disabled = false;
  template.replaceWith(controls);
} catch (error) {
  report(error);
}
