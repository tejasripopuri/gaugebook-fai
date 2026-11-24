import { route, json, error, readJson, sameOrigin, normalizeEmail, findUser, checkPassword, publicUser, sessionCookie } from "../../lib/http.mjs";

// Hash of a random password, used so unknown emails take as long as wrong passwords.
const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export const POST = route(async (req) => {
  if (!sameOrigin(req)) return error(403, "Cross-site request blocked.");
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "").slice(0, 200);
  const user = email ? await findUser(email) : null;
  const ok = await checkPassword(password, user?.passwordHash ?? DUMMY);
  if (!user || !ok) return error(401, "Email or password is incorrect.");
  return json({ user: publicUser(user) }, 200, { "set-cookie": sessionCookie(user, req) });
});
