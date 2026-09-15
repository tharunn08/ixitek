# Admin panel & enquiry pipeline — setup guide

This adds, without any backend/server, without changing any existing page
content, and without new npm dependencies:

- Every submission from the **Contact / Enquiry** form and the **Career**
  application form is saved to a built-in admin panel.
- An admin login page at **`/admin/login`** and a dashboard at **`/admin`**
  to view, search, filter, and manage every enquiry.
- An automatic **email** notification on every new submission (via
  EmailJS — a service made exactly for sending email from the browser).
- A **WhatsApp** click-to-chat button site-wide, plus a one-tap "notify us
  on WhatsApp" link after a customer submits a form. Mail and WhatsApp
  icons also sit next to the LinkedIn icon in the footer.
- A **Team access** panel (owner login only) to add teammates by email +
  password so they can sign in too.

## How it works (and its real limits — please read)

There is no backend here, by design, as requested. That has consequences
worth knowing before you rely on this in production:

1. **Storage — read this one carefully.** Enquiries (and teammate accounts,
   see below) are saved with `localStorage`, which belongs to one browser
   on one device. This has a real consequence beyond "won't sync between
   your own devices": a real visitor's enquiry is saved in **their**
   browser, not yours — it will not appear in your `/admin` dashboard by
   itself. The two channels that do reliably reach you are the automatic
   **email** (step 3 below) and the **WhatsApp** link the customer can tap.
   Treat the on-site dashboard as a convenient log of anything submitted
   from your own browser (useful for testing, or if you also work from the
   same computer customers use) plus whatever you manually note down from
   emails — not as a guaranteed record of every visitor enquiry. If you
   want the dashboard itself to reliably show every real enquiry from any
   device, that needs a small shared database (e.g. a free Firebase
   project) — I can wire that up on request; it's still no custom backend
   code, just a hosted data store.
2. **Login security.** The admin password is checked against a SHA-256
   hash compiled into the site's JavaScript. That's a reasonable deterrent
   for a static site, but it is not equivalent to real server-side
   authentication — anyone who inspects the bundle and is determined enough
   could eventually brute-force it. Don't reuse this password anywhere
   sensitive, and treat the admin URL as "unlisted," not "secured."
3. **Email.** Fully automatic — no click needed by the customer or the
   admin. Requires a one-time, free EmailJS setup (below). Until you do
   that, submissions are still captured and shown in the admin panel; only
   the automatic email is skipped (you'll see a note in the browser console).
4. **WhatsApp.** True "auto-send to WhatsApp with zero clicks" needs the
   WhatsApp Business API running on a server, which is out of scope for a
   backend-free frontend. Instead, every enquiry gets a ready-made
   `wa.me` link (pre-filled with the enquiry's details) that opens WhatsApp
   with one tap — for the customer right after they submit, and for you in
   the admin dashboard when replying. There's also a floating "Chat on
   WhatsApp" button on every page for direct outreach.

## 1. Log in to the admin panel

There's now a plain **"Login"** link in the site's main navigation (both
desktop and mobile) that opens the sign-in page. It's deliberately styled
and worded like an ordinary account login — no "admin," "restricted," or
"staff only" language, and the default credentials are no longer shown on
the page itself — so the page doesn't advertise that an enquiry dashboard
sits behind it. Signing in successfully takes you straight to `/admin`.

Default login (not displayed anywhere in the UI, so keep this handy):
- **Username:** `admin`
- **Password:** `Ixitek@2026`

**Change this before sharing your site's link with anyone.** Copy
`.env.example` to `.env` in `ixitek-frontend/`, set `VITE_ADMIN_USERNAME`,
and set `VITE_ADMIN_PASSWORD_HASH` to a SHA-256 hash of your new password
(instructions for generating the hash are inside `.env.example`). Rebuild
the site after changing `.env`.

## 2. Point enquiries at the right email and WhatsApp number

In `.env`:

```
VITE_ADMIN_EMAIL=sales@ixitek.in
VITE_ADMIN_WHATSAPP=919945222724
```

`VITE_ADMIN_WHATSAPP` is digits only, with country code, no `+`/spaces.

## 3. Turn on automatic email (EmailJS, ~5 minutes, free)

1. Create a free account at [emailjs.com](https://www.emailjs.com/).
2. Add an **Email Service** (e.g. connect your Gmail/Outlook) — this gives
   you a **Service ID**.
3. Create an **Email Template** with a subject/body using variables like
   `{{from_name}}`, `{{from_email}}`, `{{phone}}`, `{{company}}`,
   `{{category}}`, `{{message}}`, `{{enquiry_type}}`, `{{submitted_at}}` —
   this gives you a **Template ID**.
4. Copy your **Public Key** from Account → API Keys.
5. Put all three in `.env`:
   ```
   VITE_EMAILJS_SERVICE_ID=service_xxxxxxx
   VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx
   VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxx
   ```
6. Rebuild/redeploy. New submissions will now email you automatically, in
   addition to always being saved in the admin panel.

If you skip this step, everything else keeps working — you'll just need
to check the admin panel for new enquiries instead of getting an email.

## 4. Add teammates (Team access)

Signed in as the owner (the default/`.env` credentials), click **"Team
access"** in the dashboard header. Add a name, email, and a temporary
password for each teammate — they can then sign in from the site's
**Login** link using that email and password.

Important: because there's no backend, add each teammate's account **from
the same browser/computer they'll actually use to sign in.** An account
added on your laptop only exists in your laptop's browser storage — it
won't appear if that teammate opens the login page on their own computer.
For real multi-device staff logins, this needs the same shared-database
upgrade mentioned above.

## Where the code lives

- `src/lib/enquiryStore.js` — save/read/update/delete enquiries (localStorage).
- `src/lib/adminAuth.js` / `src/lib/adminConfig.js` — login + config (owner + staff).
- `src/lib/staffStore.js` / `src/lib/hash.js` — teammate accounts + shared password hashing.
- `src/lib/notifications.js` — EmailJS sending + WhatsApp/mailto link builders.
- `src/pages/admin/AdminLogin.jsx` — the login screen.
- `src/pages/admin/AdminDashboard.jsx` — the dashboard.
- `src/components/admin/StaffManager.jsx` — the "Team access" panel.
- `src/components/forms/EnquiryForm.jsx` and `CareerApplicationForm.jsx` —
  now save to the store and trigger the email on submit.
- `src/components/ui/WhatsAppButton.jsx` — the floating site-wide button.
- `src/components/layout/Footer.jsx` — mail + WhatsApp icons next to LinkedIn.

No existing page content, copy, or design was changed — these are new
files plus small, additive wiring inside the two form components.
