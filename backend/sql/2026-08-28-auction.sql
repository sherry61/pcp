-- 拍卖挂牌配置。交易方式属于每次挂牌记录，固定价资产使用 fixed。
ALTER TABLE asset_registrations
  ADD COLUMN trade_mode VARCHAR(16) NOT NULL DEFAULT 'fixed',
  ADD COLUMN auction_start_price INT NULL,
  ADD COLUMN auction_end_time DATETIME NULL,
  ADD COLUMN auction_current_price INT NULL,
  ADD COLUMN auction_bid_count INT NOT NULL DEFAULT 0,
  ADD COLUMN auction_status VARCHAR(16) NULL;

ALTER TABLE resalable_assets
  ADD COLUMN trade_mode VARCHAR(16) NOT NULL DEFAULT 'fixed',
  ADD COLUMN auction_start_price INT NULL,
  ADD COLUMN auction_end_time DATETIME NULL,
  ADD COLUMN auction_current_price INT NULL,
  ADD COLUMN auction_bid_count INT NOT NULL DEFAULT 0,
  ADD COLUMN auction_status VARCHAR(16) NULL;

CREATE TABLE IF NOT EXISTS auction_bids (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  asset_file_hash VARCHAR(255) NOT NULL,
  bidder_user_id VARCHAR(255) NOT NULL,
  bid_price INT NOT NULL,
  bid_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_auction_bid (asset_file_hash, bidder_user_id, bid_time),
  KEY idx_auction_asset_time (asset_file_hash, bid_time)
);
