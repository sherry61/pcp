ALTER TABLE digital_contracts
  ADD COLUMN pc_type VARCHAR(32) NULL DEFAULT NULL
  COMMENT '隐私计算类型，如 HE / PRE / FL'
  AFTER processing_type;
