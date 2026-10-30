-- 代理库存/代销：所有者把一部分可售数量委托给代理人
-- asset_registrations.number 始终表示“所有者自己还能卖多少”，
-- 代理数量在授权时从该字段预扣，保证总数守恒。

CREATE TABLE IF NOT EXISTS asset_delegations (
  id INT NOT NULL AUTO_INCREMENT,
  asset_id VARCHAR(255) NOT NULL,
  owner_id INT NOT NULL,
  owner_address VARCHAR(64) NOT NULL,
  agent_user_id INT NOT NULL,
  agent_address VARCHAR(64) NOT NULL,
  quantity_total INT NOT NULL,
  quantity_remaining INT NOT NULL,
  allowed_rights VARCHAR(255) NULL,
  price DECIMAL(10,2) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_delegation_asset (asset_id),
  KEY idx_delegation_agent (agent_user_id, status),
  KEY idx_delegation_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE transactions
  ADD COLUMN delegation_id INT NULL,
  ADD COLUMN seller_type VARCHAR(16) NOT NULL DEFAULT 'OWNER',
  ADD COLUMN owner_address VARCHAR(64) NULL,
  ADD COLUMN chain_transfer_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN chain_transferred_at DATETIME NULL;
