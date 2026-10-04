-- 交易软删除标记：卖家可移除已过期的待确认交易，记录保留
ALTER TABLE transactions
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN deleted_at DATETIME NULL;
