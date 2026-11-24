import { route, json, error, readJson, sameOrigin, normalizeEmail, createUser, publicUser, sessionCookie } from "../../lib/http.mjs";

export const POST = route(async (req) => {
  if (!sameOrigin(req)) return error(403, "Cross-site request blocked.");
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 100);
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return error(400, "Enter a valid email address.");
  if (!name) return error(400, "Enter your name.");
  if (password.length < 10 || password.length > 200) return error(400, "Use a password of at least 10 characters.");
  const user = await createUser({ email, name, password });
  if (!user) return error(409, "An account with this email already exists. Sign in instead.");
  return json({ user: publicUser(user) }, 201, { "set-cookie": sessionCookie(user, req) });
});
