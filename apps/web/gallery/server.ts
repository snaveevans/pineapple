import { createServer, type Server } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");
const CLIENT_DIR = join(REPO_ROOT, "apps/web/dist/client");
const FONTS_DIR = join(HERE, "fonts");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function rewriteIndexHtml(raw: string): string {
  // Strip Google Fonts preconnects + stylesheet; inject harness-owned fonts.
  let html = raw
    .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>\s*/g, "")
    .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>\s*/g, "");
  if (!html.includes("/__gallery/fonts/local-fonts.css")) {
    html = html.replace(
      "</head>",
      '  <link rel="stylesheet" href="/__gallery/fonts/local-fonts.css" />\n  </head>',
    );
  }
  return html;
}

export type GalleryServer = {
  server: Server;
  baseURL: string;
  close: () => Promise<void>;
};

export async function startGalleryServer(clientDir = CLIENT_DIR): Promise<GalleryServer> {
  if (!existsSync(join(clientDir, "index.html"))) {
    throw new Error(
      `Gallery client build missing at ${clientDir}. Run: pnpm --filter @snaveevans/pineapple-web build`,
    );
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unhandled api — playwright should intercept" }));
      return;
    }

    if (path.startsWith("/__gallery/fonts/")) {
      const file = join(FONTS_DIR, path.slice("/__gallery/fonts/".length));
      if (!existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404);
        res.end("missing font");
        return;
      }
      const body = readFileSync(file);
      res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000",
      });
      res.end(body);
      return;
    }

    let filePath = join(clientDir, path === "/" ? "index.html" : path);
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(clientDir, "index.html");
    }

    let body: Buffer | string = readFileSync(filePath);
    const type = MIME[extname(filePath)] ?? "application/octet-stream";
    if (filePath.endsWith("index.html")) {
      body = rewriteIndexHtml(body.toString("utf8"));
    }
    res.writeHead(200, { "content-type": type });
    res.end(body);
  });

  const baseURL = await new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        throw new Error("failed to bind gallery server");
      }
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });

  return {
    server,
    baseURL,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export { CLIENT_DIR, FONTS_DIR, REPO_ROOT };
