import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGES, preloadBlock } from "../scripts/update-preloads.mjs";

// Pages list their scripts up front so the browser loads them in parallel.
test("each page's modulepreload list matches its imports (run: node scripts/update-preloads.mjs)", () => {
  for (const [page, entry] of Object.entries(PAGES)) {
    const html = readFileSync(new URL("../public/" + page, import.meta.url), "utf8");
    assert.ok(html.includes(preloadBlock(entry)), page + " has an out-of-date modulepreload list");
  }
});
