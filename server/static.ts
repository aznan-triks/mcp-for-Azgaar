import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

export interface StaticServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

/** Serves a built folder on the loopback interface only. Nothing outside `root` is reachable. */
export async function startStaticServer(root: string, host: string, port: number): Promise<StaticServer> {
  const base = resolve(root);
  try {
    await stat(join(base, "index.html"));
  } catch {
    throw new Error(`No built Azgaar found in ${base} (index.html missing). Run: npm run setup`);
  }
  const server: Server = createServer(async (req, res) => {
    try {
      const raw = new URL(req.url ?? "/", "http://localhost").pathname;
      const wanted = normalize(decodeURIComponent(raw));
      const target = resolve(base, `.${wanted === sep || wanted === "/" ? "/index.html" : wanted}`);
      if (target !== base && !target.startsWith(base + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(target);
      res.writeHead(200, { "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", err => fail((err as NodeJS.ErrnoException).code === "EADDRINUSE" ? new Error(`Port ${port} is already in use: change server.port in config/fmg-mcp.json`) : err));
    server.listen(port, host, ok);
  });
  const actual = (server.address() as { port: number }).port;
  return {
    url: `http://${host}:${actual}`, // const-ok: scheme only, host and port come from config
    port: actual,
    close: () => new Promise<void>(done => server.close(() => done()))
  };
}
