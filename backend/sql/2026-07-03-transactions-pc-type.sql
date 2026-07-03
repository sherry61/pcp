ALTER TABLE transactions
  ADD COLUMN pc_type VARCHAR(32) NULL DEFAULT NULL
  COMMENT '资产交付方法/隐私计算类型，如 HE / PRE / FL / MPC / TEE'
  AFTER model_file_hash;
