import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import * as db from "./db.mjs";

const scrypt = promisify(scryptCb);
const COOKIE = "gb_session";
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not configured");
  return "local-development-secret-not-for-production-use";
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export const error = (status, message) => json({ error: message }, status);

/** Run a handler, turning thrown errors into a JSON 500. */
export function route(handler) {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      console.error(e);
      return error(500, "Something went wrong on the server. Please try again.");
    }
  };
}

/** Reject cross-site state-changing requests (CSRF defence in addition to SameSite cookies). */
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function readJson(req, maxBytes = 16 * 1024) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("too large"), { status: 413 });
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

// ---- passwords ----
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(password, stored) {
  const [kind, saltB64, keyB64] = String(stored).split("$");
  if (kind !== "scrypt") return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, expected);
}

// ---- users ----
export const normalizeEmail = (e) => String(e || "").trim().toLowerCase();
export const findUser = (email) => db.findUser(email);
export async function createUser({ email, name, password }) {
  return db.createUser({ email, name, passwordHash: await hashPassword(password) });
}

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

// ---- sessions (stateless, HMAC-signed cookie) ----
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sign = (payload) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function sessionCookie(user, req) {
  const payload = b64url(JSON.stringify({ uid: user.id, email: user.email, name: user.name, exp: Date.now() + SESSION_DAYS * 864e5 }));
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie(req) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** The signed-in user from the request cookie, or null. */
export function session(req) {
  const cookie = req.headers.get("cookie") || "";
  const raw = cookie.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
