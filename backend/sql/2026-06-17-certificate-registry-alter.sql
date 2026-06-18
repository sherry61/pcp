ALTER TABLE certificate_registry
  ADD COLUMN sign_cert_path TEXT DEFAULT NULL AFTER org,
  ADD COLUMN tls_cert_path TEXT DEFAULT NULL AFTER sign_cert_path,
  ADD COLUMN pem_path TEXT DEFAULT NULL AFTER tls_cert_path,
  ADD COLUMN address VARCHAR(128) DEFAULT NULL AFTER pem_path,
  ADD COLUMN expires_at DATETIME DEFAULT NULL AFTER address;
