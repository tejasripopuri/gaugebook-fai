import { route, json, error, session } from "../../lib/http.mjs";

export const GET = route(async (req) => {
  const s = session(req);
  if (!s) return error(401, "Not signed in.");
  return json({ user: { id: s.uid, email: s.email, name: s.name } });
});
