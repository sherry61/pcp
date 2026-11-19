-- Preserve old registry records and historical order/contract snapshots.
-- The unified asset identifier is the original model SHA-256, with its actual
-- chain token retained separately for chain verification.
INSERT INTO asset_registrations
  (asset_name,asset_type,owner_address,description,algorithm,file_hash,user_id,
   industry,txperm,number,model_type,token_id,asset_category,created_at)
SELECT r.name,'一般数据',r.owner_address,r.description,'SHA2_256',r.file_hash,r.user_id,
  'WH',1,1,'COMPUTATION_MODEL',r.token_id,'计算模型',r.created_at
FROM tee_model_registrations r
WHERE r.status='REGISTERED'
  AND NOT EXISTS (SELECT 1 FROM asset_registrations a WHERE a.file_hash=r.file_hash)
  AND r.id=(SELECT MIN(r2.id) FROM tee_model_registrations r2 WHERE r2.file_hash=r.file_hash AND r2.status='REGISTERED');

-- This known historical model has no model_type marker. Do not change its
-- ownership, token, digest, or grant any account permission to use it.
UPDATE asset_registrations SET model_type='COMPUTATION_MODEL'
WHERE id=225 AND asset_name='车险客户风险评分加权模型'
  AND algorithm='SHA2_256'
  AND file_hash='f50b67964eebfc41fe7a1fe4e26f6ad6daa28723c4b9982f76fdb922a0b92339'
  AND (model_type IS NULL OR model_type='');
