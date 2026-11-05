import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const files = new Map([
  ["/", ["index.html", "text/html"]],
  ...[
    "index.html",
    "app.js",
    "model.js",
    "sampler.js",
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
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be 1-65535.");
createServer(async (request, response) => {
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
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404).end("Not found.");
    return;
  }
  try {
    const body = await readFile(new URL("../" + file[0], import.meta.url));
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
}).listen(port, host, () => console.log(`Study: http://${host}:${port}`));
