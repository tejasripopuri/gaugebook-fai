// Storage layer. On Vercel it uses a private Vercel Blob store (BLOB_READ_WRITE_TOKEN).
// Without a token (local development) it falls back to files under .data/.
import { promises as fs } from "node:fs";
import path from "node:path";

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
let blobLib;
const blob = async () => (blobLib ??= await import("@vercel/blob"));

const LOCAL_ROOT = path.resolve(process.env.LOCAL_DATA_DIR || ".data");
const localPath = (p) => {
  const full = path.resolve(LOCAL_ROOT, p);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Bad path");
  return full;
};

export class ExistsError extends Error {}

/** Read an object as bytes. Returns null when missing. */
export async function read(pathname) {
  if (useBlob) {
    const { get } = await blob();
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    const bytes = new Uint8Array(await new Response(res.stream).arrayBuffer());
    return { bytes, contentType: res.blob.contentType };
  }
  try {
    return { bytes: new Uint8Array(await fs.readFile(localPath(pathname))), contentType: "application/octet-stream" };
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export async function readText(pathname) {
  const r = await read(pathname);
  return r ? new TextDecoder().decode(r.bytes) : null;
}

/** Write an object. With overwrite=false, throws ExistsError if it already exists. */
export async function write(pathname, body, { contentType = "application/octet-stream", overwrite = true } = {}) {
  if (useBlob) {
    const { put, BlobError } = await blob();
    try {
      await put(pathname, body, {
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: overwrite,
        cacheControlMaxAge: 60,
      });
    } catch (e) {
      if (!overwrite && /already exists/i.test(String(e?.message))) throw new ExistsError(pathname);
      throw e;
    }
    return;
  }
  const file = localPath(pathname);
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (!overwrite) {
    try {
      await fs.writeFile(file, body, { flag: "wx" });
    } catch (e) {
      if (e.code === "EEXIST") throw new ExistsError(pathname);
      throw e;
    }
    return;
  }
  await fs.writeFile(file, body);
}

export async function remove(pathname) {
  if (useBlob) {
    const { del } = await blob();
    await del(pathname);
    return;
  }
  await fs.rm(localPath(pathname), { force: true });
}

/** List object pathnames under a prefix. */
export async function list(prefix) {
  if (useBlob) {
    const { list: blobList } = await blob();
    const out = [];
    let cursor;
    do {
      const page = await blobList({ prefix, cursor, limit: 1000 });
      for (const b of page.blobs) out.push(b.pathname);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = localPath(prefix.endsWith("/") ? prefix + "x" : prefix + "/x");
  const base = path.dirname(dir);
  const out = [];
  async function walk(d) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(path.relative(LOCAL_ROOT, full).split(path.sep).join("/"));
    }
  }
  await walk(base);
  return out.filter((p) => p.startsWith(prefix));
}

/** A short-lived URL the browser can PUT a file to directly, or null when unsupported. */
export async function uploadUrl(pathname, { maxBytes }) {
  if (!useBlob) return null;
  try {
    const { issueSignedToken, presignUrl } = await blob();
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({ pathname, operations: ["put"], validUntil, maximumSizeInBytes: maxBytes });
    const { presignedUrl } = await presignUrl(token, {
      operation: "put", access: "private", pathname, validUntil,
      maximumSizeInBytes: maxBytes, allowOverwrite: true, addRandomSuffix: false,
    });
    return presignedUrl;
  } catch (e) {
    console.warn("presigned upload unavailable:", e?.message);
    return null;
  }
}

/** A short-lived URL the browser can GET a file from directly, or null when unsupported. */
export async function downloadUrl(pathname) {
  if (!useBlob) return null;
  try {
    const { issueSignedToken, presignUrl } = await blob();
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", access: "private", pathname, validUntil });
    return presignedUrl;
  } catch (e) {
    console.warn("presigned download unavailable:", e?.message);
    return null;
  }
}
