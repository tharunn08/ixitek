# IXITEK — Implementation Assessment (Phase 1 audit)

Date: 21 Sep 2026 · Scope: `ixitek-main 2.zip` + `Product_Catalog-2026.v1.2.Ixitek.xlsx`

This is the audit that precedes any code change. The existing app is **extended, not replaced**.

---

## 1. What exists today

| Layer | Current state |
|---|---|
| Frontend | React 19 + Vite 8 + React Router 7 + Tailwind 4 + framer-motion + lucide. 23 pages (Home, Company, Partners, Products, Category, Product detail, Contact, Career, Login/Signup, Admin, 7 SAP pages). ~9.8k lines. |
| Product data | **Hard-coded** in `src/data/products.js`: 4 categories, 18 "families" with marketing copy, variant *names* (strings) and a few spec rows. No SKUs, prices, stock or images per SKU. |
| Backend | Express 4, 12 files / ~1.1k lines. Routes: `/api/auth` (register/login/me), `/api/enquiries`, `/api/admin` (users, staff, stats, backups), `/api/health`. |
| Database | SQLite via `node-sqlite3-wasm` (pure WASM, chosen for Hostinger). 2 tables: `users` (roles customer/staff/owner), `enquiries` (enquiry + career, resumes stored as base64 in the row). |
| Auth | bcrypt (12 rounds) + JWT (8h / 30d) as Bearer token stored in `localStorage`. Owner auto-seeded from env. |
| Backups | `VACUUM INTO` hot backup every 6h, keep 30, owner-triggered backup endpoint. No verification step, same disk as DB. |
| Deploy | One Hostinger Node.js Web App: `npm run build` → backend serves `ixitek-frontend/dist`. GitHub workflow is a disabled legacy SFTP deploy. No CI, no tests. |
| Email | Frontend-only EmailJS (optional, browser-side). No server email. |

## 2. Catalog workbook — findings (important)

| Finding | Detail | Handling |
|---|---|---|
| **Row count is 379, not ~939** | 11 product sheets, 44 product groups, **379 product rows → 370 unique SKUs**. (Plus a cover sheet.) Every cell was scanned, no data beyond column H. | Import all 379 rows; report reconciles 379 → 370. If a 939-row version exists, the same importer takes it. |
| 9 SKUs appear twice | e.g. `99IL50-B3122P-LB` listed both under its cable group and under "Loopbacks"; MPO adaptors repeated on two sheets. Prices/descriptions identical. | One product, linked to both groups. Reported as "duplicate — merged". |
| 5 suspicious SKUs | `99IL6499IL50-4020-0`, `99IL6499IL50-4020-1`, `99IL6499IL50G-4120-0-GY` contain the `99IL` prefix twice (looks like a concatenation slip). | **Imported exactly as written** (never silently alter SKUs) and flagged in the data-quality dashboard for a human to confirm. |
| "Image from URL" = `#VALUE!` | Column H (and B on first rows) is an Excel `IMAGE()` formula, not data. | Ignored. `URL Location` (col G) used instead. |
| 3 rows have no image URL | `99IL50G-3162P-LB` (×2), `99IL50G-8162P-MGLB`. | Imported with fallback image, flagged "missing image". |
| 68 unique image URLs | All on `*.public.blob.vercel-storage.com`. My sandbox's network policy blocked them, so reachability is **not yet verified**. | Importer validates each URL (HEAD) on the server and reports valid/broken. |
| Price precision | 34 rows carry float noise, e.g. `5.053999999999999`. | Stored as `DECIMAL(12,4)` exactly as supplied; money shown at 2 dp; no float math. |
| **Cover sheet = supplier catalog** | "Wave2Wave.io … Confidential 2026 … Pricing subject to change". Prices are "US FOB" and "EXW CN". | See decision **D1** below — these look like *purchase* prices, not public selling prices. |
| No transceivers | Confirmed — nothing in the workbook is a transceiver. | Optical Transceivers category is created empty; no products invented. |
| Attributes are only in the description | Fiber type, connector, length, jacket, colour, polish live inside free text. | Parsed with conservative rules into filterable attributes; the original description is kept verbatim; unparsed values stay blank (never guessed). |

## 3. Audit matrix

**A. Reuse as-is** — SAP micro-site (all 7 pages + data), Company/Partners/Career/Contact pages, forms, UI kit (`Button`, `Badge`, `Reveal`, etc.), Tailwind theme, one-app Hostinger deployment model, bcrypt/JWT approach, rate-limited login, backup concept.

**B. Modify** — `Header`/`MegaMenu`/`MobileNav` (add Products/Solutions/Services/Resources/Support, search, country/currency, cart), `Products`/`CategoryPage`/`ProductDetail` (read from API instead of `products.js`), `AdminDashboard` (becomes a shell with modules), `api.js` (request IDs, retry, typed errors), `server.js` (MySQL, job worker, graceful shutdown).

**C. Refactor** — `db.js` → MySQL pool + repository layer; routes → modules (`src/modules/<name>/{routes,service,repo}`); roles → permissions (RBAC); error handler (no raw `err.message` in prod); enquiries list (paginate, stop sending base64 resumes in list payloads).

**D. Replace** — hard-coded `products.js` catalog as source of truth (kept only as marketing copy for the legacy family pages until migrated); SQLite as production DB; EmailJS (browser) → server `EmailService` + outbox.

**E. Leave untouched** — SAP content, brand assets, legal/company copy, fonts.

**F. Technical debt** — single 654 KB JS bundle (no route splitting); 5.5 MB of unoptimised JPGs in `public/images`; no tests/lint in CI; no migrations system; timestamps as epoch ints; hard deletes for enquiries/staff; `products.js` duplicated between menu, filters and pages.

**G. Security risks**
1. Default owner password `Ixitek@2026` in code + `.env.example` — must be forced from env in production.
2. JWT in `localStorage` (readable by any XSS) — move to httpOnly, `SameSite=Lax` cookie + CSRF token for mutations.
3. `app.set('trust proxy')` missing — behind Hostinger's proxy all users share one IP for rate limiting.
4. Global error handler returns `err.message` → can leak DB internals.
5. Résumés accepted as base64 JSON with no MIME/size validation beyond the 2 MB body limit.
6. Staff can hard-delete enquiries; no audit trail.
7. No password policy beyond 6 chars; no lockout beyond the IP limiter.

**H. Performance risks** — no code splitting; enquiries endpoint returns up to 2,000 rows *with* résumé blobs; big hero/category images without dimensions/lazy loading.

**I. Data migration** — `users` and `enquiries` → MySQL (ids preserved, epoch ms → `DATETIME(3)`, résumé blobs moved to file storage with a reference). Pre-migration backup, row-count + checksum verification, dry-run mode, rollback = keep SQLite file untouched and switch `DB_CLIENT` back.

**J. Deployment risks** — Hostinger needs a MySQL database created in hPanel and its credentials as env vars; `npm run build` must stay the build command; migrations must run before the new code serves traffic (added to `npm start` guarded by a lock); the Hostinger app folder may be wiped on redeploy → backups and uploads must live outside it (`STORAGE_DIR`, `BACKUP_DIR`).

## 4. Target architecture (modular monolith)

```
ixitek-backend/src/
  core/        config, db (mysql2 pool, tx helper), migrate, errors, logger, requestId, money (decimal), audit, rbac, jobs (MySQL-backed queue), storage (local|S3 adapter), cache (memory|Redis adapter)
  modules/
    auth  users  catalog  pim-import  search  inventory  pricing  intl (countries/currencies/fx)
    cart  checkout  orders  payments  shipping  tax  rfq  quotes  invoices  crm  companies
    procurement  support  returns  notifications  content  analytics  admin  integrations
  migrations/  0001_core.sql, 0002_catalog.sql, ...
```
Each module owns its routes, service and repository; modules talk through services, never each other's tables. Redis, S3/CDN, OpenSearch and payment/shipping providers sit behind adapters so they can be switched on by env without code changes.

## 5. Delivery plan (waves)

The 147 phases in the brief are grouped into waves that each ship something working and deployable.

| Wave | Contents | Brief phases |
|---|---|---|
| **1 Foundation** | MySQL pool + migration runner, schema v1, SQLite→MySQL migration w/ verification, error handler + request IDs, structured logging, RBAC permissions, audit log, soft-delete, env hardening | 1–4, 91–92, 95, 99, 112–114, 134, 146 |
| **2 Catalog + Inventory** | Categories/families/products/variants/attributes/images/documents, Excel/CSV import (validate → preview → confirm → report), data-quality dashboard, catalog + search APIs (server paging/filter/sort), **warehouses, stock in/out/adjust, reservations, movement ledger, low-stock** | 5–11, 14–15, 58, 74–76, 78–79, 142, 145 |
| **3 International pricing** | Countries/currencies/FX (provider + manual + history + fallback), country selector, PricingEngine (decimal), price lists, customer/group/volume pricing, charge rules (fixed/%), price history, admin preview | 19–30, 37 |
| **4 Storefront UX** | FS-style header, mega menu, category tabs, listing w/ filters, PDP w/ variant configurator, compare, wishlist, quick order, BOM upload, lazy routes/images | 12–18, 31–32, 68, 86–88, 124–127 |
| **5 Cart → Order / RFQ → Quote** | Cart (guest+user), checkout w/ server recalculation, immutable order snapshots, `IXT-YYYY-NNNNNN` IDs, idempotency, stock reservation, RFQ + versioned quotes | 33–39, 42–44, 62, 71, 80–82 |
| **6 Money + Messaging** | Payment provider abstraction + webhooks, invoices/proforma PDF, secure document links, notification outbox + EmailService (SMTP/SES/…), templates, email log/resend | 40–41, 45–57, 100–105, 139–140 |
| **7 ERP-lite** | Suppliers, POs, goods receipt → stock, CRM pipeline, companies & company users, returns/RMA, warranty, support tickets, finance & reconciliation, reports/exports | 59–61, 63–67, 70, 72–73, 106–108, 141, 144 |
| **8 Hardening** | Backup verification + DR runbook, monitoring/slow-query log, CI pipeline, E2E + load tests, SEO/sitemap/schema, feature flags, i18n scaffolding | 96–98, 116–123, 128–133, 135–138 |

## 6. Decisions needed from IXITEK

- **D1 – What are the workbook prices?** They read as supplier purchase prices (US FOB / EXW China, confidential cover sheet). Options: (a) treat them as cost and sell at cost + admin-set margin; (b) publish US FOB as the list price; (c) hide prices / RFQ-only until pricing is set.
- **D2 – Supplier confidentiality.** The cover sheet says "Wave2Wave.io Confidential". Nothing from the cover sheet is published; please confirm IXITEK may resell these under the IXITEK name (the descriptions already say "Ixitek fiber cable").
- **D3 – Hostinger MySQL.** Create a MySQL database in hPanel and set `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`.
- **D4 – Visual direction.** Keep IXITEK blue as the brand colour, with FS-style information density and a red active-tab accent only where the brief asks for it.

## 7. Non-goals / guardrails
No invented products, specs, compatibility, certifications, reviews, offices or partners. No FS.com code, text, images or logos. No authoritative money maths in React. No email in the order transaction. No hard delete of financial records.

## 8. Status (updated 21 Sep 2026)

**Decisions taken:** D1 → workbook prices are confidential supplier costs (`supplier_fob_cost_usd`, `supplier_exw_cost_usd`); customers see only the computed/overridden selling price or "Request a Quote". D4 → IXITEK blue design system; red only as a functional accent (active tab underline, errors).

**Wave 1 — Foundation: done.** MySQL layer + migrations, SQLite → MySQL migration (tested with legacy data incl. résumés, idempotent, checksum-verified), cookie sessions + CSRF, RBAC, lockout, audit log, soft delete, structured errors with request IDs, CSP/CORS/trust-proxy fixes, verified backups (corruption detection and restore tested).

**Wave 2 — Catalog, pricing core, inventory: done.** Import of the workbook: 379 rows → 370 products, 9 duplicate listings linked, 44 families, 11 sub-categories, 0 failures; a second import of the same file reports 370 unchanged. Cost-based pricing engine (the user examples $65 EXW + 30% = $84.50 and $100 + 25% = $125.00 are unit-tested). Public API cost-leak test over the catalog. Inventory: 30 parallel decreases against 50 units → exactly 10 succeed, stock ends at 0, ledger balances. Storefront catalog, product page, search, compare; admin import, products, pricing, inventory, data quality, audit.

**Known limitations / next:**
- Image URLs (Vercel Blob) could not be reached from the build sandbox, so they remain "unchecked"; the server re-validates them in production (Data quality → Re-validate images). Browser fallback prevents broken-image icons.
- Currency, country selector, freight/customs/tax charge rules → Wave 3.
- Cart, checkout, orders with immutable price snapshots, RFQ/quotes → Wave 5. Today "Request a Quote" creates an enquiry pre-filled with SKU × quantity.
- Header information architecture (Products / Solutions / Services / Resources / Support) and homepage redesign → Wave 4.
- Verified on both MySQL 8.0 and MariaDB 10.11 (all tests + backup/restore); CI runs both. (MariaDB testing caught and fixed one facet-query incompatibility.)
