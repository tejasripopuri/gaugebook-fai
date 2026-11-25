# Gaugebook • First article inspection
A browser-based inspection register for uploaded engineering drawings. Each uploaded file has its own inspection. Inspectors sign in, and inspections, report forms and uploaded drawings are saved to their account, so they're available on any device. The supplied SMP-1001 Rev A has a pre-reviewed register. Use a current desktop Chrome, Edge or Firefox on HTTPS or localhost.

## 1. Run the app on Windows
1. Extract the ZIP. Open the folder containing this README and type **powershell** in File Explorer’s address bar.
2. With Node.js 22 or later and Docker installed, run `npm install`, then `npm run dev`. This starts a local PostgreSQL database in Docker and the app.
3. Open http://localhost:3000 and create an account. Drag any balloon to move it off the drawing's text. Positions are saved with the inspection, used in the PDF, and restored with **Reset balloon positions**. Balloons are coloured by result: green Pass, red Fail, grey not yet measured, and amber to confirm on uploaded drawings. **Download ballooned drawing (PDF)** under the drawing exports every sheet with plain, print-style numbered balloons for the FAI package. On an uploaded PDF, **Confirm PDF-text values (N)** confirms in one step the balloons whose callout and limits were read straight from the PDF's own text, after listing them. In a test on the 30 sample PDFs it confirmed 156 values, all correct (78% of their toleranced callouts). Scanned-image readings, title-block tolerances, unplaced callouts and values without limits are always confirmed individually. The sample opens automatically. Select **Upload drawing** and choose the supplied PDF or its included full-sheet image, public/drawing.png. Click a balloon to see its cropped source and automatic OCR draft.
4. Select **Balloon 5 · Bore diameter**. Enter 1.250, then 1.249. The first passes and the second fails. Clear the field to return it to pending.
5. Select balloon 11 and enter a separate diameter for each mounting hole. Record a certificate reference for material and finish and select the verified outcome. Select **Drawing references and inspection instructions** for the basic locations and datum definitions.
6. Any failing result makes the part fail immediately. All 41 results must pass for an overall pass. Other states display **Not yet inspected** with the progress count. The reset control clears this inspection after confirmation.

## 2. Verify and understand the build
1. With Node.js 22 or later, run `npm install`, then `npm test` in the root. The API tests also need a PostgreSQL database: set `DATABASE_URL` to run them; without it they are skipped. CI runs them against PostgreSQL and also builds the Docker image.
2. The image reader rasterizes PDFs with PDF.js or decodes PNG/JPEG uploads. It compares small image tiles across the whole sheet against the reviewed SMP-1001 renderings. A match loads 25 reviewed characteristics from public/reviewed-plan.json. Selecting a balloon crops its uploaded pixels, rotates vertical callouts and runs bundled Tesseract OCR locally. Compare the OCR draft to the source crop. The reviewed limits drive acceptance because OCR can confuse signs, decimals and GD&T symbols. Other drawings open a separate review workspace. Drawing views are located automatically. The three supplied practice PDFs use feature locations checked against the drawings. For other layouts, the app detects views in the image and reads upright and vertical labels. When a PDF contains positioned text, the app uses it to supplement the OCR. Automatic balloons represent dimensional callouts shown in the drawing views, including geometric tolerances. Notes and feature-table entries are available separately. The inspector can compare each proposed requirement with its source crop. Off-view notes can be attached to a feature from the inspection register. The app reads each PDF page or PNG/JPEG as an image, proposes balloon locations and explicit tolerance limits, and lets the inspector correct or add characteristics before confirming each sheet. Re-uploading the same file reopens its inspection.
3. Tests compare the reviewed register with independently transcribed limits from the drawing and check repeated features, boundary values and status precedence. Pixel-matching tests check noise and local image changes.
4. The four note 5 basic locations (5.000, 3.000, 2.000 and 3.000) have balloons 17–20 showing the dimension only: no tolerance, and the title-block tolerance does not apply. Readings are recorded for information and never count towards pass or fail. Notes 6 and 8 are interpretation and training context. Notes 1–4 and 7 have acceptance entries. The radius, hole size, through and position callouts each have four occurrences. Note 4 is split into observed minimum and maximum. Note 7 is split into marking content/location and height; its approximate location needs customer input. Confirm the drawing's Ra unit before physical inspection. Overall pass describes the defined training checks only. The app does not issue an approved FAIR.

## Generate Forms 1, 2 and 3
Open **Forms 1–3** from the workspace. Form 1 carries the part, drawing and report identifiers, FAI scope and review fields. Form 2 starts with material and anodize rows; enter supplier, certificate and applicable testing evidence. Form 3 lists the occurrences from the selected inspection with actual readings, decisions and evidence. Expand any row for tooling or a nonconformance reference. Select **Download Excel workbook** for all three forms as bordered, labelled worksheets. Form 3 has exactly AS9102 fields 5–12. Field 9 shows each reading exactly as recorded (e.g. `6.004`), with no Pass/Fail text; the Excel cell is green when within limits and red when outside. Attribute checks show the recorded Pass or Fail. The PDF Form 3 shows the same values. Form 1 shows the inspection status at the time of download; record later readings in the app and download again. Select **Download selected form** or **Download all forms**. The PDFs use the A&B Foundry report layouts and repeat Form 3 as needed. The blank template is also downloadable. Unentered measurements display Pending. Identity and approval details are entered by the inspector or reviewer.

## 3. Review the project on GitHub
Read the [one-page delivery brief](FAI-brief.pdf) for the research, sample reconciliation, effort estimates and Hostinger plan. The reviewed sample has 20 visible balloons (four basic, for information), 29 characteristics and 37 required results. Additional controls and notes remain accessible in the register.

The source tree contains the running app, test suite, CI workflow and example forms. The bundled development history can be opened with `git clone -b main ./gaugebook-fai.bundle gaugebook-history`. Review the GitHub Actions tab for CI results.

## 4. Accounts and server storage
- **Sign-in:** `public/auth.html` handles sign-in and account creation.
- **Sync:** `public/boot.mjs` runs before each page. It sends signed-out visitors to sign in, loads the user's saved data from the server, and saves every later change to `gaugebook-*` browser storage back to the server.
- **Header:** shows a save-status chip and **Sign out**. Changes made offline are queued and sent when the connection returns.
- **Drawings:** `public/uploads.mjs` caches drawings in the browser and uploads them to the account. Uploading the same file again reopens its inspection.

`server.mjs` serves the app and the API in `api/`. Data is kept in **PostgreSQL** (`lib/db.mjs`):

| Table | Holds |
|---|---|
| `users` | Accounts (scrypt-hashed passwords) |
| `entries` | Saved inspections, report forms and drawing reviews, with a version number |
| `drawings` | Uploaded drawing details; the files themselves are stored privately on disk (`FILES_DIR`) |
| `audit_events` | Every sign-up, sign-in, save, deletion and upload, keeping the value each change replaced |

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/signup`, `/login`, `/logout` · `GET /api/auth/me` | Accounts (HttpOnly signed session cookie, 30 days; 10 failed sign-ins per 15 min limit) |
| `GET /api/state` · `PUT`/`DELETE /api/state?key=gaugebook-…` | The user's saved entries |
| `GET /api/drawings` · `GET`/`POST /api/drawings?id=<sha256>` | List, download and upload drawings (PDF, PNG, JPEG up to 100 MB; checked against their hash and file type) |
| `GET /api/health` | Health check |

**Only callouts on the drawing views get balloons.** Text beside the drawing is never proposed: general notes, requirement lists (including letter-tagged entries such as `B  Ø1.250 THRU`), tables and the title block. To inspect such a requirement, click its feature on the drawing and enter it.

**General (title-block) tolerances.** When a drawing states general tolerances, such as `.XX ±.01  .XXX ±.005`, a plain dimension printed without its own tolerance takes the one for its number of decimal places. It is shown as, for example, `2.000 ±.005`, with a note that the tolerance came from the title block. This also covers the forms image OCR produces, such as `-XX +.01`. These keep just the dimension, recorded for information:
- basic dimensions: marked `BSC`/`BASIC`, drawn in a box, or listed in a note that calls them basic
- reference dimensions: in brackets, e.g. `(2.000)`, or marked `REF`

A note's basic values are matched by number, so another dimension with the same value on that sheet is treated as basic too.

The pages list every script they load as `<link rel="modulepreload">`, so the browser fetches them all at once instead of one import at a time. This made pages usable in about 0.4 s instead of 1.1 s. After adding or removing an `import`, run `node scripts/update-preloads.mjs`. `npm test` fails if a list is out of date.

Known limits:
- There is no password reset yet.
- If the same inspection is edited on two devices at once, the last save wins. The earlier value is kept in `audit_events`.

## 5. Deploy on Vercel + Neon (free, no server)
The same code runs on Vercel. The API in `api/` runs as Vercel Functions; data is in a free Neon PostgreSQL database; drawings are in a private Vercel Blob store, and large ones upload directly to it.
1. In the Vercel project: **Storage → Create Database → Neon (free)**, connected to the project. This adds `DATABASE_URL`.
2. **Storage → Blob** (private), connected to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. **Settings → Environment Variables:** add `SESSION_SECRET`, a random value of at least 32 characters.
4. **Settings → Git:** connect this repository. Every merge to `main` then deploys automatically. The tables are created on first use.

Limits: Vercel's free Hobby plan is for non-commercial use, and sign-in attempt limits are kept per function instance there.

## 6. Deploy on a Hostinger VPS
The app runs on the VPS as three Docker containers (`compose.yaml`): PostgreSQL, the app, and Caddy, which provides automatic HTTPS.

1. **Get a VPS.** In Hostinger, buy a **KVM 1** or **KVM 2** VPS. Choose the **Ubuntu 24.04** operating system (plain, with no control panel) and set a strong root password or add your SSH key.
2. **Open a terminal on it.** Use hPanel → VPS → **Browser terminal**, or run `ssh root@<server IP>` from your computer.
3. **Install with one command:**
   ```bash
   curl -fsSL https://raw.githubusercontent.com/tejasripopuri/gaugebook-fai/main/deploy/install.sh | bash
   ```
   The installer:
   - installs Docker
   - turns on the firewall (SSH, HTTP and HTTPS only)
   - generates the database password and session secret into `/opt/gaugebook/.env`, which is readable only by root
   - starts the app and schedules nightly backups

   When it finishes, it prints the address, such as `https://82-12-34-56.sslip.io`. That's a free name for your server's IP, and it gets a real HTTPS certificate.
4. **Use your own domain (later).** Add a DNS **A record** pointing the domain, e.g. `gaugebook.example.com`, to the server's IP. Then run `/opt/gaugebook/deploy/set-domain.sh gaugebook.example.com`.

Day-to-day, in `/opt/gaugebook`:

| Task | Command |
|---|---|
| Update to the latest version on GitHub (backs up first) | `deploy/update.sh` |
| Back up now (also runs nightly at 02:30, keeps 14 days in `backups/`) | `deploy/backup.sh` |
| Restore a backup | `deploy/restore.sh <timestamp>` |
| Status and logs | `docker compose ps` · `docker compose logs --tail=100 app` |

Backups are stored on the same server. Also copy `backups/` off the server regularly, for example to your computer with `scp -r root@<server IP>:/opt/gaugebook/backups .`, or turn on Hostinger's VPS snapshots/backups. Keep `/opt/gaugebook/.env` safe: it holds the database password and session secret.
