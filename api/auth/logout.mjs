import { route, json, clearCookie } from "../../lib/http.mjs";

export const POST = route(async (req) => json({ ok: true }, 200, { "set-cookie": clearCookie(req) }));
