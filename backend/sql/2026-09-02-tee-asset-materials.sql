-- TEE 资产登记阶段持久化的 data/weight 文件
-- 主库：r01_prod
CREATE TABLE IF NOT EXISTS tee_asset_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id VARCHAR(255) NOT NULL,
  seller_address VARCHAR(255) NULL,
  data_file_path VARCHAR(1024) NULL,
  data_file_name VARCHAR(255) NULL,
  data_file_hash CHAR(64) NULL,
  data_file_size BIGINT UNSIGNED NULL,
  weight_file_path VARCHAR(1024) NULL,
  weight_file_name VARCHAR(255) NULL,
  weight_file_hash CHAR(64) NULL,
  weight_file_size BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tee_asset_materials_asset (asset_id),
  KEY idx_tee_asset_materials_seller (seller_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db_name = DATABASE();
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='buyer_public_key_pem')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN buyer_public_key_pem LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='buyer_private_key_pem')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN buyer_private_key_pem LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='weight_key_envelope')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN weight_key_envelope LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='data_public_key_pem')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN data_public_key_pem LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='data_private_key_pem')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN data_private_key_pem LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='weight_public_key_pem')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN weight_public_key_pem LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='weight_private_key_pem')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN weight_private_key_pem LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
