# Sample Input Files

This directory contains deterministic sample inputs that match the current HTTP JSON APIs.

## VFL

`vfl_train_500.json` is a complete request body for:

```text
POST /api/v1/vfl/train
```

It contains 500 vertically aligned samples:

- `BANK001`: 3 features and binary labels.
- `DC001`: 2 features.
- One label owner only, as required by `crypto/vfl`.

By default, VFL training requires the host Intel SGX SDK simulation runtime. Source the SDK environment before starting the service:

```bash
source /opt/intel/sgxsdk/environment
```

For legacy plaintext-gradient compatibility only, set `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true`.

Call it directly:

```bash
curl -s -X POST http://localhost:8091/api/v1/vfl/train \
  -H "Content-Type: application/json" \
  -d @app/service/mpc/data/sample_inputs/vfl_train_500.json
```

## MPC

The current MPC HTTP handlers accept one JSON object per request, not an array. For that reason the MPC samples are JSONL files: one directly callable request body per line.

`mpc_secret_sharing_500.jsonl` contains 500 request bodies for:

```text
POST /api/v1/audit/secret-sharing/split
```

Call all rows:

```bash
while IFS= read -r body; do
  curl -s -X POST http://localhost:8091/api/v1/audit/secret-sharing/split \
    -H "Content-Type: application/json" \
    -d "$body"
done < app/service/mpc/data/sample_inputs/mpc_secret_sharing_500.jsonl
```

`mpc_gc_generate_500.jsonl` contains 500 request bodies for:

```text
POST /api/v1/bank/gc/generate-task
```

Call all rows:

```bash
while IFS= read -r body; do
  curl -s -X POST http://localhost:8091/api/v1/bank/gc/generate-task \
    -H "Content-Type: application/json" \
    -d "$body"
done < app/service/mpc/data/sample_inputs/mpc_gc_generate_500.jsonl
```

GC evaluation samples are not precomputed because `/datacenter/gc/evaluate` requires the runtime `garbled_circuit` returned by `/bank/gc/generate-task` plus a valid `auth_ciphertext` and `auth_hash`.
