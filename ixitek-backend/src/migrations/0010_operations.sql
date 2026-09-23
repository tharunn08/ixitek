-- 0010 — operations: shipments & tracking, CRM, company accounts,
-- procurement (suppliers, POs, goods receipts, supplier invoices),
-- returns/RMA/warranty and support tickets.

-- ── Shipping ──
CREATE TABLE carriers (
  code                  VARCHAR(30) NOT NULL PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  adapter               VARCHAR(30) NOT NULL DEFAULT 'manual',
  tracking_url_template VARCHAR(500) NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  sort_order            INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Names only; IXITEK adds tracking-URL templates ({tracking}) for carriers it actually uses.
INSERT IGNORE INTO carriers (code, name, sort_order) VALUES
 ('dhl','DHL Express',1),('fedex','FedEx',2),('ups','UPS',3),('bluedart','Blue Dart',4),('dtdc','DTDC',5),
 ('indiapost','India Post',6),('freight_forwarder','Freight forwarder (air/sea)',7),('own','Own vehicle / hand delivery',8),('other','Other',9);

CREATE TABLE shipments (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shipment_number    VARCHAR(20) NOT NULL,
  order_id           BIGINT UNSIGNED NOT NULL,
  warehouse_id       BIGINT UNSIGNED NULL,
  carrier            VARCHAR(30) NOT NULL,
  service            VARCHAR(60) NOT NULL DEFAULT '',
  tracking_number    VARCHAR(100) NOT NULL DEFAULT '',
  tracking_url       VARCHAR(500) NOT NULL DEFAULT '',
  status             ENUM('preparing','packed','shipped','in_transit','out_for_delivery','delivered','exception','returned','cancelled') NOT NULL DEFAULT 'preparing',
  packages           INT NOT NULL DEFAULT 1,
  weight_kg          DECIMAL(10,3) NULL,
  estimated_delivery DATE NULL,
  shipped_at         DATETIME(3) NULL,
  delivered_at       DATETIME(3) NULL,
  notes              VARCHAR(1000) NOT NULL DEFAULT '',
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ship_number (shipment_number),
  KEY idx_ship_order (order_id),
  KEY idx_ship_status (status),
  CONSTRAINT fk_ship_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ship_carrier FOREIGN KEY (carrier) REFERENCES carriers(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipment_items (
  shipment_id   BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  qty           INT NOT NULL,
  PRIMARY KEY (shipment_id, order_item_id),
  CONSTRAINT fk_si_ship FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT,
  CONSTRAINT ck_si_qty CHECK (qty >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shipment_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shipment_id  BIGINT UNSIGNED NOT NULL,
  status       VARCHAR(30) NOT NULL,
  location     VARCHAR(200) NOT NULL DEFAULT '',
  description  VARCHAR(500) NOT NULL DEFAULT '',
  source       ENUM('manual','carrier') NOT NULL DEFAULT 'manual',
  occurred_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by   BIGINT UNSIGNED NULL,
  KEY idx_se_ship (shipment_id, occurred_at),
  CONSTRAINT fk_sev_ship FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CRM ──
CREATE TABLE crm_leads (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source          ENUM('enquiry','rfq','order','manual','website','referral','event') NOT NULL DEFAULT 'manual',
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(254) NOT NULL DEFAULT '',
  phone           VARCHAR(40) NOT NULL DEFAULT '',
  company_name    VARCHAR(200) NOT NULL DEFAULT '',
  country_code    CHAR(2) NULL,
  stage           ENUM('new','contacted','qualified','proposal','negotiation','won','lost') NOT NULL DEFAULT 'new',
  lost_reason     VARCHAR(300) NULL,
  value_usd       DECIMAL(14,2) NULL,
  owner_id        BIGINT UNSIGNED NULL,
  company_id      BIGINT UNSIGNED NULL,
  user_id         BIGINT UNSIGNED NULL,
  enquiry_id      BIGINT UNSIGNED NULL,
  rfq_id          BIGINT UNSIGNED NULL,
  next_follow_up  DATE NULL,
  notes           TEXT NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3) NULL,
  UNIQUE KEY uq_lead_enquiry (enquiry_id),
  UNIQUE KEY uq_lead_rfq (rfq_id),
  KEY idx_lead_stage (stage, updated_at),
  KEY idx_lead_owner (owner_id),
  KEY idx_lead_email (email),
  KEY idx_lead_follow (next_follow_up)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE crm_activities (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entity_type  ENUM('lead','company','user') NOT NULL,
  entity_id    BIGINT UNSIGNED NOT NULL,
  kind         ENUM('note','call','email','meeting','task') NOT NULL DEFAULT 'note',
  subject      VARCHAR(200) NOT NULL DEFAULT '',
  body         TEXT NULL,
  due_at       DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  owner_id     BIGINT UNSIGNED NULL,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_act_entity (entity_type, entity_id, created_at),
  KEY idx_act_due (owner_id, completed_at, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Company accounts ──
CREATE TABLE company_invitations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id  BIGINT UNSIGNED NOT NULL,
  email       VARCHAR(254) NOT NULL,
  company_role ENUM('admin','buyer','finance','technical','approver','viewer') NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  invited_by  BIGINT UNSIGNED NULL,
  expires_at  DATETIME(3) NOT NULL,
  accepted_at DATETIME(3) NULL,
  revoked_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ci_token (token_hash),
  KEY idx_ci_company (company_id),
  CONSTRAINT fk_ci_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Procurement ──
CREATE TABLE suppliers (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(30) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  country_code    CHAR(2) NULL,
  contact_name    VARCHAR(150) NOT NULL DEFAULT '',
  email           VARCHAR(254) NOT NULL DEFAULT '',
  phone           VARCHAR(40) NOT NULL DEFAULT '',
  address         VARCHAR(1000) NOT NULL DEFAULT '',
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  payment_terms   VARCHAR(60) NOT NULL DEFAULT '',
  lead_time_days  INT NULL,
  notes           TEXT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_supplier_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_products (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  supplier_id     BIGINT UNSIGNED NOT NULL,
  product_id      BIGINT UNSIGNED NOT NULL,
  supplier_sku    VARCHAR(100) NOT NULL DEFAULT '',
  unit_cost       DECIMAL(16,4) NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  moq             INT NOT NULL DEFAULT 1,
  lead_time_days  INT NULL,
  is_preferred    TINYINT(1) NOT NULL DEFAULT 0,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sp (supplier_id, product_id),
  KEY idx_sp_product (product_id),
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_orders (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  po_number      VARCHAR(20) NOT NULL,
  supplier_id    BIGINT UNSIGNED NOT NULL,
  warehouse_id   BIGINT UNSIGNED NOT NULL,
  status         ENUM('draft','sent','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
  currency       CHAR(3) NOT NULL,
  incoterm       CHAR(3) NULL,
  expected_date  DATE NULL,
  subtotal       DECIMAL(16,2) NOT NULL DEFAULT 0,
  notes          VARCHAR(2000) NOT NULL DEFAULT '',
  sent_at        DATETIME(3) NULL,
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_po_number (po_number),
  KEY idx_po_supplier (supplier_id, status),
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_po_wh FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE purchase_order_items (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  po_id         BIGINT UNSIGNED NOT NULL,
  product_id    BIGINT UNSIGNED NOT NULL,
  supplier_sku  VARCHAR(100) NOT NULL DEFAULT '',
  qty           INT NOT NULL,
  unit_cost     DECIMAL(16,4) NOT NULL,
  qty_received  INT NOT NULL DEFAULT 0,
  KEY idx_poi_po (po_id),
  CONSTRAINT fk_poi_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT ck_poi CHECK (qty >= 1 AND unit_cost >= 0 AND qty_received >= 0 AND qty_received <= qty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE goods_receipts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grn_number    VARCHAR(20) NOT NULL,
  po_id         BIGINT UNSIGNED NOT NULL,
  warehouse_id  BIGINT UNSIGNED NOT NULL,
  notes         VARCHAR(1000) NOT NULL DEFAULT '',
  idempotency_key VARCHAR(100) NULL,
  received_by   BIGINT UNSIGNED NULL,
  received_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_grn_number (grn_number),
  UNIQUE KEY uq_grn_idem (idempotency_key),
  CONSTRAINT fk_grn_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE goods_receipt_items (
  grn_id      BIGINT UNSIGNED NOT NULL,
  po_item_id  BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  qty         INT NOT NULL,
  damaged     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (grn_id, po_item_id),
  CONSTRAINT fk_gri_grn FOREIGN KEY (grn_id) REFERENCES goods_receipts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE supplier_invoices (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  supplier_id    BIGINT UNSIGNED NOT NULL,
  po_id          BIGINT UNSIGNED NULL,
  invoice_number VARCHAR(80) NOT NULL,
  invoice_date   DATE NOT NULL,
  due_date       DATE NULL,
  currency       CHAR(3) NOT NULL,
  amount         DECIMAL(16,2) NOT NULL,
  status         ENUM('unpaid','paid','disputed','cancelled') NOT NULL DEFAULT 'unpaid',
  paid_at        DATE NULL,
  payment_reference VARCHAR(120) NOT NULL DEFAULT '',
  notes          VARCHAR(1000) NOT NULL DEFAULT '',
  file_id        BIGINT UNSIGNED NULL,
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_si_number (supplier_id, invoice_number),
  CONSTRAINT fk_sinv_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sinv_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Returns / RMA / warranty ──
CREATE TABLE rmas (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rma_number     VARCHAR(20) NOT NULL,
  order_id       BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NULL,
  kind           ENUM('return','replacement','repair','refund','warranty') NOT NULL,
  status         ENUM('requested','approved','rejected','awaiting_return','received','inspected','completed','cancelled') NOT NULL DEFAULT 'requested',
  reason         VARCHAR(100) NOT NULL,
  customer_notes TEXT NULL,
  resolution     VARCHAR(1000) NOT NULL DEFAULT '',
  within_warranty TINYINT(1) NULL,
  refund_id      BIGINT UNSIGNED NULL,
  return_tracking VARCHAR(200) NOT NULL DEFAULT '',
  assigned_to    BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rma_number (rma_number),
  KEY idx_rma_order (order_id),
  KEY idx_rma_status (status),
  CONSTRAINT fk_rma_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rma_items (
  rma_id        BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  qty           INT NOT NULL,
  condition_note VARCHAR(300) NOT NULL DEFAULT '',
  restock       TINYINT(1) NULL,
  PRIMARY KEY (rma_id, order_item_id),
  CONSTRAINT fk_rmai_rma FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE,
  CONSTRAINT fk_rmai_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT,
  CONSTRAINT ck_rmai_qty CHECK (qty >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rma_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rma_id      BIGINT UNSIGNED NOT NULL,
  status      VARCHAR(30) NOT NULL,
  note        VARCHAR(2000) NOT NULL DEFAULT '',
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  actor_user_id BIGINT UNSIGNED NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rmae (rma_id, id),
  CONSTRAINT fk_rmae_rma FOREIGN KEY (rma_id) REFERENCES rmas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Support tickets ──
CREATE TABLE tickets (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_number  VARCHAR(20) NOT NULL,
  access_token   CHAR(43) NOT NULL,
  user_id        BIGINT UNSIGNED NULL,
  company_id     BIGINT UNSIGNED NULL,
  name           VARCHAR(150) NOT NULL,
  email          VARCHAR(254) NOT NULL,
  subject        VARCHAR(200) NOT NULL,
  category       ENUM('order','technical','billing','shipping','returns','account','other') NOT NULL DEFAULT 'other',
  priority       ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status         ENUM('open','pending_customer','pending_internal','resolved','closed') NOT NULL DEFAULT 'open',
  order_id       BIGINT UNSIGNED NULL,
  assigned_to    BIGINT UNSIGNED NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_ticket_number (ticket_number),
  KEY idx_ticket_status (status, updated_at),
  KEY idx_ticket_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_messages (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket_id      BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NULL,
  author_name    VARCHAR(150) NOT NULL,
  is_staff       TINYINT(1) NOT NULL DEFAULT 0,
  is_internal    TINYINT(1) NOT NULL DEFAULT 0,
  body           TEXT NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_tm (ticket_id, id),
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (code, module, description, is_sensitive) VALUES
 ('shipping.manage','orders','Create and update shipments',0),
 ('procurement.manage','procurement','Suppliers, purchase orders, goods receipts, supplier invoices',1),
 ('companies.manage','sales','Approve company accounts, terms and credit',1);
INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
 ('owner','shipping.manage'),('super_admin','shipping.manage'),('order_manager','shipping.manage'),('inventory_manager','shipping.manage'),
 ('owner','procurement.manage'),('super_admin','procurement.manage'),('inventory_manager','procurement.manage'),
 ('owner','companies.manage'),('super_admin','companies.manage'),('sales_manager','companies.manage'),
 ('owner','crm.manage'),('super_admin','crm.manage'),('owner','support.manage'),('super_admin','support.manage'),
 ('order_manager','support.manage');
