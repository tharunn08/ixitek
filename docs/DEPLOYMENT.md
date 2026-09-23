# IXITEK — Production deployment (Hostinger)

The whole platform is **one Node.js Web App**: `npm start` runs `ixitek-backend/src/server.js`, which serves `/api/*`, the built React app, `/robots.txt`, `/sitemap.xml` and SEO metadata from one origin. The database is **MySQL 8 or MariaDB 10.6+** (both are tested in CI).

> Deploy to a **staging** subdomain first (e.g. `staging.ixitek.com` with its own database and Razorpay **test** keys), run the checks in §7, then repeat for production with live keys.

---

## 1. Prepare persistent folders and databases

1. **hPanel → Databases → MySQL Databases**
   - Create the production database + user (e.g. `u123_ixitek` / `u123_ixitek`). Give the user **all privileges** on it. Note host, port, user, password.
   - Create a second, **empty** database for automated restore tests (e.g. `u123_ixitek_restoretest`) and grant the **same user** all privileges on it. The weekly restore test replays the newest backup into it and then empties it again.
2. **hPanel → File Manager** (or SSH): create folders **outside** the application directory so redeploys never delete them:
   ```
   /home/<user>/ixitek-data/storage     (uploads, RFQ attachments, image cache)
   /home/<user>/ixitek-data/backups     (verified database backups)
   ```

## 2. Create the Node.js application

**hPanel → Websites → Node.js → Create application → connect the GitHub repository**

| Setting | Value |
|---|---|
| Branch | `main` |
| Root directory | repository root (`/`) |
| Node.js version | **20.x or 22.x LTS** |
| Install / build command | `npm run build` (installs backend + frontend and builds the frontend) |
| Start command | `npm start` |
| Entry file (if asked) | `ixitek-backend/src/server.js` |
| Domain | `ixitek.com` (+ `www`) — enable the free SSL certificate |

The optional image optimiser (`sharp`, an optionalDependency) installs prebuilt binaries on Linux x64. If the host cannot install it, the site still works and simply serves original image URLs.

## 3. Environment variables (hPanel → Node.js app → Environment variables)

`VITE_*` values are read **at build time** — set them before the build runs. Quote any value containing `#`.

### Required

| Variable | Example / notes |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_SITE_URL` | `https://ixitek.com` — used in emails, sitemap, canonical URLs. Must be https. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | from §1 |
| `JWT_SECRET` | ≥ 32 random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_PASSWORD` | first owner account (created once on first start) |
| `CORS_ORIGIN` | `https://ixitek.com,https://www.ixitek.com` |
| `STORAGE_DIR` | `/home/<user>/ixitek-data/storage` |
| `BACKUP_DIR` | `/home/<user>/ixitek-data/backups` |
| `EMAIL_PROVIDER` + credentials | see §5 (`log` is refused in production) |

### Recommended

| Variable | Notes |
|---|---|
| `BACKUP_RESTORE_TEST_DB` | the empty restore-test database from §1 — enables weekly automated restore tests |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | §4. Without keys, online payment is hidden (bank transfer / RFQ still work). |
| `EMAIL_FROM` | e.g. `orders@ixitek.in` (must be a mailbox/domain your provider is allowed to send as) |
| `SALES_INBOX` | fallback inbox for internal notifications (the admin setting takes precedence) |
| `TRUST_PROXY` | `1` (default in production) |
| `DB_SSL` | `true` if your MySQL host requires TLS |

### Optional (defaults are sensible)

`DB_POOL_SIZE=10`, `DB_SLOW_QUERY_MS=500`, `AUTO_MIGRATE=true`, `PRE_MIGRATION_BACKUP=true`, `BACKUP_INTERVAL_HOURS=6`, `BACKUP_KEEP_DAILY=7`, `BACKUP_KEEP_WEEKLY=5`, `BACKUP_KEEP_MONTHLY=12`, `BACKUP_KEEP_INTERVAL=8`, `BACKUP_KEEP_OTHER=10`, `FX_PROVIDER_URL` (default open.er-api.com USD base), `FX_REFRESH_HOURS=6`, `JOBS_ENABLED=true`, `JOBS_POLL_MS=2000`, `IMAGE_MAX_MB=15`, `IMAGE_FETCH_TIMEOUT_MS=10000`, `MAX_IMPORT_MB=15`, `AUTH_MAX_FAILED_LOGINS=8`, `AUTH_LOCK_MINUTES=15`, `VITE_ADMIN_EMAIL`, `VITE_ADMIN_WHATSAPP`. Leave `VITE_API_URL` **unset** in production (same origin).

The server **refuses to start in production** if JWT_SECRET is weak, DB credentials are missing, PUBLIC_SITE_URL is not https, Razorpay keys are set without a webhook secret, or EMAIL_PROVIDER=log. Other gaps (no email provider, no BACKUP_DIR, no restore DB) are logged as warnings at start-up.

## 4. Razorpay

1. Razorpay Dashboard → **Settings → API Keys**: generate **test** keys for staging, **live** keys for production (live requires KYC approval).
2. **Settings → Webhooks → Add**: URL `https://<your-domain>/api/webhooks/razorpay`, set a secret (→ `RAZORPAY_WEBHOOK_SECRET`), events: `payment.captured`, `payment.failed`, `payment.authorized`, `order.paid`, `refund.processed`, `refund.failed`.
3. Payment capture: **automatic** is recommended; if manual, the server captures authorised payments itself.
4. International cards / currencies: enable them in the Razorpay account first, then tick "Razorpay enabled" for those currencies in **Admin → International commerce → Currencies**. Only INR is enabled by default.
5. Fee planning rules (domestic 2 % + 18 % GST, international 3 % + 18 % GST) are in **Admin → International → Payment fees**. Actual gateway fees returned by Razorpay are stored on each payment and win over the planning rule. Fees are never added to the customer's total.
6. Test on staging with Razorpay test cards/UPI: successful payment, failed payment, closing the window, refund (full and partial). Confirm each in **Admin → Finance → Payments** and the order page.

## 5. Email

Pick one provider:

| Provider | Variables |
|---|---|
| Hostinger / Zoho / Google Workspace / any SMTP | `EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT` (465 or 587), `SMTP_SECURE` (`true` for 465), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Amazon SES | use SES **SMTP credentials** with `EMAIL_PROVIDER=smtp` (`email-smtp.<region>.amazonaws.com`, port 587) |
| Resend | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (verified domain) |
| SendGrid | `EMAIL_PROVIDER=sendgrid`, `SENDGRID_API_KEY`, `EMAIL_FROM` (verified sender) |

Add SPF/DKIM (and DMARC) DNS records for the sending domain as instructed by the provider. Emails are queued in an outbox and retried; failures never block orders. **Admin → Finance → Emails** shows every message, errors and a *Resend* button.

## 6. First start and data cut-over

1. Deploy. On start the server takes a **verified pre-migration backup** (if the database already has tables), applies migrations, seeds the owner and starts the job worker, FX refresh and backup schedule.
2. `https://<domain>/api/health` → `{"ok":true,"db":"up"}`.
3. Coming from the old SQLite site: set `LEGACY_SQLITE_PATH` to the old `ixitek.db` and run `npm run migrate:legacy` once (idempotent; it backs up and verifies).
4. Sign in as owner and complete the manual configuration in `docs/FINAL_REPORT.md` §19 (seller details, margins, FX rates, freight/customs rules, weights, email inboxes, warehouses, bank details, terms URL).
5. **Admin → Monitoring → Back up now**, then **Run restore test** — both should pass. Download one backup file to off-site storage.

## 7. Go-live checklist (staging first)

- [ ] Home, catalog, product page, search, compare load; `view-source:` of a product page shows its title, canonical and Product JSON-LD.
- [ ] `/robots.txt` and `/sitemap.xml` load; submit the sitemap in Google Search Console.
- [ ] Ship-to selector changes currency; cart and checkout recalculate.
- [ ] Guest checkout with bank transfer → order page, proforma PDF, order email received.
- [ ] Razorpay test payment → order *Confirmed*, payment in Admin → Finance, tax invoice PDF + email (requires seller details).
- [ ] Failed payment and closed window leave the order payable; webhook events show *processed*.
- [ ] Refund (partial, then full) → credit note issued; customer email received.
- [ ] India GST (if IXITEK invoices GST): seller GSTIN + GST state set; an INR order to the seller's state shows CGST + SGST, one to another state shows IGST; tax invoice PDF shows place of supply and HSN summary; Admin → Finance → GST register lists it and the CSV downloads.
- [ ] RFQ → admin quote → send → customer accept → order at quoted price.
- [ ] Shipment create → shipped with tracking → delivered → emails; stock decremented.
- [ ] Return request → approve → receive with restock → stock incremented.
- [ ] Admin → Monitoring shows no HTTP 500s, no dead jobs, backup < 30 h old, restore test passed.
- [ ] Load test staging: `BASE=https://staging.ixitek.com npm run loadtest --prefix ixitek-backend` (429s are the rate limiter working).

## 8. Operations

- **Backups:** automatic (daily/weekly/monthly tiers + interval), each gzip + SHA-256 manifest + full re-read verification; before every migration; weekly restore test when `BACKUP_RESTORE_TEST_DB` is set. Download backups off-site regularly (hPanel File Manager or SFTP). Restore: `npm run restore --prefix ixitek-backend -- <file.sql.gz> --into <database> --yes` (refuses the live database unless you add `--i-understand-this-overwrites-production`). Recommended: restore into a new database, verify, then point `DB_NAME` at it.
- **Monitoring:** Admin → Monitoring (DB latency, job queue, dead jobs with retry, email failures, payment/webhook failures, HTTP 500s, DB errors, slow queries, import/image failures, backups, restore tests). Server logs are JSON lines in the Hostinger app log.
- **Scaling:** stateless app server; all state is in MySQL and `STORAGE_DIR`. Jobs use `SELECT … FOR UPDATE SKIP LOCKED`, and periodic jobs are de-duplicated per period, so more than one instance can run safely (use a shared `STORAGE_DIR`).

## 9. Rollback

1. Redeploy the previous Git commit (hPanel → Node.js → Deployments, or push a revert).
2. Migrations are forward-only. If a release added migrations that must be undone, restore the **pre-migration backup** taken automatically before it (file name contains `pre-migration`) into a new database and point `DB_NAME` at it.
3. Orders/payments taken after that backup would be lost by a restore — prefer fixing forward unless data is corrupted.
