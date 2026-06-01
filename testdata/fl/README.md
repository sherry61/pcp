# FL Test Data

- `top.pt`: minimal TorchScript top model for buyer upload.
- `bottom.pt`: minimal bottom model bytes for buyer upload.
- `seller_fl_batch.zip`: seller batch sample with encrypted `smashed/` and `label/` packages.

Notes:
- `seller_fl_batch.zip` was encrypted with the current PCP TEE public key from `/home/super/tr/pcp/secrets/pre/tee_public.pem`.
- If the PCP TEE key changes, regenerate this file before testing.
