# Ixitek Solutions — Website

Two projects:

- **`ixitek-frontend/`** — the React + Vite site (unchanged content/design,
  now with a combined login/sign-up page and layout fixes — see below).
- **`ixitek-backend/`** — new: a Node.js + Express + SQLite API for
  accounts and durable storage of enquiries/applications/users. No
  external database server to install — `db.js` opens a local file.

## Quick start

```bash
# 1) Backend
cd ixitek-backend
npm install
cp .env.example .env      # set JWT_SECRET, OWNER_EMAIL, OWNER_PASSWORD
npm run dev                # http://localhost:5000 — the SQLite file is created automatically

# 2) Frontend (separate terminal)
cd ixitek-frontend
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:5000
npm run dev                # http://localhost:5173
```

See `ixitek-backend/README.md` and `ixitek-frontend/ADMIN_SETUP.md` for full
details.

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

Nothing about the existing pages' content, copy, or visual design was
changed beyond what's described above.
