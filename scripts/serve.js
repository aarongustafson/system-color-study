import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    dist: { type: "boolean", default: false },
    base: { type: "string", default: "" },
  },
});
const base = values.base.replace(/\/$/, "");
if (base && !/^\/[\w.-]+(?:\/[\w.-]+)*$/.test(base))
  throw new Error("Invalid base path.");
const publicRoot = new URL(values.dist ? "../dist/" : "../", import.meta.url);

const files = new Map([
  ["/", ["index.html", "text/html"]],
  ...[
    "index.html",
    "test.html",
    "app.js",
    "results.js",
    "comparison-renderer.js",
    "comparison-ui.js",
    "model.js",
    "sampler.js",
    "environment.js",
    "styles.css",
    "published.json",
    "README.md",
    "PLAN.md",
  ].map((file) => [
    "/" + file,
    [
      file,
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".json")
            ? "application/json"
            : file.endsWith(".html")
              ? "text/html"
              : "text/plain",
    ],
  ]),
]);
const port = Number(process.env.PORT || 4189);
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be 0-65535 (0 selects an available port).");
const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response
      .writeHead(405, { Allow: "GET, HEAD" })
      .end("Only static file reads are allowed.");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
  } catch (error) {
    if (!(error instanceof URIError) && error.code !== "ERR_INVALID_URL")
      throw error;
    response.writeHead(400).end("Invalid URL.");
    return;
  }
  if (base && pathname === base) {
    response.writeHead(308, { Location: base + "/" }).end();
    return;
  }
  const file = pathname.startsWith(base + "/")
    ? files.get(pathname.slice(base.length))
    : undefined;
  if (!file) {
    response.writeHead(404).end("Not found.");
    return;
  }
  try {
    const body = await readFile(new URL(file[0], publicRoot));
    response
      .writeHead(200, {
        "Content-Type": file[1] + "; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'",
      })
      .end(body);
  } catch (error) {
    console.error("Study server could not read a public file:", error);
    response
      .writeHead(500)
      .end("Study file unavailable. Check the server terminal.");
  }
});
server.listen(port, host, () =>
  console.log(`Study: http://${host}:${server.address().port}${base}/`),
);
