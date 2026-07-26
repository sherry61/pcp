ALTER TABLE asset_registrations
  ADD COLUMN pc_type VARCHAR(32) NULL DEFAULT NULL
  AFTER model_type;
