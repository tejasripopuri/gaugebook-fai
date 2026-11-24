// Local development server: serves public/ and routes /api/* to the same handlers Vercel runs.
// Data is stored in .data/ when no BLOB_READ_WRITE_TOKEN is set.
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.resolve("public");
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".pdf": "application/pdf", ".wasm": "application/wasm",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".gz": "application/gzip" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const file = path.resolve("api", url.pathname.slice(5) + ".mjs");
      if (!file.startsWith(path.resolve("api") + path.sep)) throw Object.assign(new Error(), { code: "ENOENT" });
      const mod = await import(file);
      const handler = mod[req.method];
      if (!handler) { res.writeHead(405).end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks);
      const response = await handler(new Request(url, { method: req.method, headers: req.headers, body }));
      const headers = {};
      response.headers.forEach((v, k) => (headers[k] = v));
      res.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = path.resolve(PUBLIC, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(PUBLIC)) throw Object.assign(new Error(), { code: "ENOENT" });
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
  } catch (e) {
    if (e.code === "ENOENT") res.writeHead(404).end("Not found");
    else { console.error(e); res.writeHead(500).end("Server error"); }
  }
}).listen(PORT, () => console.log(`Gaugebook dev server on http://localhost:${PORT}`));
