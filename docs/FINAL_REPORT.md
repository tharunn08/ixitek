# IXITEK — Final implementation report (Waves 1–8)

Status as of 22 Sep 2026. The existing IXITEK project was **extended, not replaced**: every original page (Home, Company, Partners, Products & families, Contact, Career, SAP micro-site, login/sign-up, enquiry dashboard, team management) is preserved.

---

## 1. Architecture

```
Browser ──HTTPS──▶ Hostinger Node.js Web App (one process, one origin)
                   ├─ Express: helmet CSP · compression · CORS(/api) · request IDs · rate limits
                   ├─ /api/*            modular monolith (modules below)
                   ├─ /api/webhooks/*   raw-body HMAC-verified webhooks (before JSON parser)
                   ├─ /robots.txt, /sitemap.xml
                   └─ SPA shell with server-rendered <head> (title, canonical, OG, Twitter, JSON-LD)
                        │
       ┌────────────────┼──────────────────────────────────────────────┐
       ▼                ▼                                              ▼
   MySQL 8 / MariaDB   Job worker (same process; MySQL queue,          STORAGE_DIR (outside app)
   (DECIMAL money,     SKIP LOCKED, retries/backoff, transactional     uploads · RFQ files · image cache
   FKs, migrations)    outbox) → emails · invoices · FX · reconcile    BACKUP_DIR (outside app)
                        · quote expiry · restore tests                  verified backups
```

**Backend modules** (`ixitek-backend/src/modules/`): `catalog`, `import`, `pricing`, `inventory`, `intl` (countries/FX/landed cost), `commerce` (cart, orders, RFQ, quotes), `payments` (Razorpay, manual payments, refunds, webhooks), `documents` (invoices, credit notes, quote PDFs), `email` (outbox + providers + templates), `notifications` (event handlers), `operations` (shipping, CRM, companies, procurement, returns, tickets, portal), `monitoring`, `media` (image optimisation), `seo`. **Core** (`src/core/`): config, db (pool, tx with deadlock retry, slow-query log), migrate (checksummed, locked, pre-migration backup), money (decimal.js), rbac, audit, jobs, events (outbox), scheduler, settings, storage, monitor, errors.

**Frontend** (`ixitek-frontend/src/`): React 19 + Vite 8 + Tailwind 4; route-level code splitting (main bundle 304 KB / 92 KB gzip); `LocaleContext` (ship-to country/language/currency), `CartContext`, storefront pages in `pages/shop`, admin console in `pages/admin` (+ `pages/admin/ops`).

**Money rules:** all amounts are `DECIMAL` in MySQL and `decimal.js` in Node; the browser only formats server strings. USD is the base; every conversion is USD→target with one stored rate (never chained); orders store currency, rate and a full estimate snapshot.

## 2. Completed waves

| Wave | Scope delivered |
|---|---|
| 1 | MySQL foundation, migrations, SQLite → MySQL migration tool, RBAC (12 roles), httpOnly cookie + CSRF, audit log, CSP, backups |
| 2 | Catalog/PIM, Excel import with preview, confidential cost pricing (cost + margin rules, overrides, history), inventory (warehouses, ledger, row locks) |
| 3 | International commerce: 40 countries, languages, currencies, FX (provider + manual + override, history, last-valid fallback), shipping zones/methods, freight by chargeable weight/CBM, customs, import tax, insurance, handling, country charges, TDS, Incoterms, payment-fee rules; seeded China→IN/US/GB/AE/SG routes exactly as specified; admin **International commerce** (all tabs + price preview) |
| 4 | FS-style storefront IA in IXITEK blue: utility bar (ship-to, quick order, track order, support, account), main nav (Products mega menu, Solutions, Services, Resources, Support, Company), search, RFQ, cart; PDP with Add to cart / Buy now / RFQ / wishlist / compare / delivered-cost estimate; hub pages; optimised images (WebP/AVIF, srcset, lazy, fixed ratio, fallback) |
| 5 | Persistent guest/user cart (merge on sign-in, save for later, recalculation on country change), quick order, BOM upload (.xlsx/.csv), checkout (server recalculation, expected-total check, idempotency), orders `IXT-YYYY-NNNNNN` with immutable snapshots and stock reservations, RFQs `RFQ-YYYY-NNNNNN`, quotes `QT-YYYY-NNNNNN-V1..n` (versioning, expiry, accept → order at quoted prices incl. custom lines, reject, PDF) |
| 6 | Razorpay (Orders API, Checkout, signature + API verification, webhooks with HMAC, capture of authorised payments, refunds full/partial, reconciliation job, idempotency), bank transfer & PO terms, invoices `INV-…`, proformas `PF-…`, credit notes `CN-…` (PDF), server email outbox (SMTP/SES/Resend/SendGrid), templates for order/payment/invoice/shipping/delivery/refund/RFQ/quote/expiry/support |
| 7 | Shipments & tracking (carrier adapter interface), CRM (leads from enquiries/RFQs, pipeline, activities, customer 360), company accounts (roles, invitations, approval threshold, credit limit), procurement (suppliers, supplier SKUs/costs, POs, goods receipts → stock, supplier invoices, reorder suggestions), returns/RMA/warranty, support tickets, customer portal |
| 8 | SEO (server-rendered metadata, sitemap, robots, Organization/Product/Breadcrumb JSON-LD), compression, caching, image optimisation, monitoring console, tiered backups + pre-migration backups + automated restore tests, production config guards, load-test script, E2E browser flow, deployment guide |

## 3. Known limitations (honest list)

1. **Razorpay was not exercised against Razorpay's servers** — the sandbox has no route to api.razorpay.com. All flows (success, failure, closed window, delayed callback, duplicate webhook, invalid signature, capture of authorised payments, partial + full refund, reconciliation) are tested against a local stub of the documented REST API. **Run §7 of DEPLOYMENT.md on staging with test keys before going live.**
2. **FX provider unreachable from the sandbox** (HTTP 403); FX refresh is tested with an injected fetch. On first start, rates may be empty until the provider responds — enter manual rates in Admin → International → Exchange rates if needed. No rates are seeded.
3. **Email** delivery tested with a local SMTP server; real provider credentials, SPF/DKIM must be configured by IXITEK.
4. **Freight needs weights/dimensions.** Most imported products have no weight/dimensions, so their freight is *quoted separately* (missing-data policy = `rfq_required`) until weights are entered or the policy is switched to an admin default freight.
5. **Tax compliance scope:** Indian GST is split into CGST + SGST/UTGST (same state as the seller) or IGST (other states), with place of supply = delivery state, GSTIN validation, HSN summary, amount in words, proportional GST credit notes and a GST register (JSON/CSV) — see §3a. **Not implemented:** e-invoicing (IRN/QR via the IRP), e-way bills, zero-rated exports/SEZ supplies under LUT, reverse charge, cess, and the bill-to/ship-to third-party rule (s.10(1)(b)). Have IXITEK's accountant confirm the invoice format and the GST rules before issuing tax invoices.
6. **UK single-mode fibre trade remedy** is flagged *requires verification* (no rate invented) → such UK orders go to quotation.
7. **Carrier integrations:** tracking is manual (staff enter tracking number/events; tracking-URL templates per carrier). Live carrier APIs plug into the adapter interface.
8. **Translations:** header/catalog chrome in EN/DE/FR/ES/JA; new commerce/portal/admin pages are English; product data is English.
9. **Transceivers:** category architecture only — no transceiver products exist in the workbook, none were invented.
10. **Admin screens** were exercised by the E2E run (every page loads without errors) and every backend action is covered by API tests, but not every admin button was clicked in a browser.
11. Admin and customer lists are paginated (50 per page admin, 25 per page in the customer portal). A few small, bounded lists are still capped (suppliers dropdown, CRM activities per record 200, reorder suggestions 500, admin audit history per rule 100).
12. Frontend enquiry forms still contain the optional legacy EmailJS path (disabled unless configured); the server now also emails the sales inbox for every enquiry.
13. Load test ran on the sandbox, not on Hostinger hardware (numbers in §13 are indicative).

## 3a. Update — GST split, pagination, listing cart buttons (after the Waves 3–8 delivery)

- **GST (migration 0013):** `modules/intl/gst.js` (36 GST state codes incl. UTGST territories, ISO/name aliases, GSTIN format + check-character validation, Decimal split with half-rate rounding so the tax total never changes with the delivery state, lump-sum split for quotations, Indian-numbering amount in words). Stored per order (`place_of_supply`, `gst_supply_type`, `cgst`, `sgst`, `igst`, taxable value), per line and per invoice/credit note. Checkout and saved addresses use a state list for India; admin seller state is a list and must match the GSTIN. `GET /api/admin/finance/gst-report` (+ `?format=csv`) and **Admin → Finance → GST register**.
- **Safeguards:** online checkout with GST for India is blocked until the seller GST state is set, and only in INR; Indian quotations with GST can't be sent until the seller state is set and must be in INR; GST tax invoices/credit notes need a valid seller GSTIN from that state. Orders placed before this update keep their original documents.
- **Pagination:** `core/paging.js` (`?page=&limit=`, clamped integers, `{ total, page, limit }`) on admin companies, purchase orders, supplier invoices, returns (+ search), tickets (+ search), shipping queue (both lists), dead jobs, and customer orders, quotes, RFQs, invoices, payments, returns, tickets.
- **Add to cart / Buy now** on catalog cards (grid and list), the compare page and the wishlist, in addition to the product page. They add the minimum order quantity; priced items only (others keep *Request a Quote*).
- Header fix: the search box now shrinks so the cart icon is never pushed off-screen at 1280–1440 px.

## 4. Database schema summary (92 tables, 13 migrations)

| Migration | Tables |
|---|---|
| 0001 core | roles, permissions, role_permissions, users, enquiries, audit_logs, settings, feature_flags, jobs, files, legacy_migration_log |
| 0003 catalog | categories, product_families, products, product_family_links, attributes, product_attribute_values, product_specifications, product_images, product_documents, product_relations, **product_costs** (confidential), pricing_rules, product_selling_prices, price_history |
| 0004 inventory | warehouses, inventory_levels, stock_movements |
| 0005 imports | import_batches, import_rows |
| 0006 intl | languages, currencies, exchange_rates, shipping_zones, incoterms, countries, shipping_methods, shipping_rate_rules, customs_rules, tax_rules, insurance_rules, handling_rules, country_charge_rules, withholding_rules, payment_fee_rules, customer_groups, companies, customer_prices |
| 0007 | system_events |
| 0008 commerce | sequences, wishlists, product_stats, carts, cart_items, addresses, orders, order_items, order_addresses, order_status_history, stock_reservations, rfqs, rfq_items, rfq_attachments, rfq_messages, quotes, quote_versions, quote_items |
| 0009 payments | payment_intents, payments, payment_events, refunds, invoices, email_messages |
| 0010 operations | carriers, shipments, shipment_items, shipment_events, crm_leads, crm_activities, company_invitations, suppliers, supplier_products, purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items, supplier_invoices, rmas, rma_items, rma_events, tickets, ticket_messages |
| 0002/0011/0012 | RBAC seed; ops settings; internal order notes + seller bank-details setting |

Key integrity rules: unique business numbers per year (`sequences` row-locked), unique idempotency keys (orders, refunds, goods receipts, email, jobs, webhook events), unique `(provider, provider_payment_id)`, CHECK constraints on money/quantities, FK `RESTRICT` on financial records, soft deletes on master data.

## 5. API summary (225 routes)

| Prefix | Purpose |
|---|---|
| `/api/auth` | register, login, logout, me |
| `/api/catalog` | menu, categories, products (filters: category, family, q, attr.*, inStock, priced, minPrice/maxPrice in display currency, sort relevance/popular/newest/price/sku/name), product detail, view counter, families, suggest |
| `/api/img/:id` | optimised product images (catalog images only) |
| `/api/intl` | locales, detect, preferences, estimate |
| `/api/shop` | cart CRUD, project name, quick-order validate, BOM upload, wishlist, checkout options/place, orders (list/detail/approve/reorder), RFQ create/list/detail/messages, quotes list/detail/accept/reject |
| `/api/pay` | config, Razorpay start/verify, proforma PDF, invoice PDF, quote PDF |
| `/api/webhooks/razorpay` | signed webhooks |
| `/api/account` | dashboard, profile, password, addresses, invoices, payments, returns, tickets; `/company` apply, members, roles, invitations, join |
| `/api/support` | tickets (guest token access), messages, meta |
| `/api/admin/…` | catalog (21), procurement (16), commerce orders/RFQs/quotes (16), finance (15: status, payments, manual payments, refunds, invoices, void, reconcile, email log/resend, business settings), intl (13), inventory (12), pricing (10), crm (9), shipping (6), monitoring (6), returns, tickets, companies, users/staff/roles/backups/audit |
| `/robots.txt`, `/sitemap.xml` | SEO |

## 6. Admin modules (`/admin/…`)

Orders (list, detail: status, internal/visible notes, payments, record bank transfer, refunds, invoices, shipments) · RFQs (assign, status, messages, create quote) · Quotations (editor with live server price preview, versions, send, revise, PDF) · CRM (pipeline, leads, activities) · Companies (approve, terms, credit, group, salesperson) · Shipping (queue, carriers) · Returns · Support tickets · Procurement (suppliers, supplier products, POs, receiving, supplier invoices, reorder) · Finance (gateway status, payments ledger with fees, invoices, email log + resend, business settings) · Catalog (products, import, data quality) · Pricing & margins · International commerce (countries, currencies, FX, shipping, freight, customs, taxes, TDS, Incoterms, payment fees, price preview) · Inventory · Monitoring · Audit log · Enquiries, users, team. Navigation entries appear only for permitted roles; the server enforces the same permissions.

## 7. Customer modules

Header ship-to selector (country / language / currency, detection suggestion), catalog + PDP (delivered-cost estimate by country/method/Incoterm), cart (save for later, project name), quick order & BOM upload, guest or signed-in checkout, order page (pay online, bank transfer + proforma, tracking, invoices, reorder, returns), RFQ (with attachments) and RFQ conversation, quotation view/accept/decline/PDF, support tickets, track order, **My account**: overview, orders, quotes & RFQs, invoices & payments, returns, wishlist, addresses (personal or company-shared), company (apply, members, roles, invitations, credit), profile & password.

## 8. Payment integration

- Flow: order created (`pending_payment`) → server creates Razorpay Order for the balance due (reused on refresh) → Checkout → handler posts ids + signature → **HMAC verified** and the payment **fetched from Razorpay** (amount, currency, order id checked) → idempotent insert (unique payment id) → order `paid` + `confirmed` → events: tax invoice, emails. Orders are never marked paid from the browser alone.
- Webhooks: HMAC over the raw body; each event stored once (`payment_events`); failed processing returns 500 so Razorpay retries; duplicates are ignored.
- Reconciliation job every 15 minutes settles payments whose callback never arrived (closed browser, network loss).
- Authorised payments are captured server-side; failures move the order to `payment_failed` and the customer can retry.
- Refunds: full or partial, idempotency key, never above refundable amount, audited; credit note issued automatically when a tax invoice exists.
- Stored: Razorpay order id, payment id, signature, status, amount, currency, method, international flag, timestamps; `payment_gateway_fee`, `payment_gateway_tax`, `merchant_payment_cost` (actual from Razorpay or planning rule) — **never added to the customer total, never shown to customers**. No card/CVV data is ever received.
- Other methods: bank transfer (staff record receipts with UTR reference; overpayment and duplicate references refused) and purchase-order credit terms for approved companies with a credit limit (exposure enforced at checkout, invoiced on dispatch).

## 9. Shipping & charge rules

Configured in Admin → International (all changes need a reason and are audited, with history):
- **Seeded routes (origin CN):** IN air $5/kg, express $7.99/kg, LCL $10/CBM, HS 85447090, BCD 0 %, IGST 18 % · US air $6.91, express $15.98, LCL $137.22/CBM, HTS 8544.70 base 0 % + Section 301 25 % (planning) · GB air $4.50, express $8.09, LCL $55, VAT 20 %, single-mode trade remedy = *requires verification* + customer message · AE air $4, express $6.38, LCL $71.25, customs 5 %, VAT 5 % · SG air $1.90, express $2.85, LCL $15, GST 9 %.
- Chargeable weight = max(actual, volumetric) with per-method divisor (air 6000, express/LCL 5000); LCL by CBM; missing weight → quote (or admin default freight if chosen); fuel/remote/handling/insurance/country charges via rules.
- Incoterm split: amounts payable to IXITEK vs payable at import vs buyer-arranged; DDP includes estimated duties/taxes.
- Countries without rules: "Import charges calculated at checkout/quote" or RFQ per country setting — never 0 %.
- Every estimate carries the configured disclaimer text.
- Shipments: create (partial allowed), packed → shipped (tracking required, stock consumed from reservations) → in transit → out for delivery → delivered; the order status follows automatically; emails on dispatch and delivery.

## 10. Email system

Server-side outbox (`email_messages`) with unique idempotency keys → job `email.send` (6 attempts, exponential backoff) → provider (SMTP incl. SES/Hostinger/Zoho/Gmail, Resend, SendGrid, `log` for development). PDF attachments (invoices, quotes) are rendered at send time from immutable snapshots. Failures are recorded, raise monitoring events and never roll back the business action; staff can view (sandboxed preview) and resend. Templates: order received (+ internal), payment received/failed, invoice/credit note, shipped, delivered, cancelled, refund, RFQ received (+ internal), information requested, RFQ declined, quotation sent (+PDF), expiring, expired, quote declined (internal), enquiry (internal), company invitations/approval, returns, support tickets.

## 11. Backup strategy

- Logical backups without `mysqldump` (works on shared hosting): consistent snapshot, gzip, manifest (row counts, SHA-256), full re-read verification (checksum, end marker, per-table counts). JSON columns are re-serialised correctly on MySQL and MariaDB (a bug caught by the restore test and fixed).
- **Tiers:** daily (keep 7), weekly on Sundays (5), monthly on the 1st (12), interval every 6 h (8), other/manual/pre-migration (10). The newest verified backup is never pruned.
- **Pre-migration backup** before any schema change on an existing database.
- **Restore:** `npm run restore -- <file> --into <db> --yes` (refuses the live DB by default). **Automated restore test** weekly into `BACKUP_RESTORE_TEST_DB`, compares every table's row count, then cleans up; result shown in Admin → Monitoring; also run in the test suite on both databases.
- Backups live in `BACKUP_DIR` **outside the deployment folder** (warning if not). Download copies off-site regularly.

## 12. Security

httpOnly `SameSite` session cookie + double-submit CSRF; bcrypt passwords; account lockout; RBAC with 12 roles and 39 permissions (owner bypass); every sensitive change audited (who, what, before/after, reason, IP, request id); helmet CSP (Razorpay/D&B allow-listed), HSTS (helmet); CORS limited to `/api` and listed origins; per-route rate limits (auth, search, RFQ, payments, support); parameterised SQL everywhere (dynamic columns only from allow-lists); access to orders/RFQs/quotes/tickets by owner, company member, staff permission or a 256-bit token compared in constant time; Razorpay signature + webhook HMAC; upload type/size checks; image service restricted to catalog images (no open proxy); email previews sandboxed; JSON-LD escaped; production refuses weak secrets/misconfiguration. **Supplier costs** (`product_costs`, supplier SKU costs, PO/supplier-invoice amounts) are removed from every response unless the user has `pricing.read_cost`, and are absent from public APIs, pages, carts, orders, invoices, quotes and emails (asserted by tests and by the E2E page scan).

## 13. Performance

Code-split routes; gzip; immutable caching of hashed assets; short public caching of catalog APIs; server-side paging/filtering/sorting with indexes; view counter for "popular" sort; image resizing to WebP/AVIF with srcset + disk cache + lazy loading + fixed aspect ratio; slow-query logging (500 ms) into monitoring; connection pooling; background jobs for heavy work. Load test (sandbox, 1 Node process, 20 connections): catalog/search/suggest p50 3 ms, p99 ≤ 13 ms (per-IP rate limiter returned 429 after 120 req/min, as designed); `/api/intl/locales` ~1,100 req/s, p99 34 ms; server-rendered product page ~330 req/s, p99 97 ms.

## 14. Test results

| Suite | MySQL 8 | MariaDB 10.11 |
|---|---|---|
| Backend `npm test` — 54 tests in 10 files (GST split/GSTIN/invoices/credit notes/register/quotes, pagination, unit, API, import, pricing & cost-leak, concurrency, international routes & FX, admin rule editing & audit, cart/quick order/BOM/checkout/idempotency/snapshots/reservations, RFQ→quote→versions→accept/expiry/custom lines, Razorpay success/fail/invalid signature/duplicate webhook/closed browser/delayed callback/partial+full refund/permissions, bank transfer + invoices + PDFs + seller-snapshot immutability, SMTP email + failure + resend, shipping/returns/procurement/CRM/companies/credit limit/tickets/portal, image optimisation, backup + tamper detection + restore) | **54 / 54 pass** | **54 / 54 pass** |
| Frontend `oxlint` | 0 errors (warnings only: fast-refresh export style) | — |
| Frontend `vite build` | success | — |
| E2E browser (Chromium, Playwright): home IA, catalog, PDP, add to cart, cart estimate, supplier-cost scan, guest checkout, order page, quick order → RFQ, support ticket, hub pages, 16 admin pages, listing Add to cart/Buy now, Indian state list, GST register and seller GST state, ticket search, mobile overflow | **46 / 46 pass, 0 JS errors** | — |
| Restore test of dev database (93 tables) | pass | pass (in test suite) |

## 15. Production deployment

See **`docs/DEPLOYMENT.md`** — one Hostinger Node.js app (`npm run build` / `npm start`), MySQL database + restore-test database, persistent storage/backup folders outside the app, environment variables, Razorpay and email setup, first start, go-live checklist, operations and rollback.

## 16. Environment variables

Full, commented list in `ixitek-backend/.env.example` and the tables in DEPLOYMENT.md §3. Required in production: `NODE_ENV`, `PUBLIC_SITE_URL`, `DB_HOST/PORT/USER/PASSWORD/NAME`, `JWT_SECRET`, `OWNER_*`, `CORS_ORIGIN`, `STORAGE_DIR`, `BACKUP_DIR`, `EMAIL_PROVIDER` (+ `EMAIL_FROM` and provider credentials). Recommended: `BACKUP_RESTORE_TEST_DB`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, `SALES_INBOX`.

## 17. Exact Hostinger steps

1. hPanel → Databases → create production DB + user, and an empty restore-test DB (same user, all privileges).
2. File Manager → create `/home/<user>/ixitek-data/storage` and `/home/<user>/ixitek-data/backups`.
3. Websites → Node.js → Create application → connect GitHub repo, branch `main`, root `/`, Node 20/22, build `npm run build`, start `npm start`, entry `ixitek-backend/src/server.js`.
4. Environment variables per DEPLOYMENT.md §3 (set `VITE_*` before building).
5. Attach `ixitek.com` + `www`, enable SSL.
6. Deploy → check `/api/health`.
7. (Old site) `npm run migrate:legacy` with `LEGACY_SQLITE_PATH`.
8. Razorpay Dashboard → keys + webhook `https://ixitek.com/api/webhooks/razorpay` (events listed in DEPLOYMENT.md §4).
9. Email provider + DNS (SPF/DKIM/DMARC).
10. Owner sign-in → manual configuration (§19) → Monitoring → *Back up now* + *Run restore test*.
11. Run the go-live checklist on staging with test keys, then switch production to live keys.

## 18. Files changed (since the Wave 1–2 delivery)

**Modified:** `.github/workflows/ci.yml`, `README.md`, `ixitek-backend/{.env.example, package.json, package-lock.json}`, backend `src/{app.js, server.js}`, `src/core/{config, db, errors, migrate}.js`, `src/models/User.js`, `src/modules/catalog/{adminRoutes, catalogRepo, publicRoutes}.js`, `src/modules/import/{imageCheck, importService}.js`, `src/modules/pricing/pricingService.js`, `src/routes/enquiries.js`, `src/utils/backup.js`, `test/helpers.js`; frontend `src/App.jsx`, `src/components/admin/AdminShell.jsx`, `src/components/catalog/ProductImage.jsx`, `src/components/layout/{Header, MobileNav}.jsx`, `src/lib/{catalogApi.js, icons.jsx}`, `src/pages/admin/AdminDashboard.jsx`, `src/pages/shop/{ComparePage, ProductPage}.jsx`.

**Added — backend:** `src/core/{events, monitor, scheduler, settings}.js`; migrations `0006`–`0012`; modules `intl/*` (fxService, landedCost, ruleRegistry, adminRoutes, publicRoutes, convertPrices), `commerce/*` (sequences, cartService, orderService, rfqQuoteService, publicRoutes, adminRoutes), `payments/*` (razorpay, paymentService, routes), `documents/*` (pdf, invoiceService), `email/*` (emailService, templates), `notifications/handlers.js`, `operations/*` (shipmentService, supportService, crm, companies, procurement, staff, routes), `monitoring/routes.js`, `media/imageRoutes.js`, `seo/seo.js`; `src/utils/restore.js`; `scripts/loadtest.js`; tests `intl`, `commerce`, `payments`, `operations`, `media`, `backup`.
**Added — frontend:** `src/context/{LocaleContext, CartContext}.jsx`, `src/i18n/strings.js`, `src/components/intl/{LocaleSelector, EstimateBox}.jsx`, `src/components/shop/ui.jsx`, `src/pages/shop/{CartPage, CheckoutPage, QuickOrderPage, OrderPage, RfqPage, QuotePage, SupportPages, HubPages, AccountPages}.jsx`, `src/pages/admin/{International, Monitoring}.jsx`, `src/pages/admin/ops/{common, Orders, OrderDetail, Rfqs, RfqDetail, Quotes, QuoteEditor, Finance, Shipping, Returns, Tickets, Crm, Companies, Procurement}.jsx`.
**Added — docs:** `docs/DEPLOYMENT.md`, `docs/FINAL_REPORT.md`.

## 19. Manual configuration required by IXITEK (nothing here was invented)

1. **Admin → Finance → Business settings:** registered legal name and address (tax invoices and proformas are refused until set), GSTIN and **GST registration state** (needed for the CGST/SGST vs IGST split), bank details for transfers (printed on proformas), accounts email/phone, invoice footer, sales and support inboxes, bank-transfer instructions, terms-of-sale URL, return instructions, quote validity days. The legal entity/address shown in the current site footer ("Ixitek Solutions LLP", Bangalore) should be confirmed by IXITEK before entering.
2. **Admin → Pricing:** margin rules (global/category/family/product, customer groups) — until then products show *Request a Quote*.
3. **Admin → International:** confirm/adjust seeded freight, customs, tax and Section 301 planning rates with your forwarder/broker; add rules for other countries; decide missing-weight policy; enable currencies for Razorpay; check payment-fee rules; set manual FX rates if the provider is not used.
4. **Admin → Catalog:** product weights and dimensions (needed for automatic freight), HS codes for non-fibre items, warranty months, lead times, images/datasheets.
5. **Admin → Inventory:** real warehouses and opening stock; reorder points.
6. **Admin → Shipping → Carriers:** tracking-URL templates for carriers you use.
7. **Admin → Procurement:** suppliers, supplier SKUs and costs.
8. **Team access:** assign staff roles (only Owner, Super Admin, Pricing Manager and Finance Manager can see costs).
9. Razorpay account (KYC, live keys, webhook), email provider and DNS, hosting environment variables and persistent folders.
10. **GST for domestic sales:** the seeded India rule is *IGST collected at import* (buyer imports). If IXITEK sells from Indian stock and invoices GST itself, add a tax rule for IN with **collected at = invoice**, the correct rate per HSN prefix and basis *goods + freight*, and switch off the import rule for those products. Accountant review of invoice format / GST treatment before issuing tax invoices.

## 20. Development test credentials

None are shipped. The ZIP contains **no database, no `.env`, no supplier workbook and no test data**. In this development sandbox the owner account (`admin@ixitek.in`) and the manual INR test rate (83.50, marked *DEVELOPMENT TEST RATE ONLY*) exist only in the local dev database; production creates its owner from `OWNER_EMAIL` / `OWNER_PASSWORD` on first start. Automated tests create throw-away users in the separate `ixitek_test` database.
