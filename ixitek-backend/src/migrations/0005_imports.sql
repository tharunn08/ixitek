-- 0005_imports.sql — catalog import batches (upload → preview → confirm → report).
CREATE TABLE import_batches (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id     CHAR(36) NOT NULL,
  kind          VARCHAR(30) NOT NULL DEFAULT 'catalog',
  file_name     VARCHAR(255) NOT NULL,
  file_bytes    INT NOT NULL,
  file_sha256   CHAR(64) NOT NULL,
  file_id       BIGINT UNSIGNED NULL,
  source_type   ENUM('xlsx','csv') NOT NULL,
  status        ENUM('preview','queued','importing','completed','failed','cancelled') NOT NULL DEFAULT 'preview',
  options_json  JSON NULL,
  summary_json  JSON NULL,
  error         TEXT NULL,
  uploaded_by   BIGINT UNSIGNED NULL,
  confirmed_by  BIGINT UNSIGNED NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at  DATETIME(3) NULL,
  completed_at  DATETIME(3) NULL,
  UNIQUE KEY uq_ib_public (public_id),
  KEY idx_ib_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE import_rows (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  batch_id    BIGINT UNSIGNED NOT NULL,
  sheet       VARCHAR(100) NOT NULL DEFAULT '',
  row_no      INT NOT NULL,
  sku         VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  action      ENUM('create','update','unchanged','duplicate','invalid','skip') NOT NULL,
  data_json   JSON NULL,
  changes_json JSON NULL,
  errors_json JSON NULL,
  warnings_json JSON NULL,
  product_id  BIGINT UNSIGNED NULL,
  result      ENUM('pending','created','updated','unchanged','linked','skipped','failed') NOT NULL DEFAULT 'pending',
  KEY idx_ir_batch (batch_id, action),
  KEY idx_ir_sku (sku),
  CONSTRAINT fk_ir_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
