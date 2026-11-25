// Uploaded drawing files, stored per user by their SHA-256 content hash.
import { createHash } from "node:crypto";
import { route, json, error, session, sameOrigin } from "../lib/http.mjs";
import { listDrawings, getDrawing, saveDrawing, recordDrawing, drawingFileKey } from "../lib/db.mjs";
import { fileStream, uploadUrl, downloadUrl, maxDirectBytes } from "../lib/files.mjs";

const ID = /^[0-9a-f]{64}$/;
export const MAX_FILE = 100 * 1024 * 1024;
const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const safeName = (n) => String(n || "drawing").replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "drawing";

// GET /api/drawings              -> { drawings: [{ id, name }] }
// GET /api/drawings?id=...       -> { name, type, url: null }
// GET /api/drawings?id=...&raw=1 -> the file
export const GET = route(async (req) => {
  const s = session(req);
  if (!s) return error(401, "Not signed in.");
  const u = new URL(req.url).searchParams;
  if (!u.get("id")) return json({ drawings: await listDrawings(s.uid) });
  const id = u.get("id");
  if (!ID.test(id)) return error(400, "Invalid drawing id.");
  const d = await getDrawing(s.uid, id);
  if (!d) return error(404, "Drawing not found.");
  if (!u.get("raw")) return json({ name: d.name, type: d.type, url: await downloadUrl(d.key) });
  const stream = await fileStream(d.key);
  if (!stream) return error(404, "Drawing file not found.");
  return new Response(stream, {
    headers: { "content-type": d.type, "cache-control": "private, no-store",
      "content-disposition": `inline; filename="${d.name.replace(/"/g, "")}"` },
  });
});

// POST /api/drawings?id=...&name=...&type=...&size=...          -> { uploadUrl (direct to storage, or null), maxDirect }
// POST /api/drawings?direct=1&id=...&name=...&type=...&size=... (body: the file) -> { stored: true }
export const POST = route(async (req) => {
  const s = session(req);
  if (!s) return error(401, "Not signed in.");
  if (!sameOrigin(req)) return error(403, "Cross-site request blocked.");
  const u = new URL(req.url).searchParams;
  const id = u.get("id");
  if (!id || !ID.test(id)) return error(400, "Invalid drawing id.");
  const type = u.get("type");
  if (!TYPES.has(type)) return error(415, "Upload a PDF, PNG or JPEG drawing.");
  const size = Number(u.get("size"));
  if (!(size > 0 && size <= MAX_FILE)) return error(413, "Drawings can be up to 100 MB.");
  const name = safeName(u.get("name"));
  if (!u.get("direct")) {
    // Large files go straight to storage when it supports that (Vercel); the drawing is recorded now.
    const url = await uploadUrl(drawingFileKey(s.uid, id), MAX_FILE);
    if (url) await recordDrawing(s.uid, id, { name, type, size });
    return json({ uploadUrl: url, maxDirect: maxDirectBytes() });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > Math.min(MAX_FILE, maxDirectBytes())) return error(413, "This drawing is too large to upload this way.");
  if (createHash("sha256").update(bytes).digest("hex") !== id) return error(400, "The file did not arrive intact. Please upload it again.");
  const head = Buffer.from(bytes.subarray(0, 8));
  const looksRight = type === "application/pdf" ? head.subarray(0, 5).toString() === "%PDF-"
    : type === "image/png" ? head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : head[0] === 0xff && head[1] === 0xd8;
  if (!looksRight) return error(415, "This file's contents don't match a PDF, PNG or JPEG.");
  await saveDrawing(s.uid, id, { name, type, bytes });
  return json({ stored: true });
});
