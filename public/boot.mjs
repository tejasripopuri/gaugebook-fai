// Signs the user in, loads their saved inspections from the server into this browser,
// and keeps every later change to "gaugebook-*" storage saved to their account.
// Usage: <script type="module" src="boot.mjs?entry=app.mjs"></script>
const entry = new URL(import.meta.url).searchParams.get("entry");
const PREFIX = "gaugebook-";
const OWNER = "gb-sync-owner";        // which account the local copy belongs to
const DIRTY = "gb-sync-dirty";        // keys changed locally but not yet saved
const DRAWINGS = "gb-sync-drawings";  // drawing ids not yet uploaded

const store = Storage.prototype;
const rawSet = store.setItem, rawRemove = store.removeItem;
const ls = window.localStorage;
const readList = (k) => { try { return JSON.parse(ls.getItem(k) || "[]"); } catch { return []; } };
const writeList = (k, v) => { try { rawSet.call(ls, k, JSON.stringify([...new Set(v)])); } catch {} };

// ---------- header: account chip + save status ----------
const style = document.createElement("style");
style.textContent = `.gb-account{display:flex;align-items:center;gap:14px;font-size:.9rem}.gb-account .who{opacity:.85}
.gb-account button{background:transparent;border:1px solid #6f978f;padding:5px 12px;font-size:.85rem}
.gb-status{font-size:.8rem;padding:3px 9px;border-radius:12px;background:#1d5047;color:#d8eee6;white-space:nowrap}
.gb-status.warn{background:#7a4a10;color:#fff2dc}main[inert]{opacity:.6;transition:opacity .2s}.gb-update{background:#fff4d6;color:#5a3d00;padding:10px 5vw;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:.95rem}.gb-update button{padding:6px 14px}header{flex-wrap:wrap;gap:10px}`;
document.head.append(style);
const status = document.createElement("span");
status.className = "gb-status";
status.setAttribute("role", "status");
function setStatus(text, warn = false) { status.textContent = text; status.classList.toggle("warn", warn); }

function showAccount(user) {
  const header = document.querySelector("header");
  if (!header) return;
  const box = document.createElement("div");
  box.className = "gb-account";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = user.name || user.email;
  who.title = user.email;
  const out = document.createElement("button");
  out.textContent = "Sign out";
  out.onclick = signOut;
  const links = [...header.querySelectorAll(":scope > a")];
  box.append(...links, status, who, out);
  header.append(box);
}

// ---------- server calls ----------
async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: "same-origin", ...opts });
  if (res.status === 401) { toSignIn(); throw new Error("Signed out"); }
  return res;
}
function toSignIn() {
  location.replace("auth.html?next=" + encodeURIComponent(location.pathname.replace(/^\//, "") + location.search));
}

function clearLocal() {
  for (let i = ls.length - 1; i >= 0; i--) {
    const k = ls.key(i);
    if (k && (k.startsWith(PREFIX) || k.startsWith("gb-sync-"))) rawRemove.call(ls, k);
  }
  try { indexedDB.deleteDatabase("gaugebook-drawings"); } catch {}
}

async function signOut() {
  await flush();
  if (readList(DIRTY).length && !confirm("Some changes have not been saved to your account yet. Sign out anyway?")) return;
  await fetch("api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
  clearLocal();
  location.replace("auth.html");
}

// ---------- pushing local changes ----------
let timer, flushing = null;
function markDirty(key) {
  writeList(DIRTY, [...readList(DIRTY), key]);
  setStatus("Saving…");
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
}

async function pushKey(key, keepalive = false) {
  const value = ls.getItem(key);
  const url = "api/state?key=" + encodeURIComponent(key);
  const res = value === null
    ? await api(url, { method: "DELETE", keepalive })
    : await api(url, { method: "PUT", body: value, headers: { "content-type": "application/json" }, keepalive: keepalive && value.length < 60000 });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
}

function flush() {
  if (flushing) return flushing.then(() => readList(DIRTY).length && flush());
  flushing = (async () => {
    const keys = readList(DIRTY);
    if (!keys.length) return;
    writeList(DIRTY, []);
    const failed = [];
    let message;
    for (const key of keys) {
      try { await pushKey(key); } catch (e) { failed.push(key); message = e.message; }
    }
    if (failed.length) {
      writeList(DIRTY, [...readList(DIRTY), ...failed]);
      setStatus(navigator.onLine ? "Not saved · retrying" : "Offline · saved on this device", true);
      if (message && navigator.onLine) console.warn("Gaugebook save failed:", message);
      clearTimeout(timer);
      timer = setTimeout(flush, 15000);
    } else if (!readList(DIRTY).length) {
      setStatus("All changes saved");
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

store.setItem = function (key, value) {
  rawSet.call(this, key, value);
  if (this === ls && String(key).startsWith(PREFIX)) markDirty(String(key));
};
store.removeItem = function (key) {
  rawRemove.call(this, key);
  if (this === ls && String(key).startsWith(PREFIX)) markDirty(String(key));
};
addEventListener("online", () => flush());
addEventListener("pagehide", () => {
  for (const key of readList(DIRTY)) pushKey(key, true).catch(() => {});
});

// ---------- drawings (used by uploads.mjs) ----------
async function uploadDrawing(id, file) {
  const q = `id=${id}&name=${encodeURIComponent(file.name || "drawing")}&type=${encodeURIComponent(file.type)}&size=${file.size}`;
  try {
    const res = await api("api/drawings?" + q, { method: "POST" });
    const info = await res.json();
    if (!res.ok) throw new Error(info.error);
    let done = false;
    if (info.uploadUrl) {
      try {
        const put = await fetch(info.uploadUrl, { method: "PUT", body: file, headers: { "x-content-type": file.type, "content-type": file.type } });
        done = put.ok;
      } catch {}
    }
    if (!done) {
      if (file.size > info.maxDirect) throw new Error("This drawing is too large to save to your account right now.");
      const res2 = await api("api/drawings?direct=1&" + q, { method: "POST", body: file });
      if (!res2.ok) throw new Error((await res2.json()).error);
    }
    writeList(DRAWINGS, readList(DRAWINGS).filter((d) => d !== id));
  } catch (e) {
    writeList(DRAWINGS, [...readList(DRAWINGS), id]);
    setStatus("Drawing kept on this device · will retry", true);
    console.warn("Drawing upload failed:", e.message);
  }
}

async function downloadDrawing(id) {
  const res = await api("api/drawings?id=" + id);
  if (res.status === 404) return null;
  const info = await res.json();
  if (!res.ok) throw new Error(info.error);
  let data;
  if (info.url) {
    try { const r = await fetch(info.url); if (r.ok) data = await r.blob(); } catch {}
  }
  if (!data) {
    const r = await api("api/drawings?raw=1&id=" + id);
    if (!r.ok) return null;
    data = await r.blob();
  }
  return new File([data], info.name, { type: info.type });
}

async function retryDrawings(localFile) {
  for (const id of readList(DRAWINGS)) {
    const file = await localFile(id).catch(() => null);
    if (file) await uploadDrawing(id, file);
    else writeList(DRAWINGS, readList(DRAWINGS).filter((d) => d !== id));
  }
}

window.gaugebookSync = { uploadDrawing, downloadDrawing, retryDrawings, flush };

// ---------- start ----------
// The server copy, after sending any changes made on this device first.
async function pull() {
  await flush();
  const res = await fetch("api/state", { credentials: "same-origin" });
  if (res.status === 401) { toSignIn(); throw new Error("Signed out"); }
  if (!res.ok) throw new Error("Server error " + res.status);
  const body = await res.json();
  let user = body.user;
  if (!user) { // older server that does not include the user
    const me = await fetch("api/auth/me", { credentials: "same-origin" });
    if (me.status === 401) { toSignIn(); throw new Error("Signed out"); }
    user = (await me.json()).user;
  }
  return { user, items: body.items };
}

// Make this device's copy match the server (keeping unsent local edits). True if anything changed.
function apply(items) {
  const pending = new Set(readList(DIRTY));
  let changed = false;
  for (let i = ls.length - 1; i >= 0; i--) {
    const k = ls.key(i);
    if (k && k.startsWith(PREFIX) && !(k in items) && !pending.has(k)) { rawRemove.call(ls, k); changed = true; }
  }
  for (const [k, v] of Object.entries(items)) {
    if (!pending.has(k) && ls.getItem(k) !== v) { rawSet.call(ls, k, v); changed = true; }
  }
  return changed;
}

function savedStatus() {
  if (!readList(DIRTY).length) setStatus("All changes saved");
}

function updateBanner(items) {
  const bar = document.createElement("div");
  bar.className = "gb-update";
  bar.setAttribute("role", "status");
  bar.textContent = "Newer changes were saved from another device. ";
  const btn = document.createElement("button");
  btn.textContent = "Reload to see them";
  btn.onclick = async () => { await flush(); apply(items); location.reload(); };
  bar.append(btn);
  document.querySelector("header")?.after(bar);
}

// Repeat visit: the page already opened from this device's copy; check the server now.
async function refresh(owner) {
  let touched = false;
  const touch = () => (touched = true);
  addEventListener("pointerdown", touch, { capture: true, once: true });
  addEventListener("keydown", touch, { capture: true, once: true });
  try {
    const { user, items } = await pull();
    if (user.id !== owner.id) { // a different account is signed in on this browser
      clearLocal();
      rawSet.call(ls, OWNER, JSON.stringify(user));
      apply(items);
      return location.reload();
    }
    rawSet.call(ls, OWNER, JSON.stringify(user));
    const pending = new Set(readList(DIRTY));
    const differs = Object.entries(items).some(([k, v]) => !pending.has(k) && ls.getItem(k) !== v) ||
      Object.keys(localStorage).some((k) => k.startsWith(PREFIX) && !(k in items) && !pending.has(k));
    if (!differs) return savedStatus();
    // The running page holds the old values in memory, so it must reload to use the new ones.
    if (!touched) { apply(items); return location.reload(); }
    savedStatus();
    updateBanner(items);
  } catch (e) {
    if (e.message === "Signed out") return;
    setStatus(navigator.onLine ? "Couldn't reach server · using this device's copy" : "Offline · changes saved on this device", true);
  }
}

async function start() {
  let owner = null;
  try { owner = JSON.parse(ls.getItem(OWNER) || "null"); } catch {}
  if (owner?.id) {
    // Open straight away from this device's copy; the server check runs alongside.
    showAccount(owner);
    setStatus("Checking for updates…");
    refresh(owner);
    return true;
  }
  // First visit on this device: wait for the server copy.
  setStatus("Loading…");
  try {
    const { user, items } = await pull();
    clearLocal();
    rawSet.call(ls, OWNER, JSON.stringify(user));
    showAccount(user);
    apply(items);
    savedStatus();
    return true;
  } catch (e) {
    if (e.message !== "Signed out") toSignIn();
    return false;
  }
}

// Keep the page inactive until its own script has wired up its buttons, so an early
// click (e.g. on "Upload drawing") is never silently ignored.
const main = document.querySelector("main");
function ready() {
  if (main) main.inert = false;
  document.documentElement.dataset.ready = "1";
}
if (main) main.inert = true;
document.addEventListener("gaugebook:ready", ready, { once: true });

if (await start()) {
  if (entry && /^[\w-]+\.mjs$/.test(entry)) await import("./" + entry).finally(ready);
  else ready();
  // Fix copy that described browser-only storage.
  for (const el of document.querySelectorAll(".foot")) {
    for (const n of el.childNodes) if (n.nodeType === 3) n.textContent = n.textContent.replace("Inspections are saved in this browser.", "Inspections are saved to your account.");
  }
}
