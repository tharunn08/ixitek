-- 0001_core.sql — identity, RBAC, audit, settings, jobs, legacy enquiries.
-- Portable across MySQL 8 and MariaDB 10.6+. utf8mb4 everywhere.

CREATE TABLE roles (
  code        VARCHAR(40)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_staff    TINYINT(1)   NOT NULL DEFAULT 1,
  is_system   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
  code        VARCHAR(60)  NOT NULL PRIMARY KEY,
  module      VARCHAR(40)  NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_sensitive TINYINT(1)  NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role_code       VARCHAR(40) NOT NULL,
  permission_code VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_code, permission_code),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_code) REFERENCES roles(code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(150) NOT NULL,
  email              VARCHAR(254) NOT NULL,
  phone              VARCHAR(40)  NOT NULL DEFAULT '',
  company            VARCHAR(200) NOT NULL DEFAULT '',
  password_hash      VARCHAR(100) NOT NULL,
  role               VARCHAR(40)  NOT NULL DEFAULT 'customer',
  status             ENUM('active','disabled') NOT NULL DEFAULT 'active',
  email_verified_at  DATETIME(3) NULL,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until       DATETIME(3) NULL,
  password_changed_at DATETIME(3) NULL,
  last_login_at      DATETIME(3) NULL,
  last_login_ip      VARCHAR(64)  NULL,
  preferred_country  CHAR(2) NULL,
  preferred_currency CHAR(3) NULL,
  preferred_language VARCHAR(10) NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at         DATETIME(3) NULL,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_created (created_at),
  CONSTRAINT fk_users_role FOREIGN KEY (role) REFERENCES roles(code) ON UPDATE CASCADE,
  CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE enquiries (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type               ENUM('enquiry','career') NOT NULL,
  name               VARCHAR(150) NOT NULL,
  company            VARCHAR(200) NOT NULL DEFAULT '',
  email              VARCHAR(254) NOT NULL,
  phone              VARCHAR(40)  NOT NULL DEFAULT '',
  category           VARCHAR(200) NOT NULL DEFAULT '',
  message            TEXT NULL,
  page               VARCHAR(500) NOT NULL DEFAULT '',
  resume_file_name   VARCHAR(255) NOT NULL DEFAULT '',
  resume_file_size   INT NOT NULL DEFAULT 0,
  resume_mime        VARCHAR(100) NOT NULL DEFAULT '',
  resume_storage_key VARCHAR(500) NULL,
  user_id            BIGINT UNSIGNED NULL,
  status             ENUM('new','read','responded','archived') NOT NULL DEFAULT 'new',
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at         DATETIME(3) NULL,
  KEY idx_enq_type (type),
  KEY idx_enq_status (status),
  KEY idx_enq_created (created_at),
  KEY idx_enq_email (email),
  CONSTRAINT fk_enq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_email   VARCHAR(254) NULL,
  action        VARCHAR(80)  NOT NULL,
  entity_type   VARCHAR(60)  NOT NULL,
  entity_id     VARCHAR(80)  NULL,
  before_json   JSON NULL,
  after_json    JSON NULL,
  reason        VARCHAR(500) NULL,
  ip            VARCHAR(64)  NULL,
  request_id    VARCHAR(64)  NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  value_json  JSON NOT NULL,
  updated_by  BIGINT UNSIGNED NULL,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feature_flags (
  flag_key    VARCHAR(100) NOT NULL PRIMARY KEY,
  enabled     TINYINT(1) NOT NULL DEFAULT 0,
  description VARCHAR(255) NOT NULL DEFAULT '',
  rollout_pct INT NOT NULL DEFAULT 100,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Background jobs (MySQL-backed queue; Redis/BullMQ can replace the adapter later).
CREATE TABLE jobs (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type            VARCHAR(80) NOT NULL,
  payload         JSON NULL,
  status          ENUM('queued','running','succeeded','failed','dead') NOT NULL DEFAULT 'queued',
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 5,
  run_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  locked_at       DATETIME(3) NULL,
  locked_by       VARCHAR(100) NULL,
  last_error      TEXT NULL,
  result          JSON NULL,
  idempotency_key VARCHAR(190) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_jobs_idem (idempotency_key),
  KEY idx_jobs_pick (status, run_at),
  KEY idx_jobs_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stored files (uploads, résumés, documents). Bytes live in object storage / disk, never here.
CREATE TABLE files (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  storage_key  VARCHAR(500) NOT NULL,
  driver       VARCHAR(20) NOT NULL DEFAULT 'local',
  original_name VARCHAR(255) NOT NULL DEFAULT '',
  mime         VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream',
  bytes        BIGINT NOT NULL DEFAULT 0,
  sha256       CHAR(64) NULL,
  purpose      VARCHAR(40) NOT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at   DATETIME(3) NULL,
  UNIQUE KEY uq_files_key (storage_key),
  KEY idx_files_purpose (purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Maps rows copied from the legacy SQLite database (verification + idempotent re-runs).
CREATE TABLE legacy_migration_log (
  source_table VARCHAR(60) NOT NULL,
  source_id    VARCHAR(40) NOT NULL,
  target_id    BIGINT UNSIGNED NOT NULL,
  checksum     CHAR(64) NOT NULL,
  migrated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source_table, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
