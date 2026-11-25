// PostgreSQL data layer (a server's own database, or Neon on Vercel). Drawing files are stored by
// lib/files.mjs. Configure with DATABASE_URL (plus FILES_DIR or BLOB_READ_WRITE_TOKEN for files).
import pg from "pg";
import { randomUUID } from "node:crypto";
import { putFile } from "./files.mjs";

let pool;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  // Serverless functions run many small instances: keep each one's share of connections small.
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: process.env.VERCEL ? 3 : 10, idleTimeoutMillis: 10000 });
  return pool;
}


// ---------- schema (versioned migrations, applied in order at start-up) ----------
const MIGRATIONS = [
  `create table users (
     id uuid primary key,
     email text not null unique,
     name text not null,
     password_hash text not null,
     created_at timestamptz not null default now()
   );
   -- Saved inspection state: measurements, evidence, report forms, drawing reviews.
   create table entries (
     user_id uuid not null references users(id) on delete cascade,
     key text not null,
     value text not null,
     version integer not null default 1,
     updated_at timestamptz not null default now(),
     primary key (user_id, key)
   );
   create table drawings (
     user_id uuid not null references users(id) on delete cascade,
     id char(64) not null,
     name text not null,
     type text not null,
     size bigint not null,
     uploaded_at timestamptz not null default now(),
     primary key (user_id, id)
   );
   -- Every change keeps the value it replaced, so earlier versions can be recovered.
   create table audit_events (
     id bigserial primary key,
     user_id uuid,
     action text not null,
     subject text,
     version integer,
     previous_value text,
     at timestamptz not null default now()
   );
   create index audit_events_user_at on audit_events (user_id, at desc);`,
];

let migrated;
// Applied in one transaction under a transaction-scoped lock, which also works through
// connection poolers such as Neon's (session locks do not).
export function migrate() {
  return (migrated ??= (async () => {
    const client = await db().connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(727001)");
      await client.query("create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())");
      const { rows } = await client.query("select coalesce(max(version), 0) as v from schema_migrations");
      for (let v = rows[0].v + 1; v <= MIGRATIONS.length; v++) {
        await client.query(MIGRATIONS[v - 1]);
        await client.query("insert into schema_migrations (version) values ($1)", [v]);
      }
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      migrated = undefined;
      throw e;
    } finally {
      client.release();
    }
  })());
}

async function q(text, params) {
  await migrate();
  return db().query(text, params);
}

async function tx(fn) {
  await migrate();
  const client = await db().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function ping() {
  await q("select 1");
}

// ---------- users ----------
export async function findUser(email) {
  const { rows } = await q("select id, email, name, password_hash from users where email = $1", [email]);
  const u = rows[0];
  return u && { id: u.id, email: u.email, name: u.name, passwordHash: u.password_hash };
}

/** Creates a user, or returns null if the email is taken. */
export async function createUser({ email, name, passwordHash }) {
  const id = randomUUID();
  return tx(async (c) => {
    const { rowCount } = await c.query(
      "insert into users (id, email, name, password_hash) values ($1, $2, $3, $4) on conflict (email) do nothing",
      [id, email, name, passwordHash]);
    if (!rowCount) return null;
    await c.query("insert into audit_events (user_id, action) values ($1, 'account.created')", [id]);
    return { id, email, name, passwordHash };
  });
}

export async function audit(userId, action, subject = null) {
  await q("insert into audit_events (user_id, action, subject) values ($1, $2, $3)", [userId, action, subject]);
}

// ---------- saved entries ----------
export async function listEntries(userId) {
  const { rows } = await q("select key, value from entries where user_id = $1", [userId]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function putEntry(userId, key, value) {
  return tx(async (c) => {
    const prev = await c.query("select value, version from entries where user_id = $1 and key = $2 for update", [userId, key]);
    const old = prev.rows[0];
    if (old && old.value === value) return old.version;
    const version = old ? old.version + 1 : 1;
    await c.query(
      `insert into entries (user_id, key, value, version, updated_at) values ($1, $2, $3, $4, now())
       on conflict (user_id, key) do update set value = excluded.value, version = excluded.version, updated_at = now()`,
      [userId, key, value, version]);
    await c.query("insert into audit_events (user_id, action, subject, version, previous_value) values ($1, 'entry.saved', $2, $3, $4)",
      [userId, key, version, old?.value ?? null]);
    return version;
  });
}

export async function deleteEntry(userId, key) {
  await tx(async (c) => {
    const { rows } = await c.query("delete from entries where user_id = $1 and key = $2 returning value, version", [userId, key]);
    if (rows[0]) {
      await c.query("insert into audit_events (user_id, action, subject, version, previous_value) values ($1, 'entry.deleted', $2, $3, $4)",
        [userId, key, rows[0].version, rows[0].value]);
    }
  });
}

// ---------- drawings ----------
const drawingKey = (userId, id) => {
  if (!/^[0-9a-f-]{36}$/.test(userId) || !/^[0-9a-f]{64}$/.test(id)) throw new Error("Bad drawing key");
  return `drawings/${userId}/${id}`;
};

export async function listDrawings(userId) {
  const { rows } = await q("select id, name from drawings where user_id = $1 order by uploaded_at", [userId]);
  return rows.map((r) => ({ id: r.id.trim(), name: r.name }));
}

export async function getDrawing(userId, id) {
  const { rows } = await q("select name, type, size from drawings where user_id = $1 and id = $2", [userId, id]);
  if (!rows[0]) return null;
  return { ...rows[0], size: Number(rows[0].size), key: drawingKey(userId, id) };
}

// Records a drawing's details (the file itself is stored separately, see lib/files.mjs).
export async function recordDrawing(userId, id, { name, type, size }) {
  await tx(async (c) => {
    await c.query(
      `insert into drawings (user_id, id, name, type, size) values ($1, $2, $3, $4, $5)
       on conflict (user_id, id) do update set name = excluded.name, type = excluded.type, size = excluded.size, uploaded_at = now()`,
      [userId, id, name, type, size]);
    await c.query("insert into audit_events (user_id, action, subject) values ($1, 'drawing.uploaded', $2)", [userId, id]);
  });
  return drawingKey(userId, id);
}

export async function saveDrawing(userId, id, { name, type, bytes }) {
  await putFile(drawingKey(userId, id), bytes, type);
  await recordDrawing(userId, id, { name, type, size: bytes.length });
}

export const drawingFileKey = drawingKey;

export async function close() {
  await pool?.end();
  pool = undefined;
  migrated = undefined;
}
