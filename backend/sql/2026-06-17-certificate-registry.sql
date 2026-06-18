CREATE TABLE IF NOT EXISTS certificate_registry (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT DEFAULT NULL,
  certificate_name VARCHAR(64) NOT NULL,
  org VARCHAR(64) NOT NULL,
  sign_cert_path TEXT DEFAULT NULL,
  tls_cert_path TEXT DEFAULT NULL,
  pem_path TEXT DEFAULT NULL,
  address VARCHAR(128) DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_certificate_name (certificate_name),
  KEY idx_certificate_user (user_id),
  KEY idx_certificate_org (org),
  KEY idx_certificate_address (address),
  KEY idx_certificate_expires_at (expires_at)
);
