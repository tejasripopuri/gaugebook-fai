# Gaugebook • First article inspection
A browser-based inspection register for uploaded engineering drawings. Each uploaded file has its own inspection. Inspectors sign in, and inspections, report forms and uploaded drawings are saved to their account, so they're available on any device. The supplied SMP-1001 Rev A has a pre-reviewed register. Use a current desktop Chrome, Edge or Firefox on HTTPS or localhost.

## 1. Run the app on Windows
1. Extract the ZIP. Open the folder containing this README and type **powershell** in File Explorer’s address bar.
2. With Node.js 22 or later installed, run `npm install`, then `npm run dev`.
3. Open http://localhost:3000 and create an account. The sample opens automatically. Select **Upload drawing** and choose the supplied PDF or its included full-sheet image, public/drawing.png. Click a balloon to see its cropped source and automatic OCR draft.
4. Select **Balloon 5 · Bore diameter**. Enter 1.250, then 1.249. The first passes and the second fails. Clear the field to return it to pending.
5. Select balloon 11 and enter a separate diameter for each mounting hole. Record a certificate reference for material and finish and select the verified outcome. Select **Drawing references and inspection instructions** for the basic locations and datum definitions.
6. Any failing result makes the part fail immediately. All 37 results must pass for an overall pass. Other states display **Not yet inspected** with the progress count. The reset control clears this inspection after confirmation.

## 2. Verify and understand the build
1. With Node.js 22 or later, run `npm test` in the root. No npm install or build step is needed.
2. The image reader rasterizes PDFs with PDF.js or decodes PNG/JPEG uploads. It compares small image tiles across the whole sheet against the reviewed SMP-1001 renderings. A match loads 25 reviewed characteristics from public/reviewed-plan.json. Selecting a balloon crops its uploaded pixels, rotates vertical callouts and runs bundled Tesseract OCR locally. Compare the OCR draft to the source crop. The reviewed limits drive acceptance because OCR can confuse signs, decimals and GD&T symbols. Other drawings open a separate review workspace. Drawing views are located automatically. The three supplied practice PDFs use feature locations checked against the drawings. For other layouts, the app detects views in the image and reads upright and vertical labels. When a PDF contains positioned text, the app uses it to supplement the OCR. Automatic balloons represent dimensional callouts shown in the drawing views, including geometric tolerances. Notes and feature-table entries are available separately. The inspector can compare each proposed requirement with its source crop. Off-view notes can be attached to a feature from the inspection register. The app reads each PDF page or PNG/JPEG as an image, proposes balloon locations and explicit tolerance limits, and lets the inspector correct or add characteristics before confirming each sheet. Re-uploading the same file reopens its inspection.
3. Tests compare the reviewed register with independently transcribed limits from the drawing and check repeated features, boundary values and status precedence. Pixel-matching tests check noise and local image changes.
4. Note 5 basic dimensions are reference geometry. Notes 6 and 8 are interpretation and training context. Notes 1–4 and 7 have acceptance entries. The radius, hole size, through and position callouts each have four occurrences. Note 4 is split into observed minimum and maximum. Note 7 is split into marking content/location and height; its approximate location needs customer input. Confirm the drawing's Ra unit before physical inspection. Overall pass describes the defined training checks only. The app does not issue an approved FAIR.

## Generate Forms 1, 2 and 3
Open **Forms 1–3** from the workspace. Form 1 carries the part, drawing and report identifiers, FAI scope and review fields. Form 2 starts with material and anodize rows; enter supplier, certificate and applicable testing evidence. Form 3 lists the occurrences from the selected inspection with actual readings, decisions and evidence. Expand any row for tooling or a nonconformance reference. Select **Download Excel workbook** for all three editable worksheets. In Form 3, enter measurements in column E to recalculate the Form 1 summary. Select **Download selected form** or **Download all forms**. The PDFs use the A&B Foundry report layouts and repeat Form 3 as needed. The blank template is also downloadable. Unentered measurements display Pending. Identity and approval details are entered by the inspector or reviewer.

## 3. Review the project on GitHub
Read the [one-page delivery brief](FAI-brief.pdf) for the research, sample reconciliation, effort estimates and Hostinger plan. The reviewed sample has 16 visible dimension balloons, 25 characteristics and 37 required results. Additional controls and notes remain accessible in the register.

The source tree contains the running app, test suite, CI workflow and example forms. The bundled development history can be opened with `git clone -b main ./gaugebook-fai.bundle gaugebook-history`. Review the GitHub Actions tab for CI results.

## 4. Accounts and server storage
- **Sign-in:** `public/auth.html` handles sign-in and account creation.
- **Sync:** `public/boot.mjs` runs before each page. It sends signed-out visitors to sign in, loads the user's saved data from the server, and saves every later change to `gaugebook-*` browser storage back to the server.
- **Header:** shows a save-status chip and **Sign out**. Changes made offline are queued and sent when the connection returns.
- **Drawings:** `public/uploads.mjs` caches drawings in the browser and uploads them to the account. The workspace page lists the user's uploaded drawings.

The API is a set of Vercel Functions in `api/`, with shared code in `lib/`:

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup`, `/login`, `/logout` · `GET /api/auth/me` | Accounts (scrypt-hashed passwords, HttpOnly signed session cookie, 30 days) |
| `GET /api/state` · `PUT`/`DELETE /api/state?key=gaugebook-…` | The user's saved inspections, report forms and drawing reviews |
| `GET /api/drawings` · `GET`/`POST /api/drawings?id=<sha256>` | List, download and upload drawings (PDF, PNG, JPEG, up to 100 MB, uploaded directly to storage) |

Data lives in a **private Vercel Blob store**: `users/<hash of email>.json` and `data/<userId>/…`.

To run locally, run `npm install`, then `npm run dev`, and open http://localhost:3000. Without a Blob token, data is kept in `.data/`.

Known limits:
- There is no password reset yet.
- Sign-in attempts aren't rate-limited.
- If the same inspection is edited on two devices at once, the last save wins.

## 5. Publish on Vercel
1. Sign in to Vercel. Choose Add New → Project and import this GitHub repository. Framework: **Other**. `vercel.json` sets the output directory (`public`), no build step and `npm install`.
2. **Storage → Create → Blob**, choose **Private** access, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. **Settings → Environment Variables**: add `SESSION_SECRET`, a random value of at least 32 characters (e.g. `openssl rand -base64 48`). Then redeploy.
4. Pushes to `main` deploy to production once Git integration is connected. Other branches get preview URLs.
