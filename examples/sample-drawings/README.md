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

## How the app handled them

All 50 were uploaded through the app's **Upload drawing** button into one account. The app read every sheet automatically, in 4–10 seconds per drawing. "Found" means the app proposed the callout **with exactly the right limits** before any inspector edits. 327 callouts have numeric limits.

| Format | Drawings | Found: before OCR repair (24 Nov) | Found: with OCR repair (25 Nov) |
|---|---|---|---|
| PDF (text inside the file) | 25 | 157 / 157 (100%) | **157 / 157 (100%)** |
| PDF, two sheets | 5 | 43 / 43 (100%) | **43 / 43 (100%)** |
| PNG image | 15 | 1 / 94 (1%) | **62 / 94 (66%)** |
| JPEG "scan" | 5 | 1 / 33 (3%) | **23 / 33 (70%)** |

- **PDFs:** the app uses the text embedded in the file, so every toleranced callout comes out with the right limits.
- **Images:** OCR reads `±` as `+` and `Ø` as `@`. `repairOcrText` in `public/callouts.mjs` corrects these, but only when the reading is otherwise intact. It leaves alone:
  - one-sided tolerances, which keep their `/-`
  - values that also lost their decimal point
  - values stuck to stray characters
  - `Ø` misread as the digit `9`

  For those, the app proposes no limits rather than wrong ones, so the inspector types them. The repair added no wrong limits in this test.

**Recommendation:** ask suppliers and customers for the original PDF export rather than a scan or screenshot whenever possible.
