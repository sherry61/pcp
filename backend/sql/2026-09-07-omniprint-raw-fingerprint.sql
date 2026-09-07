-- Preserve the raw, urlsafe-base64 OmniPrint value separately from file_hash.
-- file_hash/token_id may be sanitized or hashed for ChainMaker compatibility,
-- so they cannot be used for OmniPrint similarity comparison.
ALTER TABLE asset_registrations
  ADD COLUMN omniprint_fingerprint VARCHAR(1024) NULL AFTER token_id,
  ADD COLUMN omniprint_fingerprint_bits SMALLINT UNSIGNED NULL AFTER omniprint_fingerprint,
  ADD COLUMN omniprint_modality VARCHAR(16) NULL AFTER omniprint_fingerprint_bits,
  ADD COLUMN omniprint_source VARCHAR(32) NULL AFTER omniprint_modality,
  ADD COLUMN omniprint_generated_at DATETIME NULL AFTER omniprint_source;

CREATE INDEX idx_asset_registrations_omniprint
  ON asset_registrations (omniprint_modality, omniprint_fingerprint_bits);
