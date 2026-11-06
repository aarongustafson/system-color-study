import { enhanceComparisons, report } from "./comparison-ui.js";

try {
  enhanceComparisons();
  document.getElementById("deprecated").disabled = false;
} catch (error) {
  report(error);
}
