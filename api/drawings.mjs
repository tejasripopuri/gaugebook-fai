// Uploaded drawing files, stored per user by their SHA-256 content hash.
import { route, json, error, session, sameOrigin } from "../lib/http.mjs";
import { list, read, write, uploadUrl, downloadUrl } from "../lib/store.mjs";

const ID = /^[0-9a-f]{64}$/;
const MAX_DIRECT = 4 * 1024 * 1024; // request-body limit for files sent through the function
const MAX_FILE = 100 * 1024 * 1024;
const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

function params(req) {
  const u = new URL(req.url).searchParams;
  const id = u.get("id");
  return { id: id && ID.test(id) ? id : null, u };
}
const safeName = (n) => (String(n || "drawing").replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "drawing");
const dir = (uid, id) => `data/${uid}/drawings/${id}/`;

async function findFile(uid, id) {
  const paths = await list(dir(uid, id));
  const p = paths.find((x) => !x.endsWith("/meta.json"));
  return p ? { pathname: p, name: decodeURIComponent(p.slice(dir(uid, id).length)) } : null;
}

// GET /api/drawings?id=...          -> { name, type, url }   (url: direct download link)
// GET /api/drawings?id=...&raw=1    -> the file bytes (fallback for small files)
export const GET = route(async (req) => {
  const s = session(req);
  if (!s) return error(401, "Not signed in.");
  const { id, u } = params(req);
  if (!u.get("id")) {
    // GET /api/drawings -> { drawings: [{ id, name }] }
    const base = `data/${s.uid}/drawings/`;
    const drawings = (await list(base))
      .map((p) => p.slice(base.length).split("/"))
      .filter(([d, f]) => ID.test(d) && f && f !== "meta.json")
      .map(([d, f]) => ({ id: d, name: decodeURIComponent(f) }));
    return json({ drawings });
  }
  if (!id) return error(400, "Invalid drawing id.");
  const file = await findFile(s.uid, id);
  if (!file) return error(404, "Drawing not found.");
  const metaText = await read(dir(s.uid, id) + "meta.json");
  const meta = metaText ? JSON.parse(new TextDecoder().decode(metaText.bytes)) : {};
  const type = TYPES.has(meta.type) ? meta.type : "application/octet-stream";
  if (u.get("raw")) {
    const r = await read(file.pathname);
    if (!r) return error(404, "Drawing not found.");
    return new Response(r.bytes, { headers: { "content-type": type, "cache-control": "private, no-store" } });
  }
  return json({ name: file.name, type, url: await downloadUrl(file.pathname) });
});

// POST /api/drawings?id=...&name=...&type=...&size=...  -> { uploadUrl } to PUT the file directly,
//      or, with the file as the request body (small files), stores it here.
export const POST = route(async (req) => {
  const s = session(req);
  if (!s) return error(401, "Not signed in.");
  if (!sameOrigin(req)) return error(403, "Cross-site request blocked.");
  const { id, u } = params(req);
  if (!id) return error(400, "Invalid drawing id.");
  const type = u.get("type");
  if (!TYPES.has(type)) return error(415, "Upload a PDF, PNG or JPEG drawing.");
  const size = Number(u.get("size"));
  if (!(size > 0 && size <= MAX_FILE)) return error(413, "Drawings can be up to 100 MB.");
  const pathname = dir(s.uid, id) + encodeURIComponent(safeName(u.get("name")));
  await write(dir(s.uid, id) + "meta.json", JSON.stringify({ type, size, uploadedAt: new Date().toISOString() }), { contentType: "application/json" });

  if (u.get("direct")) {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > MAX_DIRECT) return error(413, "File too large to upload this way.");
    await write(pathname, bytes, { contentType: type });
    return json({ stored: true });
  }
  const url = await uploadUrl(pathname, { maxBytes: MAX_FILE });
  return json({ uploadUrl: url, maxDirect: MAX_DIRECT });
});
