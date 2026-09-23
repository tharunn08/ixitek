-- 0008_commerce.sql — wishlist, carts, addresses, orders (immutable price
-- snapshots), reservations, RFQs and versioned quotes.
-- Money columns are DECIMAL; order/quote rows store the currency and the
-- exchange rate used so historical documents never change.

CREATE TABLE sequences (
  name        VARCHAR(20) NOT NULL,
  year        SMALLINT NOT NULL,
  next_value  INT NOT NULL DEFAULT 1,
  PRIMARY KEY (name, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wishlists (
  user_id     BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT fk_wl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wl_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_stats (
  product_id  BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  views       INT NOT NULL DEFAULT 0,
  orders      INT NOT NULL DEFAULT 0,
  units_sold  INT NOT NULL DEFAULT 0,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_ps_popular (orders, views),
  CONSTRAINT fk_ps_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE carts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token_hash  CHAR(64) NULL,
  user_id     BIGINT UNSIGNED NULL,
  country     CHAR(2) NULL,
  currency    CHAR(3) NULL,
  shipping_method VARCHAR(20) NULL,
  incoterm    CHAR(3) NULL,
  status      ENUM('active','converted','merged','abandoned') NOT NULL DEFAULT 'active',
  project_name VARCHAR(150) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cart_token (token_hash),
  KEY idx_cart_user (user_id, status),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cart_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cart_id      BIGINT UNSIGNED NOT NULL,
  product_id   BIGINT UNSIGNED NOT NULL,
  qty          INT NOT NULL,
  saved_for_later TINYINT(1) NOT NULL DEFAULT 0,
  price_seen_usd DECIMAL(14,4) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cart_line (cart_id, product_id, saved_for_later),
  CONSTRAINT fk_ci_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT ck_ci_qty CHECK (qty >= 1 AND qty <= 1000000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE addresses (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NULL,
  company_id   BIGINT UNSIGNED NULL,
  address_type ENUM('billing','shipping','warehouse','project_site','branch','customer_site') NOT NULL DEFAULT 'shipping',
  label        VARCHAR(100) NOT NULL DEFAULT '',
  contact_name VARCHAR(150) NOT NULL,
  company_name VARCHAR(200) NOT NULL DEFAULT '',
  line1        VARCHAR(200) NOT NULL,
  line2        VARCHAR(200) NOT NULL DEFAULT '',
  city         VARCHAR(100) NOT NULL,
  state        VARCHAR(100) NOT NULL DEFAULT '',
  postal_code  VARCHAR(20) NOT NULL DEFAULT '',
  country_code CHAR(2) NOT NULL,
  phone        VARCHAR(40) NOT NULL DEFAULT '',
  tax_id       VARCHAR(60) NOT NULL DEFAULT '',
  is_default   TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at   DATETIME(3) NULL,
  KEY idx_addr_user (user_id),
  KEY idx_addr_company (company_id),
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_addr_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_addr_country FOREIGN KEY (country_code) REFERENCES countries(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_number     VARCHAR(20) NOT NULL,
  access_token     CHAR(43) NOT NULL,
  user_id          BIGINT UNSIGNED NULL,
  company_id       BIGINT UNSIGNED NULL,
  customer_email   VARCHAR(254) NOT NULL,
  customer_name    VARCHAR(150) NOT NULL,
  customer_phone   VARCHAR(40) NOT NULL DEFAULT '',
  company_name     VARCHAR(200) NOT NULL DEFAULT '',
  tax_id           VARCHAR(60) NOT NULL DEFAULT '',
  po_number        VARCHAR(80) NOT NULL DEFAULT '',
  country_code     CHAR(2) NOT NULL,
  currency         CHAR(3) NOT NULL,
  exchange_rate    DECIMAL(20,10) NOT NULL,
  incoterm         CHAR(3) NOT NULL,
  shipping_method  VARCHAR(20) NULL,
  status           ENUM('pending_approval','pending_payment','payment_failed','confirmed','processing','packed','shipped','in_transit','out_for_delivery','delivered','cancelled','returned','refunded','partially_refunded') NOT NULL,
  payment_status   ENUM('unpaid','authorized','paid','partially_refunded','refunded','failed') NOT NULL DEFAULT 'unpaid',
  payment_method   ENUM('razorpay','bank_transfer','purchase_order') NOT NULL,
  payment_terms    VARCHAR(20) NOT NULL DEFAULT 'prepaid',
  subtotal         DECIMAL(16,2) NOT NULL,
  discount         DECIMAL(16,2) NOT NULL DEFAULT 0,
  freight          DECIMAL(16,2) NOT NULL DEFAULT 0,
  insurance        DECIMAL(16,2) NOT NULL DEFAULT 0,
  customs_estimate DECIMAL(16,2) NULL,
  import_tax_estimate DECIMAL(16,2) NULL,
  tax              DECIMAL(16,2) NOT NULL DEFAULT 0,
  handling         DECIMAL(16,2) NOT NULL DEFAULT 0,
  other_charges    DECIMAL(16,2) NOT NULL DEFAULT 0,
  total            DECIMAL(16,2) NOT NULL,
  tds_amount       DECIMAL(16,2) NULL,
  import_charges_estimate DECIMAL(16,2) NULL,
  landed_estimate  DECIMAL(16,2) NULL,
  total_usd        DECIMAL(16,4) NOT NULL,
  amount_paid      DECIMAL(16,2) NOT NULL DEFAULT 0,
  amount_refunded  DECIMAL(16,2) NOT NULL DEFAULT 0,
  estimate_json    JSON NOT NULL,
  notes            VARCHAR(2000) NOT NULL DEFAULT '',
  source           ENUM('web','quote','admin') NOT NULL DEFAULT 'web',
  quote_version_id BIGINT UNSIGNED NULL,
  idempotency_key  VARCHAR(100) NULL,
  approved_by      BIGINT UNSIGNED NULL,
  approved_at      DATETIME(3) NULL,
  placed_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_order_number (order_number),
  UNIQUE KEY uq_order_idem (idempotency_key),
  KEY idx_order_user (user_id, placed_at),
  KEY idx_order_company (company_id, placed_at),
  KEY idx_order_status (status, placed_at),
  KEY idx_order_email (customer_email),
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT ck_order_money CHECK (total >= 0 AND subtotal >= 0 AND amount_paid >= 0 AND amount_refunded >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id      BIGINT UNSIGNED NOT NULL,
  product_id    BIGINT UNSIGNED NULL,
  sku           VARCHAR(100) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  attributes_json JSON NULL,
  hs_code       VARCHAR(12) NULL,
  qty           INT NOT NULL,
  unit_price    DECIMAL(16,4) NOT NULL,
  discount      DECIMAL(16,2) NOT NULL DEFAULT 0,
  line_total    DECIMAL(16,2) NOT NULL,
  unit_price_usd DECIMAL(16,4) NOT NULL,
  qty_shipped   INT NOT NULL DEFAULT 0,
  qty_returned  INT NOT NULL DEFAULT 0,
  KEY idx_oi_order (order_id),
  KEY idx_oi_product (product_id),
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_oi_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT ck_oi CHECK (qty >= 1 AND unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_addresses (
  order_id     BIGINT UNSIGNED NOT NULL,
  address_type ENUM('billing','shipping') NOT NULL,
  contact_name VARCHAR(150) NOT NULL,
  company_name VARCHAR(200) NOT NULL DEFAULT '',
  line1        VARCHAR(200) NOT NULL,
  line2        VARCHAR(200) NOT NULL DEFAULT '',
  city         VARCHAR(100) NOT NULL,
  state        VARCHAR(100) NOT NULL DEFAULT '',
  postal_code  VARCHAR(20) NOT NULL DEFAULT '',
  country_code CHAR(2) NOT NULL,
  phone        VARCHAR(40) NOT NULL DEFAULT '',
  tax_id       VARCHAR(60) NOT NULL DEFAULT '',
  PRIMARY KEY (order_id, address_type),
  CONSTRAINT fk_oa_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_history (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id     BIGINT UNSIGNED NOT NULL,
  from_status  VARCHAR(30) NULL,
  to_status    VARCHAR(30) NOT NULL,
  note         VARCHAR(1000) NOT NULL DEFAULT '',
  actor_user_id BIGINT UNSIGNED NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_osh_order (order_id, id),
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_reservations (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id     BIGINT UNSIGNED NOT NULL,
  product_id   BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  qty          INT NOT NULL,
  status       ENUM('reserved','released','consumed') NOT NULL DEFAULT 'reserved',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_sr_order (order_id),
  CONSTRAINT fk_sr_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rfqs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rfq_number    VARCHAR(20) NOT NULL,
  access_token  CHAR(43) NOT NULL,
  user_id       BIGINT UNSIGNED NULL,
  company_id    BIGINT UNSIGNED NULL,
  contact_name  VARCHAR(150) NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  contact_phone VARCHAR(40) NOT NULL DEFAULT '',
  company_name  VARCHAR(200) NOT NULL DEFAULT '',
  country_code  CHAR(2) NOT NULL,
  destination   VARCHAR(200) NOT NULL DEFAULT '',
  currency      CHAR(3) NOT NULL DEFAULT 'USD',
  incoterm      CHAR(3) NULL,
  required_date DATE NULL,
  message       TEXT NULL,
  status        ENUM('submitted','under_review','info_requested','quoted','rejected','closed','converted') NOT NULL DEFAULT 'submitted',
  assigned_to   BIGINT UNSIGNED NULL,
  source        ENUM('web','cart','bom','quick_order','admin','sample') NOT NULL DEFAULT 'web',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rfq_number (rfq_number),
  KEY idx_rfq_status (status, created_at),
  KEY idx_rfq_user (user_id),
  KEY idx_rfq_email (contact_email),
  CONSTRAINT fk_rfq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rfq_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rfq_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rfq_id       BIGINT UNSIGNED NOT NULL,
  product_id   BIGINT UNSIGNED NULL,
  sku          VARCHAR(100) NOT NULL DEFAULT '',
  description  VARCHAR(500) NOT NULL DEFAULT '',
  qty          INT NOT NULL,
  target_price DECIMAL(16,4) NULL,
  KEY idx_ri_rfq (rfq_id),
  CONSTRAINT fk_ri_rfq FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT ck_ri CHECK (qty >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rfq_attachments (
  rfq_id   BIGINT UNSIGNED NOT NULL,
  file_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (rfq_id, file_id),
  CONSTRAINT fk_ra_rfq FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_file FOREIGN KEY (file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rfq_messages (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rfq_id        BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NULL,
  author_name   VARCHAR(150) NOT NULL DEFAULT '',
  is_internal   TINYINT(1) NOT NULL DEFAULT 0,
  body          TEXT NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rm_rfq (rfq_id),
  CONSTRAINT fk_rm_rfq FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quotes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quote_number   VARCHAR(20) NOT NULL,
  access_token   CHAR(43) NOT NULL,
  rfq_id         BIGINT UNSIGNED NULL,
  user_id        BIGINT UNSIGNED NULL,
  company_id     BIGINT UNSIGNED NULL,
  customer_name  VARCHAR(150) NOT NULL,
  customer_email VARCHAR(254) NOT NULL,
  company_name   VARCHAR(200) NOT NULL DEFAULT '',
  status         ENUM('draft','sent','accepted','rejected','expired','converted') NOT NULL DEFAULT 'draft',
  current_version INT NOT NULL DEFAULT 1,
  salesperson_id BIGINT UNSIGNED NULL,
  order_id       BIGINT UNSIGNED NULL,
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_quote_number (quote_number),
  KEY idx_quote_status (status),
  KEY idx_quote_user (user_id),
  KEY idx_quote_email (customer_email),
  CONSTRAINT fk_quote_rfq FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each version is immutable once sent (a revision creates V2, V3, …).
CREATE TABLE quote_versions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quote_id       BIGINT UNSIGNED NOT NULL,
  version        INT NOT NULL,
  status         ENUM('draft','sent','superseded','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
  country_code   CHAR(2) NOT NULL,
  currency       CHAR(3) NOT NULL,
  exchange_rate  DECIMAL(20,10) NOT NULL,
  incoterm       CHAR(3) NOT NULL,
  shipping_method VARCHAR(20) NULL,
  payment_terms  VARCHAR(40) NOT NULL DEFAULT 'prepaid',
  lead_time      VARCHAR(200) NOT NULL DEFAULT '',
  valid_until    DATE NOT NULL,
  terms          TEXT NULL,
  notes          TEXT NULL,
  subtotal       DECIMAL(16,2) NOT NULL DEFAULT 0,
  discount       DECIMAL(16,2) NOT NULL DEFAULT 0,
  freight        DECIMAL(16,2) NOT NULL DEFAULT 0,
  insurance      DECIMAL(16,2) NOT NULL DEFAULT 0,
  customs_estimate DECIMAL(16,2) NULL,
  tax            DECIMAL(16,2) NOT NULL DEFAULT 0,
  import_tax_estimate DECIMAL(16,2) NULL,
  other_charges  DECIMAL(16,2) NOT NULL DEFAULT 0,
  total          DECIMAL(16,2) NOT NULL DEFAULT 0,
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at        DATETIME(3) NULL,
  responded_at   DATETIME(3) NULL,
  response_note  VARCHAR(1000) NULL,
  UNIQUE KEY uq_qv (quote_id, version),
  CONSTRAINT fk_qv_quote FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quote_items (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quote_version_id BIGINT UNSIGNED NOT NULL,
  product_id       BIGINT UNSIGNED NULL,
  sku              VARCHAR(100) NOT NULL,
  description      VARCHAR(500) NOT NULL,
  qty              INT NOT NULL,
  unit_price       DECIMAL(16,4) NOT NULL,
  discount_pct     DECIMAL(7,3) NOT NULL DEFAULT 0,
  line_total       DECIMAL(16,2) NOT NULL,
  lead_time        VARCHAR(100) NOT NULL DEFAULT '',
  KEY idx_qi_v (quote_version_id),
  CONSTRAINT fk_qi_v FOREIGN KEY (quote_version_id) REFERENCES quote_versions(id) ON DELETE RESTRICT,
  CONSTRAINT ck_qi CHECK (qty >= 1 AND unit_price >= 0 AND discount_pct >= 0 AND discount_pct <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders ADD CONSTRAINT fk_order_qv FOREIGN KEY (quote_version_id) REFERENCES quote_versions(id) ON DELETE SET NULL;

INSERT INTO permissions (code, module, description, is_sensitive) VALUES ('orders.cancel','orders','Cancel orders and release stock',1);
INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES ('owner','orders.cancel'),('super_admin','orders.cancel'),('order_manager','orders.cancel'),
 ('super_admin','orders.read'),('super_admin','orders.manage'),('sales_manager','orders.read'),('staff','orders.read'),('staff','rfq.manage');

INSERT INTO settings (setting_key, value_json) VALUES
 ('commerce.quote_validity_days', '30'),
 ('commerce.bank_transfer_instructions', '"Bank details are provided on your proforma invoice. Please quote your order number as the payment reference."'),
 ('commerce.terms_url', '"/support#terms"');
