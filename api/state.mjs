// Per-user saved state mirroring the app's "gaugebook-*" browser storage keys.
import { route, json, error, session, sameOrigin } from "../lib/http.mjs";
import { listEntries, putEntry, deleteEntry } from "../lib/db.mjs";

const KEY = /^gaugebook-[A-Za-z0-9_-]{1,160}$/;
export const MAX_VALUE = 3 * 1024 * 1024;

function auth(req, mutating) {
  const s = session(req);
  if (!s) return [null, error(401, "Not signed in.")];
  if (mutating && !sameOrigin(req)) return [null, error(403, "Cross-site request blocked.")];
  return [s, null];
}

function keyFrom(req) {
  const key = new URL(req.url).searchParams.get("key");
  return key && KEY.test(key) ? key : null;
}

// GET /api/state  -> { user, items: { key: value, ... } }
export const GET = route(async (req) => {
  const [s, fail] = auth(req, false);
  if (fail) return fail;
  return json({ user: { id: s.uid, email: s.email, name: s.name }, items: await listEntries(s.uid) });
});

// PUT /api/state?key=gaugebook-...   body: the raw stored string
export const PUT = route(async (req) => {
  const [s, fail] = auth(req, true);
  if (fail) return fail;
  const key = keyFrom(req);
  if (!key) return error(400, "Invalid key.");
  const value = await req.text();
  if (value.length > MAX_VALUE) return error(413, "This entry is too large to save.");
  const version = await putEntry(s.uid, key, value);
  return json({ ok: true, version });
});

// DELETE /api/state?key=gaugebook-...
export const DELETE = route(async (req) => {
  const [s, fail] = auth(req, true);
  if (fail) return fail;
  const key = keyFrom(req);
  if (!key) return error(400, "Invalid key.");
  await deleteEntry(s.uid, key);
  return json({ ok: true });
});
