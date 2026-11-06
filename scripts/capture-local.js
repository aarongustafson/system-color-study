import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type, release, arch } from "node:os";
import { createRequire } from "node:module";
import { chromium, firefox, webkit } from "@playwright/test";
import { validateCollection } from "../model.js";

const root = resolve(import.meta.dirname, "..");

export async function startPreview() {
  const child = spawn(process.execPath, [join(root, "scripts/serve.js")], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const close = async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  };
  let timer;
  try {
    const url = await new Promise((resolve, reject) => {
      let output = "",
        errors = "";
      timer = setTimeout(
        () =>
          reject(new Error("Local preview did not start within 10 seconds.")),
        10000,
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Local preview exited (${code}): ${errors}`)),
      );
      child.stderr.on("data", (chunk) => {
        errors = (errors + chunk).slice(-4096);
      });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/Study: (http:\/\/127\.0\.0\.1:\d+\/)/);
        if (match) resolve(match[1]);
      });
    });
    return { url, close };
  } catch (error) {
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function captureLocal({
  output = join(root, "captures", "playwright-local"),
  headless = false,
  forcedColorTheme = "",
} = {}) {
  if (
    typeof forcedColorTheme !== "string" ||
    forcedColorTheme.trim().length > 160
  )
    throw new TypeError(
      "The forced-color theme name must be a string of at most 160 characters.",
    );
  forcedColorTheme = forcedColorTheme.trim();
  const os =
    process.platform === "darwin"
      ? `macOS ${execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim()} ${arch()}`
      : `${type()} ${release()} ${arch()}`;
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const version = createRequire(import.meta.url)(
    "@playwright/test/package.json",
  ).version;
  const server = await startPreview();
  const paths = [];
  try {
    if (!(await fetch(server.url + "test.html")).ok)
      throw new Error("Local test page is unavailable.");
    await mkdir(output, { recursive: true });
    for (const [name, engine] of [
      ["Chromium", chromium],
      ["Firefox", firefox],
      ["WebKit", webkit],
    ]) {
      const browser = await engine.launch({ headless });
      try {
        const context = await browser.newContext({
          colorScheme: null,
          forcedColors: null,
          contrast: null,
          reducedMotion: null,
        });
        const page = await context.newPage();
        await page.goto(server.url + "test.html");
        await page.locator("#capture").waitFor({ state: "visible" });
        await page
          .getByLabel("Browser and version")
          .fill(`Playwright ${name} ${browser.version()}`);
        await page.getByLabel("OS and version").fill(os);
        const theme = page.getByLabel("Forced-color theme name", {
          exact: true,
        });
        if (
          (await theme.getAttribute("required")) !== null &&
          !forcedColorTheme
        )
          throw new Error(
            `${name} reports active forced colors. Rerun with --forced-color-theme followed by the actual theme name.`,
          );
        if (forcedColorTheme) await theme.fill(forcedColorTheme);
        await page
          .getByLabel("Notes:")
          .fill(
            `Automated local observation using Playwright ${version}, ${headless ? "headless" : "headed"} bundled ${name}; media emulation disabled. Source ${revision}${dirty ? " (working tree modified)" : ""}. Not an installed Chrome/Firefox/Safari release; verify separately in shipping browsers. OS version obtained from ${process.platform === "darwin" ? "sw_vers" : "the host kernel"}, architecture from Node. OS accent was not independently verified; any supplied contrast-theme name is author-reported.`,
          );
        await page
          .getByRole("button", { name: "Capture light and dark" })
          .click();
        const waiting = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export JSON" }).click();
        const download = await waiting;
        const path = join(output, download.suggestedFilename());
        await download.saveAs(path);
        validateCollection(JSON.parse(await readFile(path, "utf8")));
        paths.push(path);
        console.log(`Recorded ${name} ${browser.version()} on ${os}: ${path}`);
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
  return paths;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      headless: { type: "boolean", default: false },
      "forced-color-theme": { type: "string" },
    },
  });
  await captureLocal({
    output: values.output ? resolve(values.output) : undefined,
    headless: values.headless,
    forcedColorTheme: values["forced-color-theme"],
  });
}
