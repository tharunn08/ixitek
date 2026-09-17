# Ixitek backend

A small Node.js / Express / SQLite API that powers real accounts and real
data storage for the Ixitek website: customer sign-up/sign-in, staff &
owner sign-in to the admin panel, and durable storage for every contact
enquiry and career application submitted from the site.

## Why SQLite (via `db.js`)

No external database server, cluster, or account to set up — `src/db.js`
is the only place this backend talks to a database, and it opens (and
creates, on first run) a single local file at `data/ixitek.db`. Every
write still goes through real tables with column types and constraints
(see `src/models/`), not "no schema at all" — you keep validation, just
without an extra service to install or pay for.

If you ever outgrow a single file (e.g. multiple app servers writing at
once), the entire data-access layer is isolated in `src/models/User.js`
and `src/models/Enquiry.js` — you'd swap what's inside those two files for
a client-server database without touching any route.

## Backups & data durability

Two separate things protect your data, covering two separate kinds of
failure:

1. **Crash / power-loss safety (built in, always on).** `db.js` turns on
   SQLite's **WAL (Write-Ahead Logging)** journal mode and
   `synchronous = FULL`, which is what SQLite itself recommends: every
   write is fsync'd to disk before the request is considered done, so a
   crash or power loss mid-write can't corrupt or lose anything already
   committed. Nothing to configure — this is always on.

2. **Standing backups (protects against a deleted file, disk failure, or a
   bad deploy).** WAL mode alone can't help if the `data/` folder itself
   is lost, so the server also takes **automatic hot backups** — safe,
   consistent copies taken while the app keeps running/writing — on a
   schedule:
   - **Automatic**: every `BACKUP_INTERVAL_HOURS` (default 6) while the
     server is running, written to `data/backups/ixitek-<timestamp>.db`.
     Older backups beyond `BACKUP_RETENTION` (default 30) are pruned
     automatically so this can't silently fill the disk.
   - **On demand**: run `npm run backup` any time, or (signed in as the
     owner) `POST /api/admin/backups` — and `GET /api/admin/backups` lists
     what's there.
   - **In production**, also copy the `data/` folder (or point `DB_PATH` /
     `BACKUP_DIR` at one) to a persistent volume or off-server storage —
     e.g. sync `data/backups/` to S3/another disk on a cron job — so a
     backup survives even if the whole machine is lost.

**To restore from a backup:** stop the server, replace
`data/ixitek.db` (and remove any `data/ixitek.db-wal` /
`data/ixitek.db-shm` files next to it, if present) with the chosen file
from `data/backups/`, then start the server again.

## Setup

```bash
cd ixitek-backend
npm install
cp .env.example .env
# edit .env — at minimum set JWT_SECRET
npm run dev      # starts on http://localhost:5000 with auto-reload
# or: npm start
```

That's it — no database to install or connect to separately. The SQLite
file is created automatically at `data/ixitek.db` (configurable via
`DB_PATH` in `.env`) the first time you start the server.

On first start, an **owner** account is created automatically from
`OWNER_EMAIL` / `OWNER_PASSWORD` in `.env` (defaults to
`admin@ixitek.in` / `Ixitek@2026` if left unset) — sign in with this on the
website's login page to reach `/admin`. Change the password in `.env`
before going live.

## API overview

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create a customer account (Sign up) |
| POST | `/api/auth/login` | public | Sign in — customer, staff or owner |
| GET | `/api/auth/me` | Bearer token | Current signed-in user |
| POST | `/api/enquiries` | public | Submit contact/enquiry or career form |
| GET | `/api/enquiries` | staff/owner | List all enquiries + applications |
| PATCH | `/api/enquiries/:id` | staff/owner | Update status |
| DELETE | `/api/enquiries/:id` | staff/owner | Delete a record |
| GET | `/api/admin/users` | staff/owner | List registered customer sign-ups |
| GET | `/api/admin/staff` | staff/owner | List teammates with panel access |
| POST | `/api/admin/staff` | owner only | Add a teammate |
| DELETE | `/api/admin/staff/:id` | owner only | Remove a teammate |
| GET | `/api/admin/stats` | staff/owner | Dashboard counters |
| GET | `/api/admin/backups` | owner only | List existing on-disk backups |
| POST | `/api/admin/backups` | owner only | Trigger an on-demand backup |

All authenticated requests send `Authorization: Bearer <token>` — the
token is returned by `/register` and `/login`.

## Project layout

```
data/
  ixitek.db           the SQLite database file (created on first run)
  backups/            timestamped hot backups (created automatically)
src/
  db.js               the only file that opens/configures the database
  app.js              Express app: middleware + routes
  server.js           entry point — connects DB, seeds owner, schedules backups, starts HTTP server
  models/
    User.js           customers + staff + owner (one table, role column)
    Enquiry.js        contact enquiries + career applications
  routes/
    auth.js           register / login / me
    enquiries.js       public submit + admin list/update/delete
    admin.js           registered users, staff management, stats, backups
  middleware/
    auth.js             JWT verification + role guard
    optionalAuth.js      attaches req.user if a valid token is present, else continues
  utils/
    seed.js             creates/updates the owner account from .env
    backup.js            hot backups: scheduled, `npm run backup`, and POST /api/admin/backups
```
