// Gaugebook server: serves the app from public/ and the API from api/.
// Runs behind Caddy (HTTPS) in production; `npm run dev` runs it locally.
import http from "node:http";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { migrate, close } from "./lib/db.mjs";
import * as signup from "./api/auth/signup.mjs";
import * as login from "./api/auth/login.mjs";
import * as logout from "./api/auth/logout.mjs";
import * as me from "./api/auth/me.mjs";
import * as state from "./api/state.mjs";
import * as drawings from "./api/drawings.mjs";
import * as health from "./api/health.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const TRUST_PROXY = process.env.TRUST_PROXY === "1"; // set when behind Caddy

const ROUTES = {
  "/api/auth/signup": [signup, 16 * 1024],
  "/api/auth/login": [login, 16 * 1024],
  "/api/auth/logout": [logout, 1024],
  "/api/auth/me": [me, 0],
  "/api/state": [state, state.MAX_VALUE + 1024],
  "/api/drawings": [drawings, drawings.MAX_FILE + 1024],
  "/api/health": [health, 0],
};

const TYPES = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".pdf": "application/pdf", ".wasm": "application/wasm", ".gz": "application/gzip", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

class TooLarge extends Error {}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new TooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

async function handleApi(req, res, url, [mod, limit]) {
  const handler = mod[req.method];
  if (!handler) return send(res, 405, { "content-type": "application/json" }, '{"error":"Method not allowed."}');
  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) throw new TooLarge();
    body = await readBody(req, limit);
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const response = await handler(new Request(url, { method: req.method, headers, body }));
  const out = {};
  response.headers.forEach((v, k) => (out[k] = v));
  res.writeHead(response.status, { ...SECURITY_HEADERS, ...out });
  if (response.body) Readable.fromWeb(response.body).pipe(res);
  else res.end();
}

async function handleStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) return send(res, 405, {}, "");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep) || rel.split("/").some((p) => p.startsWith("."))) return send(res, 404, {}, "Not found");
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return send(res, 404, { "content-type": "text/plain" }, "Not found");
  }
  if (!stat.isFile()) return send(res, 404, { "content-type": "text/plain" }, "Not found");
  const ext = path.extname(file);
  const fresh = [".html", ".mjs", ".css", ".json"].includes(ext) && !file.includes(`${path.sep}vendor${path.sep}`);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "content-type": TYPES[ext] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": fresh ? "no-cache" : "public, max-age=86400",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const proto = TRUST_PROXY && req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  let url;
  try {
    url = new URL(req.url, `${proto}://${req.headers.host || "localhost"}`);
  } catch {
    return send(res, 400, {}, "Bad request");
  }
  try {
    const route = ROUTES[url.pathname];
    if (route) await handleApi(req, res, url, route);
    else if (url.pathname.startsWith("/api/")) send(res, 404, { "content-type": "application/json" }, '{"error":"Not found."}');
    else await handleStatic(req, res, url);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    if (e instanceof TooLarge) return send(res, 413, { "content-type": "application/json", connection: "close" }, '{"error":"This upload is too large."}');
    console.error(e);
    send(res, 500, { "content-type": "application/json" }, '{"error":"Something went wrong on the server."}');
  }
});
server.requestTimeout = 10 * 60 * 1000; // allow large drawing uploads on slow connections

await migrate();
server.listen(PORT, () => console.log(`Gaugebook listening on port ${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
