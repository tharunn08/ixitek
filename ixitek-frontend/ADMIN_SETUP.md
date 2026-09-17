# Accounts, login & the admin panel — setup guide

The site now has a real backend (see `../ixitek-backend`) and one login
page that serves everyone:

- **`/login`** — a single page with two tabs: **Sign in** and
  **Create account**. Any website visitor can create a customer account
  here (name, email, phone, company, password). The same page is also
  where the **owner** and **staff** sign in to reach the admin panel —
  there is no separate admin URL to remember.
- After signing in, the frontend checks the account's role and sends you
  to the right place automatically: customers land back on the site,
  staff/owner land on **`/admin`**.
- Every contact/enquiry form submission, every career application, and
  **every account that registers** is stored in the backend's database
  (SQLite — a single local file, see `../ixitek-backend`) and shows up in
  the admin dashboard — in a **"Registered users"** tab
  alongside the existing enquiries list — from any device, not just the
  browser it was submitted from.
- Team access (owner only): from `/admin`, click **"Team access"** to add
  a teammate by name + email + password. Because accounts now live in the
  database (not `localStorage`), a teammate can sign in from **any**
  device using the email/password you set — no need to add them from
  their own browser.

## 1. Start the backend

```bash
cd ../ixitek-backend
npm install
cp .env.example .env
# set JWT_SECRET, OWNER_EMAIL, OWNER_PASSWORD in .env
npm run dev
```

No database to install — `db.js` creates a local SQLite file
(`ixitek-backend/data/ixitek.db`) automatically the first time you start
the server, and the server also takes automatic backups of it on a
schedule (see `../ixitek-backend/README.md` → "Backups & data
durability") so submissions and accounts aren't at risk of being lost.
On first start, an **owner** account is created automatically from `OWNER_EMAIL` /
`OWNER_PASSWORD` — sign in with those at `/login` to reach `/admin`.
**Change the password in `.env` before going live.**

## 2. Point the frontend at the backend

In `ixitek-frontend/.env` (copy `.env.example`):

```
VITE_API_URL=http://localhost:5000
```

Update this to your deployed backend's URL in production.

## 3. Point enquiries at the right email and WhatsApp number

Still configured the same way as before, in `ixitek-frontend/.env`:

```
VITE_ADMIN_EMAIL=sales@ixitek.in
VITE_ADMIN_WHATSAPP=919945222724
```

## 4. Turn on automatic email (EmailJS, ~5 minutes, free — optional)

Unchanged from before — see the `VITE_EMAILJS_*` variables in
`.env.example`. This is a nice-to-have on top of the database storage
below; enquiries are saved to the database (and visible in `/admin`)
whether or not email is configured.

## Where the code lives

**Frontend** (`ixitek-frontend/src/`):
- `lib/api.js` — fetch wrapper that talks to the backend + stores the auth token.
- `lib/adminAuth.js` — sign in / create account / sign out, used by everyone.
- `lib/enquiryStore.js` — submit/list/update enquiries & career applications.
- `lib/userStore.js` — admin-only: list registered customers.
- `lib/staffStore.js` — admin-only: list/add/remove teammates.
- `pages/admin/AdminLogin.jsx` — the combined sign in / create account screen (`/login`).
- `pages/admin/AdminDashboard.jsx` — the dashboard (`/admin`), with Enquiries and Registered Users tabs.
- `components/admin/StaffManager.jsx` — the "Team access" panel.
- `components/forms/EnquiryForm.jsx` / `CareerApplicationForm.jsx` — save to the database via the API and trigger the email on submit.

**Backend** (`ixitek-backend/`) — see its own `README.md`.

No existing page content, copy or design was changed — this replaces the
previous browser-only (localStorage) storage with a real Node.js/SQLite
backend, and extends the existing admin login page into a combined
sign in / sign up page for everyone.
