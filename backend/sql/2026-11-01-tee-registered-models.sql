CREATE TABLE IF NOT EXISTS tee_model_registrations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  owner_address VARCHAR(128) NOT NULL,
  name VARCHAR(120) NOT NULL,
  version VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  token_id VARCHAR(128) NOT NULL UNIQUE,
  chain_contract VARCHAR(128) NOT NULL,
  chain_tx_id VARCHAR(128) NULL,
  chain_confirmation_tx_id VARCHAR(128) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tee_model_version (user_id,name,version),
  KEY idx_tee_model_owner (user_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @db_name=DATABASE();
SET @sql=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='transactions' AND column_name='model_registration_id')=0,
  'ALTER TABLE transactions ADD COLUMN model_registration_id CHAR(36) NULL','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='transactions' AND column_name='model_snapshot_json')=0,
  'ALTER TABLE transactions ADD COLUMN model_snapshot_json LONGTEXT NULL','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='digital_contracts' AND column_name='model_registration_id')=0,
  'ALTER TABLE digital_contracts ADD COLUMN model_registration_id CHAR(36) NULL','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql=IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='digital_contracts' AND column_name='model_snapshot_json')=0,
  'ALTER TABLE digital_contracts ADD COLUMN model_snapshot_json LONGTEXT NULL','SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
