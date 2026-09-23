-- 0007_monitoring.sql — operational events for Admin → Monitoring.
CREATE TABLE system_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type  VARCHAR(60) NOT NULL,
  message     VARCHAR(1000) NOT NULL DEFAULT '',
  meta_json   JSON NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_se_type (event_type, created_at),
  KEY idx_se_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (code, module, description, is_sensitive) VALUES ('monitoring.read','admin','View system health and error events',0);
INSERT INTO role_permissions (role_code, permission_code) VALUES ('owner','monitoring.read'),('super_admin','monitoring.read');
