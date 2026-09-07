CREATE TABLE IF NOT EXISTS tee_delivery_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id VARCHAR(64) NOT NULL,
  stage VARCHAR(64) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  duration_ms INT UNSIGNED NULL,
  remote_code INT NULL,
  details_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tee_delivery_events_transaction_created (transaction_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
