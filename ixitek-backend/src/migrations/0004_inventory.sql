-- 0004_inventory.sql — ERP-lite inventory. Every change to a stock bucket is
-- written to stock_movements (an append-only ledger) in the same transaction.
CREATE TABLE warehouses (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(30) NOT NULL,
  name         VARCHAR(150) NOT NULL,
  country_code CHAR(2) NULL,
  city         VARCHAR(100) NOT NULL DEFAULT '',
  address      VARCHAR(500) NOT NULL DEFAULT '',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  is_default   TINYINT(1) NOT NULL DEFAULT 0,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_wh_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_levels (
  product_id    BIGINT UNSIGNED NOT NULL,
  warehouse_id  BIGINT UNSIGNED NOT NULL,
  on_hand       INT NOT NULL DEFAULT 0,
  reserved      INT NOT NULL DEFAULT 0,
  incoming      INT NOT NULL DEFAULT 0,
  damaged       INT NOT NULL DEFAULT 0,
  reorder_point INT NULL,
  reorder_qty   INT NULL,
  bin_location  VARCHAR(60) NOT NULL DEFAULT '',
  version       INT NOT NULL DEFAULT 0,
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (product_id, warehouse_id),
  KEY idx_inv_wh (warehouse_id),
  CONSTRAINT fk_inv_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_wh FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  CONSTRAINT ck_inv_nonneg CHECK (on_hand >= 0 AND reserved >= 0 AND incoming >= 0 AND damaged >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_movements (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id      BIGINT UNSIGNED NOT NULL,
  warehouse_id    BIGINT UNSIGNED NOT NULL,
  movement_type   ENUM('receipt','adjustment_in','adjustment_out','count','damage','damage_writeoff','transfer_in','transfer_out','reserve','release','ship','return','incoming','incoming_cancel') NOT NULL,
  bucket          ENUM('on_hand','reserved','incoming','damaged') NOT NULL,
  quantity        INT NOT NULL,
  balance_after   INT NOT NULL,
  reason          VARCHAR(500) NOT NULL DEFAULT '',
  reference_type  VARCHAR(40) NULL,
  reference_id    VARCHAR(80) NULL,
  idempotency_key VARCHAR(190) NULL,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sm_idem (idempotency_key),
  KEY idx_sm_prod (product_id, created_at),
  KEY idx_sm_wh (warehouse_id, created_at),
  KEY idx_sm_ref (reference_type, reference_id),
  CONSTRAINT fk_sm_prod FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sm_wh FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
