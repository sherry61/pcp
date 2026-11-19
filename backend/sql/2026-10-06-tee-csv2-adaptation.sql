-- CSV2 delivery lifecycle: attestation audit and persisted post-export cleanup.
-- Idempotent: safe to apply more than once to the selected database.

SET @db_name = DATABASE();

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='attestation_json')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN attestation_json LONGTEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='cleanup_status')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN cleanup_status VARCHAR(32) NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='cleanup_scheduled_at')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN cleanup_scheduled_at DATETIME NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='cleanup_started_at')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN cleanup_started_at DATETIME NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='cleanup_finished_at')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN cleanup_finished_at DATETIME NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=@db_name AND table_name='delivery_secure_jobs' AND column_name='cleanup_error')=0,
  'ALTER TABLE delivery_secure_jobs ADD COLUMN cleanup_error TEXT NULL', 'SELECT 1'); PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
