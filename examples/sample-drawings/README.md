# Sample drawings (SMP-2001 – SMP-2050)

These are 50 **fictional** training drawings for testing uploads in Gaugebook. None of them are real parts.

| | |
|---|---|
| Part families | Mounting plates, bolted flanges, angle brackets, stepped shafts, fixture blocks (10 of each) |
| Formats | 30 PDF, 5 of them with two sheets (SMP-2006, 2012, 2018, 2024, 2030) · 15 PNG · 5 JPEG made to look like scanned prints (slight skew and blur) |
| Units | 34 in inches, 16 in millimetres |
| Callouts | 416 in total. 312 have tolerances to measure; the rest are notes, threads, flatness and runout to verify |

- **`answer-key.csv`**: every callout on every drawing, with the acceptance limits an inspector should derive from it (`lower`, `upper`, `unit`). Rows marked `verify` have no numeric limits.
- **`drawings.json`**: one line per drawing: family, units, sheets and callout counts.
- **`generate.py`**: recreates the set exactly with `python3 generate.py`. Needs reportlab, Pillow and poppler's `pdftoppm`.

## How the app handled them (tested 24 Nov 2026)

All 50 were uploaded through the app's **Upload drawing** button into one account. The app read every sheet automatically, in 4–10 seconds per drawing. "Found" means the app proposed the callout **with exactly the right limits** before any inspector edits.

| Format | Drawings | Toleranced callouts found |
|---|---|---|
| PDF (text inside the file) | 25 | **152 / 152 (100%)** |
| PDF, two sheets | 5 | **37 / 37 (100%)** |
| PNG image | 15 | 1 / 91 (1%) |
| JPEG "scan" | 5 | 1 / 32 (3%) |

- **PDFs:** the app uses the text embedded in the file, so every toleranced callout came out with the right limits. It also proposed 11 limits that aren't in the answer key; review those before confirming.
- **Images (PNG/JPEG):** the app places balloons on most callouts, but OCR misreads the symbols. `±` comes out as `+`, and `Ø` comes out as `@` or `9`, so `5.000 ±.010` is read as `5.000 +.010`. The app deliberately doesn't guess limits from text like that. The inspector compares each proposal with the source crop and types the tolerance. That's expected behaviour, but it means image uploads need noticeably more manual entry than PDFs.

**Recommendation:** ask suppliers and customers for the original PDF export rather than a scan or screenshot whenever possible.
