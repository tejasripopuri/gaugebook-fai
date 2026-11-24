// Per-user key/value store mirroring the app's "gaugebook-*" browser storage keys.
import { route, json, error, session, sameOrigin } from "../lib/http.mjs";
import { list, readText, write, remove } from "../lib/store.mjs";

const KEY = /^gaugebook-[A-Za-z0-9_-]{1,160}$/;
const MAX_VALUE = 3 * 1024 * 1024;
const prefix = (uid) => `data/${uid}/kv/`;

async function auth(req, mutating) {
  const s = session(req);
  if (!s) return [null, error(401, "Not signed in.")];
  if (mutating && !sameOrigin(req)) return [null, error(403, "Cross-site request blocked.")];
  return [s, null];
}

function keyFrom(req) {
  const key = new URL(req.url).searchParams.get("key");
  return key && KEY.test(key) ? key : null;
}

// GET /api/state            -> { items: { key: value, ... } }
export const GET = route(async (req) => {
  const [s, fail] = await auth(req, false);
  if (fail) return fail;
  const base = prefix(s.uid);
  const paths = (await list(base)).filter((p) => p.endsWith(".json"));
  const items = {};
  await Promise.all(paths.map(async (p) => {
    const key = p.slice(base.length, -".json".length);
    if (!KEY.test(key)) return;
    const value = await readText(p);
    if (value !== null) items[key] = value;
  }));
  return json({ items });
});

// PUT /api/state?key=gaugebook-...   body: the raw stored string
export const PUT = route(async (req) => {
  const [s, fail] = await auth(req, true);
  if (fail) return fail;
  const key = keyFrom(req);
  if (!key) return error(400, "Invalid key.");
  const value = await req.text();
  if (value.length > MAX_VALUE) return error(413, "This entry is too large to save.");
  await write(prefix(s.uid) + key + ".json", value, { contentType: "application/json" });
  return json({ ok: true });
});

// DELETE /api/state?key=gaugebook-...
export const DELETE = route(async (req) => {
  const [s, fail] = await auth(req, true);
  if (fail) return fail;
  const key = keyFrom(req);
  if (!key) return error(400, "Invalid key.");
  await remove(prefix(s.uid) + key + ".json");
  return json({ ok: true });
});
