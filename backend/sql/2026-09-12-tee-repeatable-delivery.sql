-- TEE 可重复交付 + 交付详情
-- 主库：r01_prod
--   mysql -uroot -p r01_prod < 2026-09-12-tee-repeatable-delivery.sql
--
-- 回滚（人工执行，按需）：
--   DROP TABLE IF EXISTS tee_delivery_attempts;
--   ALTER TABLE delivery_secure_jobs
--     DROP COLUMN buyer_weight_file_path,
--     DROP COLUMN buyer_weight_file_name,
--     DROP COLUMN buyer_weight_file_hash,
--     DROP COLUMN buyer_weight_file_size,
--     DROP COLUMN requested_at,
--     DROP COLUMN current_attempt_id;

CREATE TABLE IF NOT EXISTS tee_delivery_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id VARCHAR(64) NOT NULL,
  asset_id VARCHAR(255) NULL,
  attempt_no INT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
  step VARCHAR(64) NULL,
  vm_id VARCHAR(128) NULL,
  weight_source VARCHAR(32) NULL,
  weight_file_name VARCHAR(255) NULL,
  error_message TEXT NULL,
  triggered_by VARCHAR(255) NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tee_delivery_attempts_tx_no (transaction_id, attempt_no),
  KEY idx_tee_delivery_attempts_tx (transaction_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db_name = DATABASE();
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='buyer_weight_file_path')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN buyer_weight_file_path VARCHAR(1024) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='buyer_weight_file_name')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN buyer_weight_file_name VARCHAR(255) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='buyer_weight_file_hash')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN buyer_weight_file_hash CHAR(64) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='buyer_weight_file_size')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN buyer_weight_file_size BIGINT UNSIGNED NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='requested_at')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN requested_at TIMESTAMP NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='current_attempt_id')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN current_attempt_id BIGINT UNSIGNED NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
