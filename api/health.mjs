import { json } from "../lib/http.mjs";
import { ping } from "../lib/db.mjs";

export const GET = async () => {
  try {
    await ping();
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
};
