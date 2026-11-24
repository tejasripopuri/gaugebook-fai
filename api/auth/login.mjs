import { route, json, error, readJson, sameOrigin, normalizeEmail, findUser, checkPassword, publicUser, sessionCookie } from "../../lib/http.mjs";
import { audit } from "../../lib/db.mjs";

// Hash of a random password, used so unknown emails take as long as wrong passwords.
const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

// Simple in-memory limit on failed sign-ins: 10 per 15 minutes per email and per address.
const WINDOW = 15 * 60 * 1000, LIMIT = 10;
const failures = new Map();
function tooMany(keys) {
  const now = Date.now();
  return keys.some((k) => (failures.get(k) || []).filter((t) => now - t < WINDOW).length >= LIMIT);
}
function recordFailure(keys) {
  const now = Date.now();
  for (const k of keys) failures.set(k, [...(failures.get(k) || []).filter((t) => now - t < WINDOW), now]);
  if (failures.size > 10000) for (const [k, v] of failures) if (!v.some((t) => now - t < WINDOW)) failures.delete(k);
}

export const POST = route(async (req) => {
  if (!sameOrigin(req)) return error(403, "Cross-site request blocked.");
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "").slice(0, 200);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const keys = ["email:" + email, "ip:" + ip];
  if (tooMany(keys)) return error(429, "Too many sign-in attempts. Please wait 15 minutes and try again.");
  const user = email ? await findUser(email) : null;
  const ok = await checkPassword(password, user?.passwordHash ?? DUMMY);
  if (!user || !ok) {
    recordFailure(keys);
    return error(401, "Email or password is incorrect.");
  }
  await audit(user.id, "account.signed_in");
  return json({ user: publicUser(user) }, 200, { "set-cookie": sessionCookie(user, req) });
});
