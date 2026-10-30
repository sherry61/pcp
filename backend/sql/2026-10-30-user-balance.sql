-- 账户余额、充值订单、余额流水
-- 余额只用于站内支付；充值走支付宝沙箱当面付。

ALTER TABLE users
  ADD COLUMN balance DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER address;

ALTER TABLE alipay_orders
  ADD COLUMN buyer_id INT NULL AFTER owner_id,
  ADD COLUMN payment_method VARCHAR(16) NOT NULL DEFAULT 'ALIPAY' AFTER status,
  ADD COLUMN balance_refunded TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_method;

CREATE TABLE IF NOT EXISTS recharge_orders (
  id INT NOT NULL AUTO_INCREMENT,
  out_trade_no VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  trade_no VARCHAR(64) NULL,
  raw_notify TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_recharge_out_trade_no (out_trade_no),
  KEY idx_recharge_user (user_id),
  KEY idx_recharge_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS balance_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(16) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  ref_no VARCHAR(64) NULL,
  remark VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_balance_user (user_id),
  KEY idx_balance_ref (ref_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
