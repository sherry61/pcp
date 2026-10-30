-- 资产数量作为可售库存：
-- 1) number 表示当前剩余可售数量；售罄为 0。
-- 2) transactions.stock_reserved 标记该订单是否已占用库存，用于拒绝/软删除时回补。
-- 可重复执行。

UPDATE asset_registrations SET number = 1 WHERE number IS NULL OR number < 0;
ALTER TABLE asset_registrations MODIFY COLUMN number INT NOT NULL DEFAULT 1;

SET @db_name = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = @db_name AND table_name = 'transactions' AND column_name = 'stock_reserved') = 0,
  'ALTER TABLE transactions ADD COLUMN stock_reserved TINYINT(1) NOT NULL DEFAULT 0 AFTER delivery_limit',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
