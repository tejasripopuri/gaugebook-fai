// Lists every script a page needs as <link rel="modulepreload"> in the page itself, so the
// browser fetches (or re-checks) them all at once instead of discovering them one import at a
// time. Run after changing imports:  node scripts/update-preloads.mjs
// tests/preload.test.mjs fails when a page's list is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
export const PAGES = { "index.html": "app.mjs", "forms.html": "forms.mjs", "review.html": "review.mjs" };
const START = "<!-- modulepreload:start -->", END = "<!-- modulepreload:end -->";

// Static imports only (dynamic import() is loaded on demand, e.g. the OCR engine).
export function moduleGraph(entry) {
  const seen = new Set(), queue = ["boot.mjs", entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(path.join(PUBLIC, file), "utf8");
    for (const m of source.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,]+\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g)) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  }
  seen.delete(entry === "boot.mjs" ? "" : "boot.mjs"); // boot.mjs is the page's own <script>
  return [...seen].sort();
}

export function preloadBlock(entry) {
  return START + moduleGraph(entry).map((f) => `<link rel="modulepreload" href="${f}">`).join("") + END;
}

export function withPreloads(html, entry) {
  const block = preloadBlock(entry);
  if (html.includes(START)) return html.replace(new RegExp(START + "[\\s\\S]*?" + END), block);
  return html.replace(/(<link rel="stylesheet"[^>]*>)/, "$1" + block);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [page, entry] of Object.entries(PAGES)) {
    const file = path.join(PUBLIC, page), html = readFileSync(file, "utf8"), next = withPreloads(html, entry);
    if (next !== html) writeFileSync(file, next);
    console.log(`${page}: ${moduleGraph(entry).length} modules`);
  }
}
