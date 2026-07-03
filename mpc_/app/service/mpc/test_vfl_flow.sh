#!/bin/bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8091/api/v1}"
TIMESTAMP=$(date +%s)
TASK_ID="vfl_task_${TIMESTAMP}"
MODEL_ID="risk_lr_${TIMESTAMP}"
LOG_FILE="vfl_test_$(date +%Y%m%d_%H%M%S).txt"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_code() {
    local response=$1
    local step=$2
    local expected=${3:-0}
    echo "$response" >> "$LOG_FILE"
    local code
    code=$(echo "$response" | sed -n 's/.*"code":[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
    if [[ "$code" != "$expected" ]]; then
        log "$step failed: code=$code expected=$expected"
        echo "$response" | tee -a "$LOG_FILE"
        exit 1
    fi
    log "$step passed"
}

json_get() {
    local json=$1
    local key=$2
    python3 -c 'import json,sys; data=json.loads(sys.argv[1]); cur=data; 
for part in sys.argv[2].split("."):
    cur=cur[part]
print(json.dumps(cur, ensure_ascii=False) if isinstance(cur, (dict, list)) else cur)' "$json" "$key"
}

log "VFL flow test started: task_id=$TASK_ID model_id=$MODEL_ID"

HEALTH=$(curl -s "$BASE_URL/health")
check_code "$HEALTH" "health"

TRAIN_RESPONSE=$(curl -s -X POST "$BASE_URL/vfl/train" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"$TASK_ID\",
    \"model_id\": \"$MODEL_ID\",
    \"participants\": [\"BANK001\", \"DC001\"],
    \"epochs\": 4,
    \"learning_rate\": 0.05,
    \"datasets\": [
      {
        \"party_id\": \"BANK001\",
        \"features\": [[0.20, 0.10], [0.80, 0.70], [0.40, 0.20], [0.90, 0.85]],
        \"labels\": [0, 1, 0, 1]
      },
      {
        \"party_id\": \"DC001\",
        \"features\": [[0.30], [0.90], [0.45], [0.95]]
      }
    ]
  }")
check_code "$TRAIN_RESPONSE" "vfl train"

PROOF=$(json_get "$TRAIN_RESPONSE" "data.training_proof")
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/vfl/verify" \
  -H "Content-Type: application/json" \
  -d "{\"training_proof\": $PROOF}")
check_code "$VERIFY_RESPONSE" "vfl verify"

AUDIT_ID=$(json_get "$VERIFY_RESPONSE" "data.audit_id")
QUERY_AUDIT_RESPONSE=$(curl -s "$BASE_URL/vfl/audit/query?audit_id=$AUDIT_ID")
check_code "$QUERY_AUDIT_RESPONSE" "query vfl audit"

QUERY_PROOF_RESPONSE=$(curl -s "$BASE_URL/vfl/audit/query?task_id=$TASK_ID")
check_code "$QUERY_PROOF_RESPONSE" "query vfl proof"

log "VFL flow test passed"
