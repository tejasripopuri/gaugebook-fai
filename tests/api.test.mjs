import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

// Needs PostgreSQL: set DATABASE_URL (CI provides one). Uses a fresh schema per run.
const skip = !process.env.DATABASE_URL && "set DATABASE_URL to run the API tests";
process.env.FILES_DIR = mkdtempSync(path.join(tmpdir(), "gb-files-"));
if (!skip) {
  const schema = "test_" + Date.now();
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect(); await c.query(`create schema ${schema}`); await c.end();
  const u = new URL(process.env.DATABASE_URL);
  u.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = u.toString();
}
const signup = await import("../api/auth/signup.mjs");
const login = await import("../api/auth/login.mjs");
const me = await import("../api/auth/me.mjs");
const state = await import("../api/state.mjs");
const drawings = await import("../api/drawings.mjs");
const db = await import("../lib/db.mjs");

const B = "https://gb.example";
const req = (p, init = {}) => new Request(B + p, init);
const post = (p, body, cookie) => req(p, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(cookie && { cookie }) } });
const cookieOf = (res) => res.headers.get("set-cookie").split(";")[0];

test("signup, login, session, isolation and validation", { skip }, async () => {
  let res = await signup.POST(post("/api/auth/signup", { name: "Ana", email: "Ana@Example.com", password: "short" }));
  assert.equal(res.status, 400);
  res = await signup.POST(post("/api/auth/signup", { name: "Ana", email: "Ana@Example.com", password: "correct horse battery" }));
  assert.equal(res.status, 201);
  assert.match(res.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; .*Secure/);
  const a = cookieOf(res);
  res = await signup.POST(post("/api/auth/signup", { name: "Dup", email: "ana@example.com", password: "another password" }));
  assert.equal(res.status, 409);

  assert.equal((await login.POST(post("/api/auth/login", { email: "ana@example.com", password: "wrong password!" }))).status, 401);
  assert.equal((await login.POST(post("/api/auth/login", { email: "nobody@example.com", password: "whatever123" }))).status, 401);
  res = await login.POST(post("/api/auth/login", { email: " ANA@example.com ", password: "correct horse battery" }));
  assert.equal(res.status, 200);

  res = await me.GET(req("/api/auth/me", { headers: { cookie: a } }));
  assert.equal((await res.json()).user.email, "ana@example.com");
  assert.equal((await me.GET(req("/api/auth/me"))).status, 401);
  assert.equal((await me.GET(req("/api/auth/me", { headers: { cookie: a.slice(0, -2) + "xx" } }))).status, 401);

  // state round trip
  const put = (k, v, c, extra = {}) => state.PUT(req("/api/state?key=" + k, { method: "PUT", body: v, headers: { cookie: c, ...extra } }));
  assert.equal((await put("gaugebook-v1-abc", '{"answers":{"1-0":"6.001"}}', a)).status, 200);
  assert.equal((await put("gaugebook-v1-abc-forms", '{"part":{}}', a)).status, 200);
  assert.equal((await put("../etc", "x", a)).status, 400);
  assert.equal((await put("gaugebook-x", "x", a, { origin: "https://evil.example" })).status, 403);
  let items = (await (await state.GET(req("/api/state", { headers: { cookie: a } }))).json()).items;
  assert.deepEqual(Object.keys(items).sort(), ["gaugebook-v1-abc", "gaugebook-v1-abc-forms"]);
  assert.equal(items["gaugebook-v1-abc"], '{"answers":{"1-0":"6.001"}}');

  // a second user sees nothing of the first
  res = await signup.POST(post("/api/auth/signup", { name: "Bo", email: "bo@example.com", password: "another long password" }));
  const b = cookieOf(res);
  items = (await (await state.GET(req("/api/state", { headers: { cookie: b } }))).json()).items;
  assert.deepEqual(items, {});

  await state.DELETE(req("/api/state?key=gaugebook-v1-abc-forms", { method: "DELETE", headers: { cookie: a } }));
  items = (await (await state.GET(req("/api/state", { headers: { cookie: a } }))).json()).items;
  assert.deepEqual(Object.keys(items), ["gaugebook-v1-abc"]);
  assert.equal((await state.GET(req("/api/state"))).status, 401);

  // drawings: direct upload + raw download, per-user
  const bytes = new TextEncoder().encode("%PDF-1.4 test"), id = createHash("sha256").update(bytes).digest("hex");
  const q = `id=${id}&name=Plate%20Rev%20B.pdf&type=application/pdf&size=${bytes.length}`;
  assert.equal((await drawings.POST(req("/api/drawings?" + q + "&direct=1", { method: "POST", body: bytes, headers: { cookie: a } }))).status, 200);
  assert.equal((await drawings.POST(req("/api/drawings?" + q.replace("application/pdf", "text/html") + "&direct=1", { method: "POST", body: bytes, headers: { cookie: a } }))).status, 415);
  res = await drawings.GET(req("/api/drawings?id=" + id, { headers: { cookie: a } }));
  const info = await res.json();
  assert.equal(info.name, "Plate Rev B.pdf");
  assert.equal(info.type, "application/pdf");
  res = await drawings.GET(req("/api/drawings?raw=1&id=" + id, { headers: { cookie: a } }));
  assert.equal(await res.text(), "%PDF-1.4 test");
  assert.equal((await drawings.GET(req("/api/drawings?id=" + id, { headers: { cookie: b } }))).status, 404);

  // wrong content for the declared type, and a corrupted upload
  const png = `id=${id}&name=x.png&type=image/png&size=${bytes.length}&direct=1`;
  assert.equal((await drawings.POST(req("/api/drawings?" + png, { method: "POST", body: bytes, headers: { cookie: a } }))).status, 415);
  const bad = q.replace(id, "b".repeat(64)) + "&direct=1";
  assert.equal((await drawings.POST(req("/api/drawings?" + bad, { method: "POST", body: bytes, headers: { cookie: a } }))).status, 400);
  assert.deepEqual((await (await drawings.GET(req("/api/drawings", { headers: { cookie: a } }))).json()).drawings, [{ id, name: "Plate Rev B.pdf" }]);

  // every change is versioned in the audit log
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const { rows } = await c.query("select action, subject, version, previous_value from audit_events where action like 'entry.%' order by id");
  await c.end();
  assert.deepEqual(rows.map((r) => [r.action, r.subject, r.version]), [
    ["entry.saved", "gaugebook-v1-abc", 1], ["entry.saved", "gaugebook-v1-abc-forms", 1], ["entry.deleted", "gaugebook-v1-abc-forms", 1]]);

  // repeated failed sign-ins are limited
  for (let i = 0; i < 10; i++) await login.POST(post("/api/auth/login", { email: "bo@example.com", password: "wrong wrong wrong" }));
  assert.equal((await login.POST(post("/api/auth/login", { email: "bo@example.com", password: "another long password" }))).status, 429);
  await db.close();
});
