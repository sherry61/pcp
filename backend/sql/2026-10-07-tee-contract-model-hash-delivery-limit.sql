-- TEE 数字合约约定交付次数。
-- 历史记录保持 NULL：不能把购买数量 quantity_limit 错当成交付次数。

SET @db_name = DATABASE();

-- 老库可能尚未添加模型摘要；必须先于 AFTER model_file_hash 的额度列执行。
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = @db_name AND table_name = 'transactions' AND column_name = 'model_file_hash') = 0,
  'ALTER TABLE transactions ADD COLUMN model_file_hash CHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = @db_name AND table_name = 'digital_contracts' AND column_name = 'model_file_hash') = 0,
  'ALTER TABLE digital_contracts ADD COLUMN model_file_hash CHAR(64) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = @db_name AND table_name = 'transactions' AND column_name = 'delivery_limit') = 0,
  'ALTER TABLE transactions ADD COLUMN delivery_limit INT UNSIGNED NULL AFTER model_file_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = @db_name AND table_name = 'digital_contracts' AND column_name = 'delivery_limit') = 0,
  'ALTER TABLE digital_contracts ADD COLUMN delivery_limit INT UNSIGNED NULL AFTER model_file_hash',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
