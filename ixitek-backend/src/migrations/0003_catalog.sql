-- 0003_catalog.sql — Product Information Management.
--
-- Hierarchy:  category (tree: e.g. Fiber Optic Cables > MPO12)
--               └ product_family (configurable parent, e.g. "OM4 12F MPO-MPO")
--                   └ product (one sellable SKU = one variant of its family;
--                              variant axes such as length/colour are attributes)
-- A product has one primary family and may appear in more (product_family_links),
-- e.g. a loopback listed under both its cable group and "Loopbacks".

CREATE TABLE categories (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_id       BIGINT UNSIGNED NULL,
  slug            VARCHAR(160) NOT NULL,
  name            VARCHAR(160) NOT NULL,
  short_description VARCHAR(500) NOT NULL DEFAULT '',
  description     TEXT NULL,
  icon            VARCHAR(60) NULL,
  image_url       VARCHAR(1024) NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  status          ENUM('active','hidden','archived') NOT NULL DEFAULT 'active',
  show_in_menu    TINYINT(1) NOT NULL DEFAULT 1,
  source_key      VARCHAR(190) NULL,
  seo_title       VARCHAR(200) NULL,
  seo_description VARCHAR(400) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  UNIQUE KEY uq_cat_slug (slug),
  UNIQUE KEY uq_cat_source (source_key),
  KEY idx_cat_parent (parent_id, sort_order),
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_families (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id     BIGINT UNSIGNED NOT NULL,
  slug            VARCHAR(190) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  short_description VARCHAR(500) NOT NULL DEFAULT '',
  description     TEXT NULL,
  image_url       VARCHAR(1024) NULL,
  variant_axes    JSON NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  status          ENUM('active','hidden','archived') NOT NULL DEFAULT 'active',
  source_key      VARCHAR(190) NULL,
  seo_title       VARCHAR(200) NULL,
  seo_description VARCHAR(400) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  UNIQUE KEY uq_fam_slug (slug),
  UNIQUE KEY uq_fam_source (source_key),
  KEY idx_fam_cat (category_id, sort_order),
  CONSTRAINT fk_fam_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku                VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  sku_search         VARCHAR(100) NOT NULL,
  slug               VARCHAR(190) NOT NULL,
  name               VARCHAR(255) NOT NULL,
  short_description  VARCHAR(500) NOT NULL DEFAULT '',
  description        TEXT NULL,
  category_id        BIGINT UNSIGNED NOT NULL,
  family_id          BIGINT UNSIGNED NULL,
  brand              VARCHAR(100) NOT NULL DEFAULT 'IXITEK',
  product_type       VARCHAR(60)  NOT NULL DEFAULT '',
  unit               VARCHAR(20)  NOT NULL DEFAULT 'pcs',
  moq                INT NOT NULL DEFAULT 1,
  max_order_qty      INT NULL,
  weight_kg          DECIMAL(10,3) NULL,
  length_mm          DECIMAL(10,2) NULL,
  width_mm           DECIMAL(10,2) NULL,
  height_mm          DECIMAL(10,2) NULL,
  country_of_origin  CHAR(2) NULL,
  hs_code            VARCHAR(20) NULL,
  export_classification VARCHAR(40) NULL,
  lead_time_days     INT NULL,
  warranty_months    INT NULL,
  status             ENUM('draft','review','active','coming_soon','discontinued','end_of_sale','end_of_life','archived') NOT NULL DEFAULT 'active',
  is_featured        TINYINT(1) NOT NULL DEFAULT 0,
  track_inventory    TINYINT(1) NOT NULL DEFAULT 1,
  allow_backorder    TINYINT(1) NOT NULL DEFAULT 0,
  replacement_product_id BIGINT UNSIGNED NULL,
  search_keywords    TEXT NULL,
  seo_title          VARCHAR(200) NULL,
  seo_description    VARCHAR(400) NULL,
  source_ref         VARCHAR(190) NULL,
  last_import_batch_id BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at         DATETIME(3) NULL,
  UNIQUE KEY uq_products_sku (sku),
  UNIQUE KEY uq_products_slug (slug),
  KEY idx_products_sku_search (sku_search),
  KEY idx_products_cat (category_id, status),
  KEY idx_products_family (family_id),
  KEY idx_products_status (status, deleted_at),
  KEY idx_products_created (created_at),
  FULLTEXT KEY ft_products (name, description, search_keywords),
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_prod_family FOREIGN KEY (family_id) REFERENCES product_families(id) ON DELETE SET NULL,
  CONSTRAINT fk_prod_repl FOREIGN KEY (replacement_product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT ck_prod_moq CHECK (moq >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_family_links (
  product_id  BIGINT UNSIGNED NOT NULL,
  family_id   BIGINT UNSIGNED NOT NULL,
  is_primary  TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  source_ref  VARCHAR(190) NULL,
  PRIMARY KEY (product_id, family_id),
  KEY idx_pfl_family (family_id, sort_order),
  CONSTRAINT fk_pfl_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfl_fam FOREIGN KEY (family_id) REFERENCES product_families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attributes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(60) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  data_type      ENUM('text','number','boolean') NOT NULL DEFAULT 'text',
  unit           VARCHAR(20) NULL,
  is_filterable  TINYINT(1) NOT NULL DEFAULT 1,
  is_comparable  TINYINT(1) NOT NULL DEFAULT 1,
  is_variant_axis TINYINT(1) NOT NULL DEFAULT 0,
  sort_order     INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_attr_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_attribute_values (
  product_id   BIGINT UNSIGNED NOT NULL,
  attribute_id BIGINT UNSIGNED NOT NULL,
  value_text   VARCHAR(255) NOT NULL,
  value_number DECIMAL(14,4) NULL,
  source       ENUM('import','parsed','manual') NOT NULL DEFAULT 'manual',
  PRIMARY KEY (product_id, attribute_id),
  KEY idx_pav_filter (attribute_id, value_text),
  KEY idx_pav_num (attribute_id, value_number),
  CONSTRAINT fk_pav_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pav_attr FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_specifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  BIGINT UNSIGNED NULL,
  family_id   BIGINT UNSIGNED NULL,
  spec_group  VARCHAR(100) NOT NULL DEFAULT 'General',
  label       VARCHAR(150) NOT NULL,
  value       VARCHAR(1000) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  source      ENUM('import','parsed','manual') NOT NULL DEFAULT 'manual',
  KEY idx_spec_prod (product_id),
  KEY idx_spec_fam (family_id),
  CONSTRAINT fk_spec_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_spec_fam FOREIGN KEY (family_id) REFERENCES product_families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_images (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  BIGINT UNSIGNED NULL,
  family_id   BIGINT UNSIGNED NULL,
  url         VARCHAR(1024) NOT NULL,
  storage_key VARCHAR(500) NULL,
  alt         VARCHAR(255) NOT NULL DEFAULT '',
  width       INT NULL,
  height      INT NULL,
  format      VARCHAR(20) NULL,
  bytes       INT NULL,
  variant     ENUM('original','large','medium','thumb') NOT NULL DEFAULT 'original',
  sort_order  INT NOT NULL DEFAULT 0,
  is_primary  TINYINT(1) NOT NULL DEFAULT 0,
  status      ENUM('unchecked','valid','broken') NOT NULL DEFAULT 'unchecked',
  http_status INT NULL,
  checked_at  DATETIME(3) NULL,
  source      ENUM('import','upload','manual') NOT NULL DEFAULT 'manual',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_img_prod (product_id, sort_order),
  KEY idx_img_fam (family_id),
  KEY idx_img_status (status),
  KEY idx_img_url (url(191)),
  CONSTRAINT fk_img_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_img_fam FOREIGN KEY (family_id) REFERENCES product_families(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_documents (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  BIGINT UNSIGNED NULL,
  family_id   BIGINT UNSIGNED NULL,
  doc_type    ENUM('datasheet','manual','drawing','cad','certificate','compliance','app_note','firmware','software','video','faq','other') NOT NULL,
  title       VARCHAR(255) NOT NULL,
  version     VARCHAR(40) NOT NULL DEFAULT '1',
  url         VARCHAR(1024) NULL,
  file_id     BIGINT UNSIGNED NULL,
  is_public   TINYINT(1) NOT NULL DEFAULT 1,
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3) NULL,
  KEY idx_doc_prod (product_id),
  KEY idx_doc_fam (family_id),
  CONSTRAINT fk_doc_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_fam FOREIGN KEY (family_id) REFERENCES product_families(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_relations (
  product_id         BIGINT UNSIGNED NOT NULL,
  related_product_id BIGINT UNSIGNED NOT NULL,
  relation_type      ENUM('related','compatible','replacement','alternative','accessory') NOT NULL,
  note               VARCHAR(255) NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (product_id, related_product_id, relation_type),
  KEY idx_rel_related (related_product_id),
  CONSTRAINT fk_rel_a FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_rel_b FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────
-- CONFIDENTIAL SUPPLIER COSTS. Kept out of `products` on purpose: public
-- catalog queries never join this table, so costs cannot leak into
-- customer JSON, search, pages, quotes, invoices or emails. Readable only
-- by code paths guarded by the `pricing.read_cost` permission.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE product_costs (
  product_id             BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  supplier_fob_cost_usd  DECIMAL(14,4) NULL,
  supplier_exw_cost_usd  DECIMAL(14,4) NULL,
  internal_cost_usd      DECIMAL(14,4) NULL,
  cost_basis             ENUM('exw','fob','internal') NOT NULL DEFAULT 'exw',
  supplier_name          VARCHAR(150) NULL,
  supplier_sku           VARCHAR(100) NULL,
  updated_by             BIGINT UNSIGNED NULL,
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_cost_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT ck_cost_nonneg CHECK ((supplier_fob_cost_usd IS NULL OR supplier_fob_cost_usd >= 0) AND (supplier_exw_cost_usd IS NULL OR supplier_exw_cost_usd >= 0) AND (internal_cost_usd IS NULL OR internal_cost_usd >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Selling-price rules (cost basis + margin % and/or fixed markup).
-- Resolution: the most specific matching active rule wins —
--   product > family > category > global, then customer group, country,
--   currency, highest min_qty <= ordered qty, then priority.
CREATE TABLE pricing_rules (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(150) NOT NULL DEFAULT '',
  scope            ENUM('global','category','family','product') NOT NULL,
  scope_id         BIGINT UNSIGNED NOT NULL DEFAULT 0,
  customer_group   VARCHAR(40) NULL,
  country_code     CHAR(2) NULL,
  currency         CHAR(3) NULL,
  min_qty          INT NOT NULL DEFAULT 1,
  cost_basis       ENUM('product','exw','fob','internal') NOT NULL DEFAULT 'product',
  margin_pct       DECIMAL(7,3) NOT NULL DEFAULT 0,
  fixed_markup_usd DECIMAL(14,4) NOT NULL DEFAULT 0,
  rounding_step    DECIMAL(10,4) NOT NULL DEFAULT 0.0100,
  priority         INT NOT NULL DEFAULT 0,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  valid_from       DATETIME(3) NULL,
  valid_to         DATETIME(3) NULL,
  note             VARCHAR(255) NULL,
  created_by       BIGINT UNSIGNED NULL,
  updated_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_rule_scope (scope, scope_id, is_active),
  CONSTRAINT ck_rule_margin CHECK (margin_pct > -100 AND margin_pct < 1000),
  CONSTRAINT ck_rule_qty CHECK (min_qty >= 1),
  CONSTRAINT ck_rule_markup CHECK (fixed_markup_usd >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Materialised PUBLIC selling price (USD, qty 1, no customer group, any country).
-- This is the only price column the storefront reads. NULL => "Request a Quote".
CREATE TABLE product_selling_prices (
  product_id          BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  selling_price_usd   DECIMAL(14,4) NULL,
  source              ENUM('none','rule','override') NOT NULL DEFAULT 'none',
  rule_id             BIGINT UNSIGNED NULL,
  override_price_usd  DECIMAL(14,4) NULL,
  override_reason     VARCHAR(500) NULL,
  override_by         BIGINT UNSIGNED NULL,
  override_at         DATETIME(3) NULL,
  computed_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_psp_price (selling_price_usd),
  CONSTRAINT fk_psp_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT ck_psp_nonneg CHECK ((selling_price_usd IS NULL OR selling_price_usd >= 0) AND (override_price_usd IS NULL OR override_price_usd >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every cost / price / rule change is recorded; nothing is silently overwritten.
CREATE TABLE price_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  BIGINT UNSIGNED NULL,
  rule_id     BIGINT UNSIGNED NULL,
  field       VARCHAR(60) NOT NULL,
  old_value   VARCHAR(100) NULL,
  new_value   VARCHAR(100) NULL,
  currency    CHAR(3) NOT NULL DEFAULT 'USD',
  reason      VARCHAR(500) NULL,
  source      ENUM('import','admin','api','system') NOT NULL,
  changed_by  BIGINT UNSIGNED NULL,
  import_batch_id BIGINT UNSIGNED NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ph_prod (product_id, created_at),
  KEY idx_ph_rule (rule_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO attributes (code, name, data_type, unit, is_filterable, is_comparable, is_variant_axis, sort_order) VALUES
 ('connector','Connector','text',NULL,1,1,0,10),
 ('fiber_mode','Fiber Mode','text',NULL,1,1,0,20),
 ('fiber_type','Fiber Type','text',NULL,1,1,0,30),
 ('fiber_count','Fiber Count','number','F',1,1,0,40),
 ('length_m','Length (m)','number','m',1,1,1,50),
 ('length_label','Length','text',NULL,0,1,0,51),
 ('jacket_rating','Jacket Rating','text',NULL,1,1,0,60),
 ('jacket_diameter','Cable Diameter','text',NULL,1,1,0,70),
 ('color','Colour','text',NULL,1,1,1,80),
 ('polish','Polish','text',NULL,1,1,0,90),
 ('cable_category','Cable Category','text',NULL,1,1,0,100),
 ('configuration','Configuration','text',NULL,1,1,0,110),
 ('data_rate','Data Rate','text',NULL,1,1,0,120),
 ('wavelength','Wavelength','text','nm',1,1,0,130),
 ('form_factor','Form Factor','text',NULL,1,1,0,140);

INSERT INTO categories (slug, name, short_description, icon, sort_order, source_key) VALUES
 ('fiber-optic-cables','Fiber Optic Cables','LC, MPO/MTP, SN, CS and copper patch cords, breakouts, loopbacks, adapters, patch panels and cassettes.','Cable',1,'root:fiber-optic-cables'),
 ('optical-transceivers','Optical Transceivers','Pluggable optics for data centre, enterprise and telecom networks.','Zap',2,'root:optical-transceivers');
