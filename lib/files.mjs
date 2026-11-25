// Private storage for uploaded drawings.
// On Vercel (BLOB_READ_WRITE_TOKEN set) files go to a private Vercel Blob store, because functions
// have no permanent disk. On a server (Hostinger, Oracle, Docker) they go to FILES_DIR on disk.
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
let blobLib;
const blob = async () => (blobLib ??= await import("@vercel/blob"));
const FILES_DIR = () => path.resolve(process.env.FILES_DIR || ".data/files");

function diskPath(key) {
  const file = path.resolve(FILES_DIR(), key);
  if (!file.startsWith(FILES_DIR() + path.sep)) throw new Error("Bad file key");
  return file;
}

export async function putFile(key, bytes, type) {
  if (useBlob()) {
    const { put } = await blob();
    await put(key, Buffer.from(bytes), { access: "private", contentType: type, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const file = diskPath(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, file);
}

// The file as a web stream, or null if it is missing.
export async function fileStream(key) {
  if (useBlob()) {
    const { get } = await blob();
    const res = await get(key, { access: "private", useCache: false }).catch(() => null);
    return res?.statusCode === 200 ? res.stream : null;
  }
  try {
    await fs.access(diskPath(key));
  } catch {
    return null;
  }
  return Readable.toWeb(createReadStream(diskPath(key)));
}

// Short-lived URLs so large drawings go straight between the browser and storage
// (Vercel functions accept at most ~4.5 MB per request). null when not supported (disk).
async function presigned(key, operation, extra = {}) {
  if (!useBlob()) return null;
  try {
    const { issueSignedToken, presignUrl } = await blob();
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({ pathname: key, operations: [operation], validUntil, ...(extra.maximumSizeInBytes && { maximumSizeInBytes: extra.maximumSizeInBytes }) });
    const { presignedUrl } = await presignUrl(token, { operation, access: "private", pathname: key, validUntil, ...extra });
    return presignedUrl;
  } catch (e) {
    console.warn("presigned " + operation + " unavailable:", e?.message);
    return null;
  }
}
export const uploadUrl = (key, maxBytes) => presigned(key, "put", { maximumSizeInBytes: maxBytes, allowOverwrite: true, addRandomSuffix: false });
export const downloadUrl = (key) => presigned(key, "get");

// Largest file the API itself accepts in one request.
export const maxDirectBytes = () => (process.env.VERCEL ? 4 * 1024 * 1024 : 100 * 1024 * 1024);
