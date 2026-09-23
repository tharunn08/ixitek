-- 0006_intl.sql — international commerce: countries, languages, currencies,
-- exchange rates, companies/customer groups (for customer pricing), and the
-- editable charge-rule tables used by the landed-cost engine.
-- All seeded charge values are the INITIAL PLANNING ESTIMATES supplied by
-- IXITEK (Sep 2026). They are not legal/customs determinations and every
-- one is editable in Admin → International Commerce.

CREATE TABLE languages (
  code        VARCHAR(10) NOT NULL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  native_name VARCHAR(60) NOT NULL,
  is_rtl      TINYINT(1) NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE currencies (
  code        CHAR(3) NOT NULL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  symbol      VARCHAR(8) NOT NULL,
  decimals    TINYINT NOT NULL DEFAULT 2,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  razorpay_enabled TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per observed/entered rate (history). rate = units of currency per 1 USD.
CREATE TABLE exchange_rates (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  currency    CHAR(3) NOT NULL,
  rate        DECIMAL(20,10) NOT NULL,
  source      ENUM('provider','manual','override') NOT NULL,
  provider    VARCHAR(60) NULL,
  observed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  note        VARCHAR(255) NULL,
  created_by  BIGINT UNSIGNED NULL,
  KEY idx_fx_cur (currency, observed_at),
  CONSTRAINT fk_fx_cur FOREIGN KEY (currency) REFERENCES currencies(code),
  CONSTRAINT ck_fx_pos CHECK (rate > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipping_zones (
  code        VARCHAR(30) NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE incoterms (
  code        CHAR(3) NOT NULL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  seller_pays_freight   TINYINT(1) NOT NULL,
  seller_pays_insurance TINYINT(1) NOT NULL,
  seller_pays_import    TINYINT(1) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE countries (
  code              CHAR(2) NOT NULL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  native_name       VARCHAR(100) NOT NULL DEFAULT '',
  default_language  VARCHAR(10) NOT NULL DEFAULT 'en',
  default_currency  CHAR(3) NOT NULL DEFAULT 'USD',
  shipping_zone     VARCHAR(30) NULL,
  tax_zone          VARCHAR(30) NULL,
  customs_zone      VARCHAR(30) NULL,
  default_incoterm  CHAR(3) NOT NULL DEFAULT 'DAP',
  unconfigured_charges ENUM('quote','checkout') NOT NULL DEFAULT 'quote',
  requires_tax_id   TINYINT(1) NOT NULL DEFAULT 0,
  tax_id_label      VARCHAR(40) NOT NULL DEFAULT 'Tax / VAT ID',
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  sort_order        INT NOT NULL DEFAULT 100,
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_country_active (is_active, sort_order),
  CONSTRAINT fk_country_lang FOREIGN KEY (default_language) REFERENCES languages(code),
  CONSTRAINT fk_country_cur FOREIGN KEY (default_currency) REFERENCES currencies(code),
  CONSTRAINT fk_country_zone FOREIGN KEY (shipping_zone) REFERENCES shipping_zones(code),
  CONSTRAINT fk_country_inco FOREIGN KEY (default_incoterm) REFERENCES incoterms(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipping_methods (
  code        VARCHAR(20) NOT NULL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  basis       ENUM('weight','volume','manual') NOT NULL,
  carrier     VARCHAR(60) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Freight: rate per chargeable kg (air/express), per CBM (LCL) or flat.
CREATE TABLE shipping_rate_rules (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  origin_country     CHAR(2) NOT NULL,
  dest_country       CHAR(2) NULL,
  dest_zone          VARCHAR(30) NULL,
  method_code        VARCHAR(20) NOT NULL,
  rate_basis         ENUM('per_kg','per_cbm','flat') NOT NULL,
  rate_usd           DECIMAL(14,4) NOT NULL,
  min_charge_usd     DECIMAL(14,4) NOT NULL DEFAULT 0,
  volumetric_divisor INT NOT NULL DEFAULT 5000,
  fuel_surcharge_pct DECIMAL(7,3) NOT NULL DEFAULT 0,
  remote_area_fee_usd DECIMAL(14,4) NOT NULL DEFAULT 0,
  transit_days_min   INT NULL,
  transit_days_max   INT NULL,
  missing_data_policy ENUM('rfq_required','admin_default') NOT NULL DEFAULT 'rfq_required',
  default_freight_usd DECIMAL(14,4) NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  valid_from         DATE NULL,
  valid_to           DATE NULL,
  note               VARCHAR(500) NULL,
  updated_by         BIGINT UNSIGNED NULL,
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_ship_route (origin_country, dest_country, method_code, is_active),
  CONSTRAINT fk_ship_method FOREIGN KEY (method_code) REFERENCES shipping_methods(code),
  CONSTRAINT ck_ship_rate CHECK (rate_usd >= 0 AND min_charge_usd >= 0 AND volumetric_divisor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Duties. Several rules can apply to one line (e.g. base + Section 301 + anti-dumping).
CREATE TABLE customs_rules (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  origin_country  CHAR(2) NULL,
  dest_country    CHAR(2) NOT NULL,
  hs_prefix       VARCHAR(12) NULL,
  attribute_code  VARCHAR(60) NULL,
  attribute_value VARCHAR(255) NULL,
  duty_type       ENUM('base','section_301','chapter_99','anti_dumping','countervailing','safeguard','excise','other') NOT NULL,
  rate_pct        DECIMAL(9,4) NULL,
  rate_status     ENUM('confirmed','planning','requires_verification') NOT NULL DEFAULT 'planning',
  additional_code VARCHAR(40) NULL,
  exporter        VARCHAR(150) NULL,
  customer_message VARCHAR(500) NULL,
  legal_reference VARCHAR(255) NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  valid_from      DATE NULL,
  valid_to        DATE NULL,
  updated_by      BIGINT UNSIGNED NULL,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_customs_dest (dest_country, is_active),
  CONSTRAINT ck_customs_rate CHECK (rate_pct IS NULL OR (rate_pct >= 0 AND rate_pct <= 1000))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tax_rules (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  dest_country CHAR(2) NOT NULL,
  hs_prefix    VARCHAR(12) NULL,
  rate_pct     DECIMAL(9,4) NOT NULL,
  basis        ENUM('customs_value_plus_duty','goods','goods_plus_freight') NOT NULL DEFAULT 'customs_value_plus_duty',
  collected_at ENUM('import','invoice') NOT NULL DEFAULT 'import',
  rate_status  ENUM('confirmed','planning','requires_verification') NOT NULL DEFAULT 'planning',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  valid_from   DATE NULL,
  valid_to     DATE NULL,
  note         VARCHAR(500) NULL,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_tax_dest (dest_country, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE insurance_rules (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dest_country CHAR(2) NULL,
  rate_pct     DECIMAL(9,4) NOT NULL,
  basis        ENUM('goods','goods_plus_freight') NOT NULL DEFAULT 'goods_plus_freight',
  min_usd      DECIMAL(14,4) NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  note         VARCHAR(500) NULL,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE handling_rules (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  dest_country CHAR(2) NULL,
  method_code  VARCHAR(20) NULL,
  charge_type  ENUM('fixed','percent') NOT NULL,
  value        DECIMAL(14,4) NOT NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Other country-specific charges (documentation fees etc.).
CREATE TABLE country_charge_rules (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  dest_country CHAR(2) NOT NULL,
  charge_type  ENUM('fixed','percent') NOT NULL,
  value        DECIMAL(14,4) NOT NULL,
  payable_at   ENUM('invoice','import') NOT NULL DEFAULT 'invoice',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TDS / withholding deducted by the BUYER from its payment (informational + net payable).
CREATE TABLE withholding_rules (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  dest_country   CHAR(2) NOT NULL,
  rate_pct       DECIMAL(9,4) NOT NULL,
  basis          ENUM('goods','invoice_total') NOT NULL DEFAULT 'goods',
  threshold_usd  DECIMAL(14,4) NOT NULL DEFAULT 0,
  applies_to     ENUM('business','all') NOT NULL DEFAULT 'business',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  note           VARCHAR(500) NULL,
  updated_by     BIGINT UNSIGNED NULL,
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Internal payment-gateway cost planning (NOT added to customer prices).
CREATE TABLE payment_fee_rules (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  provider     VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  scope        ENUM('domestic','international') NOT NULL,
  method       VARCHAR(30) NULL,
  fee_pct      DECIMAL(7,4) NOT NULL,
  fee_tax_pct  DECIMAL(7,4) NOT NULL DEFAULT 0,
  fixed_fee_usd DECIMAL(14,4) NOT NULL DEFAULT 0,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Companies & customer groups (extended in 0009). Needed now for customer pricing.
CREATE TABLE customer_groups (
  code        VARCHAR(40) NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  is_business TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO customer_groups (code, name, is_business, sort_order) VALUES
 ('retail','Retail',0,1),('business','Business',1,2),('enterprise','Enterprise',1,3),('distributor','Distributor',1,4),
 ('reseller','Reseller',1,5),('system_integrator','System Integrator',1,6),('partner','Partner',1,7),
 ('government','Government',1,8),('education','Education',1,9),('healthcare','Healthcare',1,10);

CREATE TABLE companies (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_name      VARCHAR(200) NOT NULL,
  display_name    VARCHAR(200) NOT NULL DEFAULT '',
  country_code    CHAR(2) NULL,
  tax_id          VARCHAR(60) NULL,
  registration_no VARCHAR(80) NULL,
  customer_group  VARCHAR(40) NOT NULL DEFAULT 'business',
  status          ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
  payment_terms   ENUM('prepaid','net15','net30','net45','net60') NOT NULL DEFAULT 'prepaid',
  credit_limit_usd DECIMAL(14,2) NOT NULL DEFAULT 0,
  order_approval_threshold_usd DECIMAL(14,2) NULL,
  salesperson_id  BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  KEY idx_company_name (legal_name),
  CONSTRAINT fk_company_group FOREIGN KEY (customer_group) REFERENCES customer_groups(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN customer_group VARCHAR(40) NOT NULL DEFAULT 'retail' AFTER role,
  ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER customer_group,
  ADD COLUMN company_role ENUM('admin','buyer','finance','technical','approver','viewer') NULL AFTER company_id,
  ADD CONSTRAINT fk_users_group FOREIGN KEY (customer_group) REFERENCES customer_groups(code),
  ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- Contract / negotiated prices (highest priority in the pricing chain).
CREATE TABLE customer_prices (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id   BIGINT UNSIGNED NOT NULL,
  company_id   BIGINT UNSIGNED NULL,
  user_id      BIGINT UNSIGNED NULL,
  price_usd    DECIMAL(14,4) NOT NULL,
  min_qty      INT NOT NULL DEFAULT 1,
  valid_from   DATETIME(3) NULL,
  valid_to     DATETIME(3) NULL,
  reference    VARCHAR(100) NULL,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_cp_lookup (product_id, company_id, user_id, is_active),
  CONSTRAINT fk_cp_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT ck_cp CHECK (price_usd >= 0 AND min_qty >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE categories ADD COLUMN default_hs_code VARCHAR(12) NULL AFTER source_key;

-- ── Seed: reference data ────────────────────────────────────────────────
INSERT INTO languages (code, name, native_name, is_rtl, is_active, sort_order) VALUES
 ('en','English','English',0,1,1),('de','German','Deutsch',0,1,2),('fr','French','Français',0,1,3),
 ('es','Spanish','Español',0,1,4),('ja','Japanese','日本語',0,1,5),('ar','Arabic','العربية',1,0,6),('hi','Hindi','हिन्दी',0,0,7);

INSERT INTO currencies (code, name, symbol, decimals, is_active, razorpay_enabled, sort_order) VALUES
 ('USD','US Dollar','$',2,1,0,1),('INR','Indian Rupee','₹',2,1,1,2),('EUR','Euro','€',2,1,0,3),('GBP','British Pound','£',2,1,0,4),
 ('AED','UAE Dirham','AED',2,1,0,5),('CAD','Canadian Dollar','C$',2,1,0,6),('AUD','Australian Dollar','A$',2,1,0,7),
 ('SGD','Singapore Dollar','S$',2,1,0,8),('JPY','Japanese Yen','¥',0,1,0,9);

INSERT INTO shipping_zones (code, name) VALUES ('GLOBAL','Rest of world');

INSERT INTO incoterms (code, name, seller_pays_freight, seller_pays_insurance, seller_pays_import, description, sort_order) VALUES
 ('EXW','Ex Works',0,0,0,'Buyer collects from origin and pays all freight, insurance, duties and taxes.',1),
 ('FCA','Free Carrier',0,0,0,'Seller hands goods to buyer''s carrier; buyer pays main freight and import charges.',2),
 ('FOB','Free On Board',0,0,0,'Sea/inland waterway only. Buyer pays main freight, insurance and import charges.',3),
 ('CFR','Cost and Freight',1,0,0,'Sea only. Seller pays freight to destination port; buyer pays insurance and import charges.',4),
 ('CIF','Cost, Insurance and Freight',1,1,0,'Sea only. Seller pays freight and insurance; buyer pays import charges.',5),
 ('CPT','Carriage Paid To',1,0,0,'Seller pays carriage to destination; buyer pays insurance and import charges.',6),
 ('CIP','Carriage and Insurance Paid To',1,1,0,'Seller pays carriage and insurance; buyer pays import charges.',7),
 ('DAP','Delivered At Place',1,1,0,'Seller delivers to the named place; buyer pays import duties and taxes.',8),
 ('DPU','Delivered at Place Unloaded',1,1,0,'Seller delivers and unloads; buyer pays import duties and taxes.',9),
 ('DDP','Delivered Duty Paid',1,1,1,'Seller delivers and pays import duties and taxes.',10);

INSERT INTO shipping_methods (code, name, basis, sort_order) VALUES
 ('express','Express courier','weight',1),('air','Air freight','weight',2),('lcl','Sea LCL','volume',3),('fcl','Sea FCL','manual',4);

INSERT INTO countries (code, name, native_name, default_language, default_currency, requires_tax_id, tax_id_label, sort_order) VALUES
 ('IN','India','भारत','en','INR',0,'GSTIN',1),
 ('US','United States','United States','en','USD',0,'EIN / Tax ID',2),
 ('GB','United Kingdom','United Kingdom','en','GBP',0,'VAT number / EORI',3),
 ('CA','Canada','Canada','en','CAD',0,'BN / GST number',4),
 ('AU','Australia','Australia','en','AUD',0,'ABN',5),
 ('DE','Germany','Deutschland','de','EUR',0,'USt-IdNr. / EORI',6),
 ('FR','France','France','fr','EUR',0,'Numéro de TVA / EORI',7),
 ('AE','United Arab Emirates','الإمارات','en','AED',0,'TRN',8),
 ('SG','Singapore','Singapore','en','SGD',0,'UEN / GST reg. no.',9),
 ('JP','Japan','日本','ja','JPY',0,'Corporate number',10),
 ('NL','Netherlands','Nederland','en','EUR',0,'VAT number / EORI',20),
 ('IT','Italy','Italia','en','EUR',0,'Partita IVA / EORI',21),
 ('ES','Spain','España','es','EUR',0,'NIF-IVA / EORI',22),
 ('IE','Ireland','Éire','en','EUR',0,'VAT number / EORI',23),
 ('BE','Belgium','België','en','EUR',0,'VAT number / EORI',24),
 ('AT','Austria','Österreich','de','EUR',0,'UID / EORI',25),
 ('CH','Switzerland','Schweiz','de','USD',0,'UID / VAT number',26),
 ('SE','Sweden','Sverige','en','USD',0,'VAT number / EORI',27),
 ('SA','Saudi Arabia','السعودية','en','USD',0,'VAT number',30),
 ('QA','Qatar','قطر','en','USD',0,'Tax ID',31),
 ('OM','Oman','عُمان','en','USD',0,'VAT number',32),
 ('KW','Kuwait','الكويت','en','USD',0,'Tax ID',33),
 ('BH','Bahrain','البحرين','en','USD',0,'VAT number',34),
 ('MY','Malaysia','Malaysia','en','USD',0,'SST number',40),
 ('TH','Thailand','ประเทศไทย','en','USD',0,'Tax ID',41),
 ('VN','Vietnam','Việt Nam','en','USD',0,'Tax code',42),
 ('ID','Indonesia','Indonesia','en','USD',0,'NPWP',43),
 ('PH','Philippines','Pilipinas','en','USD',0,'TIN',44),
 ('HK','Hong Kong','香港','en','USD',0,'BR number',45),
 ('KR','South Korea','대한민국','en','USD',0,'Business reg. no.',46),
 ('NZ','New Zealand','New Zealand','en','USD',0,'GST number',47),
 ('LK','Sri Lanka','ශ්‍රී ලංකාව','en','USD',0,'TIN',50),
 ('BD','Bangladesh','বাংলাদেশ','en','USD',0,'BIN',51),
 ('NP','Nepal','नेपाल','en','USD',0,'PAN',52),
 ('ZA','South Africa','South Africa','en','USD',0,'VAT number',60),
 ('KE','Kenya','Kenya','en','USD',0,'KRA PIN',61),
 ('NG','Nigeria','Nigeria','en','USD',0,'TIN',62),
 ('EG','Egypt','مصر','en','USD',0,'Tax ID',63),
 ('BR','Brazil','Brasil','en','USD',0,'CNPJ',70),
 ('MX','Mexico','México','es','USD',0,'RFC',71);

-- Planning HS code for fibre-optic cable assemblies (supplied by IXITEK; verify per product).
UPDATE categories SET default_hs_code = '85447090' WHERE source_key IN
 ('sheet:LC','sheet:MPO12','sheet:MPO-4LC Breakout','sheet:MPO16 QSFP DD','sheet:MPO16 Breakout','sheet:MPO24','sheet:MPO-10LC Breakout','sheet:SN','sheet:CS');

-- ── Seed: IXITEK initial route estimates (origin China) ─────────────────
INSERT INTO shipping_rate_rules (origin_country, dest_country, method_code, rate_basis, rate_usd, volumetric_divisor, note) VALUES
 ('CN','IN','air','per_kg',5.00,6000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','IN','express','per_kg',7.99,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','IN','lcl','per_cbm',10.00,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','US','air','per_kg',6.91,6000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','US','express','per_kg',15.98,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','US','lcl','per_cbm',137.22,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','GB','air','per_kg',4.50,6000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','GB','express','per_kg',8.09,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','GB','lcl','per_cbm',55.00,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','AE','air','per_kg',4.00,6000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','AE','express','per_kg',6.38,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','AE','lcl','per_cbm',71.25,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','SG','air','per_kg',1.90,6000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','SG','express','per_kg',2.85,5000,'Initial estimate (IXITEK, Sep 2026)'),
 ('CN','SG','lcl','per_cbm',15.00,5000,'Initial estimate (IXITEK, Sep 2026)');

INSERT INTO customs_rules (name, origin_country, dest_country, hs_prefix, duty_type, rate_pct, rate_status, customer_message, legal_reference) VALUES
 ('India BCD — optical fibre cable','CN','IN','85447090','base',0,'planning',NULL,'Planning value; verify final HS classification and current rate on ICEGATE.'),
 ('US general duty — HTS 8544.70','CN','US','854470','base',0,'planning',NULL,'HTSUS 8544.70; verify current rate.'),
 ('US Section 301 (China) — planning','CN','US','854470','section_301',25,'planning',NULL,'Chapter 99 / Section 301 planning rate; verify list, exclusions and effective dates.'),
 ('UK trade remedy — Chinese single-mode optical fibre cable','CN','GB','854470','anti_dumping',NULL,'requires_verification','Import charges subject to customs/trade-remedy verification.','UK trade-remedy measures apply to certain Chinese single-mode optical fibre cables; rate depends on exporter and additional code.'),
 ('UAE customs duty','CN','AE',NULL,'base',5,'planning',NULL,'Planning value.');
UPDATE customs_rules SET attribute_code = 'fiber_mode', attribute_value = 'Singlemode' WHERE dest_country = 'GB' AND duty_type = 'anti_dumping';

INSERT INTO tax_rules (name, dest_country, hs_prefix, rate_pct, basis, collected_at, note) VALUES
 ('India IGST','IN','85447090',18,'customs_value_plus_duty','import','Planning value; verify with current Indian Customs tariff.'),
 ('UK import VAT','GB',NULL,20,'customs_value_plus_duty','import','Planning default.'),
 ('UAE VAT','AE',NULL,5,'customs_value_plus_duty','import','Planning value.'),
 ('Singapore GST','SG',NULL,9,'customs_value_plus_duty','import','Planning default.');

INSERT INTO payment_fee_rules (name, provider, scope, fee_pct, fee_tax_pct) VALUES
 ('Razorpay domestic (planning)','razorpay','domestic',2,18),
 ('Razorpay international cards (planning)','razorpay','international',3,18);

INSERT INTO settings (setting_key, value_json) VALUES
 ('commerce.default_origin_country', '"CN"'),
 ('commerce.default_goods_origin', '"CN"'),
 ('commerce.default_country', '"IN"'),
 ('commerce.customs_disclaimer', '"Import duties, taxes and customs charges are estimates based on configured rules and may vary according to the destination country''s customs assessment, product classification, origin, value, shipping method and applicable regulations. Final charges may differ."');

INSERT INTO permissions (code, module, description, is_sensitive) VALUES
 ('intl.read','intl','View countries, currencies and charge rules',0),
 ('intl.manage','intl','Change countries, currencies, exchange rates and charge rules',1);
INSERT INTO role_permissions (role_code, permission_code) VALUES
 ('owner','intl.read'),('owner','intl.manage'),('super_admin','intl.read'),('super_admin','intl.manage'),
 ('pricing_manager','intl.read'),('pricing_manager','intl.manage'),('finance_manager','intl.read'),
 ('order_manager','intl.read'),('sales_manager','intl.read');
