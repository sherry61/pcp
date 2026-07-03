ALTER TABLE pre_delivery_contracts
  ADD COLUMN current_attempt_id VARCHAR(128) DEFAULT NULL AFTER business_contract_id,
  ADD COLUMN seller_source_public_key JSON DEFAULT NULL AFTER buyer_public_key,
  ADD COLUMN reencryption_key JSON DEFAULT NULL AFTER seller_source_public_key;

ALTER TABLE pre_delivery_contracts
  ADD UNIQUE KEY uniq_pre_pcp_contract (pcp_contract_id);
