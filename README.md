# Ixitek Solutions — Website

Two projects, deployed together as **one app**:

- **`ixitek-frontend/`** — the React + Vite site (unchanged content/design,
  now with a combined login/sign-up page and layout fixes — see below).
- **`ixitek-backend/`** — a Node.js + Express + SQLite API for accounts and
  durable storage of enquiries/applications/users. No external database
  server to install — `db.js` opens a local file. In production, this same
  backend also serves the built frontend (see "Deploying to Hostinger"
  below), so the whole site runs from **one Node.js process on one origin**
  — e.g. `https://ixitek.com` — with no separate API subdomain.
- **`package.json`** (repo root) — thin scripts that only call into the two
  projects above (`--prefix`), so this is what a host like Hostinger runs:
  `npm install`, `npm run build`, `npm start`. Neither sub-project's own
  `package.json` was changed in shape or scripts.

## Local development (frontend and backend run separately, as before)

```bash
# 1) Backend
cd ixitek-backend
npm install
cp .env.example .env      # set JWT_SECRET, OWNER_EMAIL, OWNER_PASSWORD
npm run dev                # http://localhost:5000 — the SQLite file is created automatically

# 2) Frontend (separate terminal)
cd ixitek-frontend
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:5000 (only needed for this split-origin dev setup)
npm run dev                # http://localhost:5173
```

This split-origin setup (frontend on `:5173`, backend on `:5000`) is
unchanged and still the easiest way to develop locally. See
`ixitek-backend/README.md` and `ixitek-frontend/ADMIN_SETUP.md` for full
details on the app itself.

## Running it the way production runs it (one app, one port)

From the repo root — this is also exactly what Hostinger runs:

```bash
npm install
npm run build   # installs backend + frontend deps, builds ixitek-frontend/dist
npm start        # starts ixitek-backend, which now also serves ixitek-frontend/dist
```

Then open `http://localhost:5000` (or whatever `PORT` is set to) — the
whole site, frontend and API, is served from that one address.

## What changed in this update

1. **One login page for everyone** (`/login`, with a `Sign in` / `Create
   account` toggle). Website visitors can create a customer account;
   staff and the owner sign in on the exact same page and are sent to the
   admin panel automatically based on their account's role.
2. **A real backend** (`ixitek-backend/`) — Node.js + Express, with
   `src/db.js` as the *only* place the database is touched. It uses
   **SQLite** (via `better-sqlite3`) — a single local file, so there's no
   separate database server or account to set up; just run the backend
   and it creates `data/ixitek.db` automatically. It comfortably holds a
   large, growing volume of records for a site like this. Passwords are
   hashed with bcrypt; sessions are JWTs.
3. **Data is protected against loss two ways**: WAL journal mode +
   fsync-on-commit (so a crash or power loss mid-write can't corrupt
   already-saved data — always on, nothing to configure), *and* automatic
   scheduled hot backups to `data/backups/` (plus on-demand via
   `npm run backup` or the owner-only `POST /api/admin/backups`), so data
   also survives a deleted file or a bad deploy. See
   `ixitek-backend/README.md` → "Backups & data durability".
4. **Everyone who signs in is stored and visible in the admin panel** —
   the dashboard at `/admin` now has a **"Registered users"** tab listing
   every customer sign-up (name, email, phone, company, registered date),
   alongside the existing enquiries/applications list.
5. **Enquiries, career applications and team accounts now persist in the
   database** instead of browser `localStorage`, so they're visible from
   any device, not just the one they were submitted/created on.
6. **Layout/responsiveness fixes** — the homepage hero and the SAP
   micro-site's hero section were noticeably taller than the viewport on
   common laptop screens (matching the screenshots showing the CTA
   buttons and stats cut off below the fold). Both were tightened
   (spacing, heading/stat sizing, hero-art sizing) so the key content is
   visible without excess scrolling, on mobile, tablet and desktop —
   no page content, copy or visual design was otherwise changed.
7. **Single Node.js Web App deployment (Hostinger-ready)** — `ixitek-backend`
   now also serves the built `ixitek-frontend/dist` and returns `index.html`
   for client-side routes (`/company`, `/products`, `/sap`, `/admin`, etc.)
   without ever intercepting `/api/*`; the frontend now calls the API with a
   relative `/api/...` path in production (no hardcoded `localhost` URL);
   the server reads its port from `process.env.PORT`; and a root
   `package.json` gives a single `npm install && npm run build && npm start`
   flow. See "Deploying to Hostinger" below. No routes, features, styling or
   database behaviour were changed to make this work.

Nothing about the existing pages' content, copy, or visual design was
changed beyond what's described above.

## Deploying to Hostinger (one Node.js Web App, one domain)

This project deploys as **one** Hostinger **Node.js Web App**, connected
directly to the GitHub repository — no separate static site, no separate
API subdomain. Hostinger builds and runs the whole thing (frontend +
backend) from this one repo, and serves it on `https://ixitek.com`.

**Hostinger → Websites → Node.js → Create/Manage Application → connect a
repository**, then enter:

| Setting | Value |
|---|---|
| Repository | `tharunn08/ixitek` |
| Branch | `main` |
| Root directory | `/` (repository root — leave blank/default) |
| Framework | Node.js / Express (custom Node app — not a framework preset) |
| Node.js version | 20.x LTS (any Node ≥ 18 works — see `engines` in `package.json`; 20.x is the safest widely-supported choice for `better-sqlite3`'s prebuilt binaries) |
| Package manager | npm |
| Install/Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Entry file | `ixitek-backend/src/server.js` (invoked via the root `start` script — if Hostinger asks for a literal entry file instead of a command, use this path) |
| Domain | `ixitek.com` (point/attach the domain to this Node.js application) |

**Environment variables** — set these in Hostinger's Node.js app → Environment
Variables panel (do **not** commit a real `.env` file; `.env.example` in each
sub-project documents these too):

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `PORT` | usually automatic | Hostinger injects this; the app reads `process.env.PORT` and never hardcodes a port. Only set it yourself if Hostinger's panel requires you to. |
| `JWT_SECRET` | **yes** | Long random string. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `CORS_ORIGIN` | yes | `https://ixitek.com,https://www.ixitek.com` |
| `OWNER_NAME` / `OWNER_EMAIL` / `OWNER_PASSWORD` | yes | Seeds the one owner/admin account on first boot. Change the password after first login. |
| `DB_PATH` | optional | Defaults to `ixitek-backend/data/ixitek.db`. Only set this if Hostinger needs the SQLite file on a specific persistent path — see "Persistent storage" below. |
| `BACKUP_INTERVAL_HOURS` / `BACKUP_RETENTION` / `BACKUP_DIR` | optional | Defaults are fine (every 6h, keep 30). |
| `VITE_API_URL` | leave unset | Production frontend calls relative `/api/...` paths automatically (same origin as the backend) — see `ixitek-frontend/src/lib/api.js`. Only set this if the API is ever split onto a different origin than the frontend. |
| `VITE_ADMIN_EMAIL` | yes | Inbox that receives the "new enquiry" notification. |
| `VITE_ADMIN_WHATSAPP` | yes | WhatsApp number used by the site's chat button (digits + country code, no `+`). |
| `VITE_EMAILJS_SERVICE_ID` / `VITE_EMAILJS_TEMPLATE_ID` / `VITE_EMAILJS_PUBLIC_KEY` | optional | Leave blank to disable automatic email (enquiries are still saved to the database either way). |

`VITE_*` variables are consumed by Vite **at build time** (during
`npm run build`), so they must be set in Hostinger's environment before the
build runs, not only at start time.

**Persistent storage (important, verify with Hostinger).** This backend
stores its SQLite database at `ixitek-backend/data/ixitek.db` and its
scheduled backups at `ixitek-backend/data/backups/` — real files on disk,
by design (see `ixitek-backend/README.md` → "Backups & data durability").
That's correct on a VPS or any host with a persistent app directory. Before
relying on this in production, confirm with Hostinger whether their managed
Node.js Web App's app directory survives a redeploy — if a redeploy ever
wipes the app folder, point `DB_PATH` (and optionally `BACKUP_DIR`) at a
path Hostinger keeps persistent instead, e.g. `DB_PATH=/home/<user>/ixitek-data/ixitek.db`;
no code change is needed to do this, it's a single environment variable.

## Testing the exact production flow locally

```bash
npm install
npm run build
npm start
```

Then check: homepage (`/`) loads, `/company`, `/products`, `/partners`,
`/sap`, `/sap/training`, `/admin`, and `/login` all load directly and on
refresh (no 404s), `/api/health` responds, sign in / sign up work, enquiry
forms submit, and an unknown `/api/...` path returns a JSON 404 (not
`index.html`). This exact sequence was run during development of this
deployment setup — see the PR/commit notes for the full checklist that was
verified.
