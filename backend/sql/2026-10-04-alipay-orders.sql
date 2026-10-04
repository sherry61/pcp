-- 支付宝沙箱支付订单表
CREATE TABLE IF NOT EXISTS alipay_orders (
  id INT NOT NULL AUTO_INCREMENT,
  out_trade_no VARCHAR(64) NOT NULL,
  trade_no VARCHAR(64) NULL,
  asset_id VARCHAR(255) NOT NULL,
  owner_id INT NULL,
  buyer_address VARCHAR(64) NOT NULL,
  seller_id INT NULL,
  seller_address VARCHAR(64) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  payload JSON NULL,
  transaction_id INT NULL,
  raw_notify TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_out_trade_no (out_trade_no),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
