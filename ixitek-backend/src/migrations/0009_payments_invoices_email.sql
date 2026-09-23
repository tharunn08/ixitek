-- 0009 — payments (Razorpay + manual), refunds, gateway events, invoices,
-- server-side email outbox. No card data is ever stored: only gateway IDs,
-- status, amount, currency, method and fees.

CREATE TABLE payment_intents (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id          BIGINT UNSIGNED NOT NULL,
  provider          VARCHAR(20) NOT NULL DEFAULT 'razorpay',
  provider_order_id VARCHAR(64) NOT NULL,
  amount            DECIMAL(16,2) NOT NULL,
  amount_minor      BIGINT NOT NULL,
  currency          CHAR(3) NOT NULL,
  receipt           VARCHAR(40) NOT NULL,
  status            ENUM('created','attempted','paid','expired','failed') NOT NULL DEFAULT 'created',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pi_provider_order (provider, provider_order_id),
  KEY idx_pi_order (order_id),
  CONSTRAINT fk_pi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id              BIGINT UNSIGNED NOT NULL,
  intent_id             BIGINT UNSIGNED NULL,
  provider              ENUM('razorpay','bank_transfer','purchase_order','manual') NOT NULL,
  provider_order_id     VARCHAR(64) NULL,
  provider_payment_id   VARCHAR(64) NULL,
  signature             VARCHAR(128) NULL,
  status                ENUM('created','authorized','captured','failed','refunded','partially_refunded') NOT NULL,
  amount                DECIMAL(16,2) NOT NULL,
  currency              CHAR(3) NOT NULL,
  amount_refunded       DECIMAL(16,2) NOT NULL DEFAULT 0,
  method                VARCHAR(30) NULL,
  international         TINYINT(1) NULL,
  payment_gateway_fee   DECIMAL(16,2) NULL,
  payment_gateway_tax   DECIMAL(16,2) NULL,
  merchant_payment_cost DECIMAL(16,2) NULL,
  fee_source            ENUM('gateway','estimated') NULL,
  reference             VARCHAR(120) NULL,
  error_code            VARCHAR(80) NULL,
  error_description     VARCHAR(500) NULL,
  notes                 VARCHAR(1000) NOT NULL DEFAULT '',
  recorded_by           BIGINT UNSIGNED NULL,
  verified_via          ENUM('checkout_signature','webhook','reconciliation','manual') NULL,
  paid_at               DATETIME(3) NULL,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pay_provider_payment (provider, provider_payment_id),
  KEY idx_pay_order (order_id),
  KEY idx_pay_status (status, created_at),
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_intent FOREIGN KEY (intent_id) REFERENCES payment_intents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider       VARCHAR(20) NOT NULL,
  event_id       VARCHAR(100) NOT NULL,
  event_type     VARCHAR(80) NOT NULL,
  signature_ok   TINYINT(1) NOT NULL,
  status         ENUM('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
  error          VARCHAR(1000) NULL,
  payload_json   JSON NULL,
  received_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at   DATETIME(3) NULL,
  UNIQUE KEY uq_pe_event (provider, event_id),
  KEY idx_pe_status (status, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refunds (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id         BIGINT UNSIGNED NOT NULL,
  order_id           BIGINT UNSIGNED NOT NULL,
  provider_refund_id VARCHAR(64) NULL,
  amount             DECIMAL(16,2) NOT NULL,
  currency           CHAR(3) NOT NULL,
  status             ENUM('pending','processed','failed') NOT NULL DEFAULT 'pending',
  reason             VARCHAR(500) NOT NULL,
  idempotency_key    VARCHAR(100) NOT NULL,
  error              VARCHAR(500) NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at       DATETIME(3) NULL,
  UNIQUE KEY uq_ref_idem (idempotency_key),
  UNIQUE KEY uq_ref_provider (provider_refund_id),
  KEY idx_ref_order (order_id),
  CONSTRAINT fk_ref_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ref_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoices (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_number  VARCHAR(30) NOT NULL,
  invoice_type    ENUM('proforma','tax_invoice','credit_note') NOT NULL,
  order_id        BIGINT UNSIGNED NOT NULL,
  refund_id       BIGINT UNSIGNED NULL,
  status          ENUM('issued','paid','partially_paid','void') NOT NULL DEFAULT 'issued',
  currency        CHAR(3) NOT NULL,
  subtotal        DECIMAL(16,2) NOT NULL,
  discount        DECIMAL(16,2) NOT NULL DEFAULT 0,
  freight         DECIMAL(16,2) NOT NULL DEFAULT 0,
  insurance       DECIMAL(16,2) NOT NULL DEFAULT 0,
  tax             DECIMAL(16,2) NOT NULL DEFAULT 0,
  other_charges   DECIMAL(16,2) NOT NULL DEFAULT 0,
  total           DECIMAL(16,2) NOT NULL,
  snapshot_json   JSON NOT NULL,
  issued_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  due_date        DATE NULL,
  void_reason     VARCHAR(500) NULL,
  voided_at       DATETIME(3) NULL,
  created_by      BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_inv_number (invoice_number),
  KEY idx_inv_order (order_id, invoice_type),
  CONSTRAINT fk_inv_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_messages (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template            VARCHAR(60) NOT NULL,
  to_email            VARCHAR(254) NOT NULL,
  cc_email            VARCHAR(1000) NULL,
  subject             VARCHAR(300) NOT NULL,
  body_html           MEDIUMTEXT NOT NULL,
  body_text           MEDIUMTEXT NOT NULL,
  attachments_json    JSON NULL,
  status              ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  provider            VARCHAR(20) NULL,
  provider_message_id VARCHAR(200) NULL,
  attempts            INT NOT NULL DEFAULT 0,
  last_error          VARCHAR(1000) NULL,
  related_type        VARCHAR(40) NULL,
  related_id          VARCHAR(60) NULL,
  idempotency_key     VARCHAR(150) NOT NULL,
  resend_of           BIGINT UNSIGNED NULL,
  created_by          BIGINT UNSIGNED NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at             DATETIME(3) NULL,
  UNIQUE KEY uq_em_idem (idempotency_key),
  KEY idx_em_status (status, created_at),
  KEY idx_em_related (related_type, related_id),
  KEY idx_em_to (to_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seller identity printed on invoices/quotes. Left empty on purpose: IXITEK
-- enters its registered legal details in Admin → Settings before issuing invoices.
INSERT IGNORE INTO settings (setting_key, value_json) VALUES
 ('seller.legal_name', '""'),
 ('seller.address', '""'),
 ('seller.tax_id', '""'),
 ('seller.tax_id_label', '"GSTIN"'),
 ('seller.email', '"sales@ixitek.in"'),
 ('seller.phone', '""'),
 ('seller.state_code', '""'),
 ('invoice.payment_due_days', '0'),
 ('invoice.footer_note', '""'),
 ('email.from_name', '"IXITEK"'),
 ('email.sales_inbox', '"sales@ixitek.in"');

INSERT IGNORE INTO permissions (code, module, description, is_sensitive) VALUES
 ('payments.refund','finance','Issue refunds',1),
 ('payments.record','finance','Record manual/bank-transfer payments',1),
 ('email.manage','admin','View email log and resend messages',0);
INSERT IGNORE INTO role_permissions (role_code, permission_code) VALUES
 ('owner','payments.refund'),('super_admin','payments.refund'),('finance_manager','payments.refund'),
 ('owner','payments.record'),('super_admin','payments.record'),('finance_manager','payments.record'),
 ('owner','email.manage'),('super_admin','email.manage'),('order_manager','email.manage'),('sales_manager','email.manage'),
 ('finance_manager','finance.read'),('finance_manager','finance.manage'),('finance_manager','orders.read');
