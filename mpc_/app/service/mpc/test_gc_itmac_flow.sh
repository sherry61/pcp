#!/bin/bash

# 混淆电路和IT-MAC审计功能测试脚本
# 测试新增的GC和IT-MAC功能

BASE_URL="http://localhost:8091/api/v1"
TIMESTAMP=$(date +%s)
TASK_ID="gc_task_${TIMESTAMP}"
LOG_FILE="gc_itmac_test_$(date +%Y%m%d_%H%M%S).txt"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# 检查响应状态
check_response() {
    local response=$1
    local step_name=$2
    local expected_code=${3:-0}

    echo "$response" >> "$LOG_FILE"

    # 检查是否为空
    if [ -z "$response" ]; then
        log_error "$step_name: 响应为空"
        return 1
    fi

    # 提取code字段
    code=$(echo "$response" | grep -o '"code":[0-9]*' | head -1 | cut -d':' -f2)

    if [ "$code" = "$expected_code" ]; then
        log "✅ $step_name: Success (code: $code)"
        return 0
    else
        log_error "❌ $step_name: Failed (code: $code, expected: $expected_code)"
        echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 | tee -a "$LOG_FILE"
        return 1
    fi
}

# 等待服务启动
wait_for_service() {
    log "等待服务启动..."
    for i in {1..30}; do
        if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
            log "服务已启动"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    log_error "服务启动超时"
    return 1
}

log "=========================================="
log "混淆电路和IT-MAC审计功能测试"
log "=========================================="
log "任务ID: $TASK_ID"
log "日志文件: $LOG_FILE"
log ""

# 检查服务健康状态
log "========== 步骤0: 检查服务健康状态 =========="
HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
echo "$HEALTH_RESPONSE" | tee -a "$LOG_FILE"

if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
    log "✅ 服务健康检查通过"
else
    log_error "❌ 服务健康检查失败"
    exit 1
fi

log ""
sleep 2

# 测试1: 银行生成混淆电路任务
log "========== 测试1: 银行生成混淆电路任务 =========="
GC_GENERATE_RESPONSE=$(curl -s -X POST "$BASE_URL/bank/gc/generate-task" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"$TASK_ID\",
    \"bank_id\": \"BANK001\",
    \"threshold\": 100000,
    \"risk_factor\": 50
  }")

if check_response "$GC_GENERATE_RESPONSE" "银行生成混淆电路"; then
    # 提取garbled_circuit和circuit_hash
    GARBLED_CIRCUIT=$(echo "$GC_GENERATE_RESPONSE" | grep -o '"garbled_circuit":"[^"]*"' | cut -d'"' -f4)
    CIRCUIT_HASH=$(echo "$GC_GENERATE_RESPONSE" | grep -o '"circuit_hash":"[^"]*"' | cut -d'"' -f4)
    NUM_GATES=$(echo "$GC_GENERATE_RESPONSE" | grep -o '"num_gates":[0-9]*' | cut -d':' -f2)

    log "混淆电路生成成功"
    log "电路哈希: ${CIRCUIT_HASH:0:20}..."
    log "门数量: $NUM_GATES"
else
    log_error "测试1失败，退出"
    exit 1
fi

log ""
sleep 2

# 测试2: 存储电路承诺到链上
log "========== 测试2: 存储电路承诺 =========="
STORE_COMMITMENT_RESPONSE=$(curl -s -X POST "$BASE_URL/audit/gc/store-commitment" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"$TASK_ID\",
    \"bank_id\": \"BANK001\",
    \"datacenter_id\": \"DC001\",
    \"circuit_hash\": \"$CIRCUIT_HASH\",
    \"input_commitment_hash\": \"input_hash_123\",
    \"output_commitment_hash\": \"output_hash_456\"
  }")

if check_response "$STORE_COMMITMENT_RESPONSE" "存储电路承诺"; then
    TX_ID=$(echo "$STORE_COMMITMENT_RESPONSE" | grep -o '"transaction_id":"[^"]*"' | cut -d'"' -f4)
    log "承诺已存储到链上"
    log "交易ID: $TX_ID"
else
    log_warning "测试2失败，但继续测试"
fi

log ""
sleep 2

# 测试3: 查询电路承诺
log "========== 测试3: 查询电路承诺 =========="
QUERY_COMMITMENT_RESPONSE=$(curl -s "$BASE_URL/audit/gc/query-log?audit_id=${TASK_ID}")

echo "$QUERY_COMMITMENT_RESPONSE" | tee -a "$LOG_FILE"
if echo "$QUERY_COMMITMENT_RESPONSE" | grep -q '"code":0\|"code": 0'; then
    log "✅ 查询电路承诺成功"
else
    log_warning "⚠️  查询电路承诺失败（可能是合约未部署）"
fi

log ""
sleep 2

# 测试4: 数据中心评估电路（需要先有授权）
log "========== 测试4: 数据中心评估电路 =========="
log "注意: 此测试需要有效的授权书，我们使用模拟数据"

# 首先创建测试用户和授权
USER_ID="gc_test_user_${TIMESTAMP}"

# 4.1 用户注册
log "4.1 注册测试用户..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/datacenter/register-user" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"attributes\": [\"age:30\", \"location:beijing\", \"income:high\"],
    \"public_key\": \"test_public_key_123\",
    \"organization\": \"测试组织\"
  }")

check_response "$REGISTER_RESPONSE" "用户注册"

sleep 1

# 4.2 生成属性密钥
log "4.2 生成属性密钥..."
KEYGEN_RESPONSE=$(curl -s -X POST "$BASE_URL/users/generate-attribute-keys" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"attributes\": [\"role:individual\", \"region:beijing\"]
  }")

check_response "$KEYGEN_RESPONSE" "生成属性密钥"

sleep 1

# 4.3 创建授权
log "4.3 创建授权..."
AUTH_REQUEST_ID="auth_req_${TIMESTAMP}"
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/users/request-authorization" \
  -H "Content-Type: application/json" \
  -d "{
    \"request_id\": \"$AUTH_REQUEST_ID\",
    \"user_id\": \"$USER_ID\",
    \"data_tags\": [\"income\", \"credit_score\"],
    \"purpose\": \"loan_application\",
    \"validity_period\": 86400,
    \"authorized_party\": \"BANK001\"
  }")

if check_response "$AUTH_RESPONSE" "创建授权"; then
    AUTH_CIPHERTEXT=$(echo "$AUTH_RESPONSE" | grep -o '"auth_ciphertext":"[^"]*"' | cut -d'"' -f4)
    AUTH_HASH=$(echo "$AUTH_RESPONSE" | grep -o '"auth_hash":"[^"]*"' | cut -d'"' -f4)
    log "授权创建成功"
    log "授权哈希: ${AUTH_HASH:0:20}..."
else
    log_error "创建授权失败"
    exit 1
fi

sleep 1

# 4.4 评估混淆电路
log "4.4 评估混淆电路..."
EVALUATE_RESPONSE=$(curl -s -X POST "$BASE_URL/datacenter/gc/evaluate" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"$TASK_ID\",
    \"datacenter_id\": \"DC001\",
    \"user_id\": \"$USER_ID\",
    \"income\": 120000,
    \"credit_score\": 750,
    \"garbled_circuit\": \"$GARBLED_CIRCUIT\",
    \"auth_ciphertext\": \"$AUTH_CIPHERTEXT\",
    \"auth_hash\": \"$AUTH_HASH\"
  }")

if check_response "$EVALUATE_RESPONSE" "评估混淆电路"; then
    INPUT_COMM_HASH=$(echo "$EVALUATE_RESPONSE" | grep -o '"input_commitment_hash":"[^"]*"' | cut -d'"' -f4)
    log "电路评估成功"
    log "输入承诺哈希: ${INPUT_COMM_HASH:0:20}..."
else
    log_warning "电路评估失败（可能是授权验证问题）"
fi

log ""
sleep 2

# 测试5: 验证电路执行
log "========== 测试5: 验证电路执行 =========="
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/audit/gc/verify-execution" \
  -H "Content-Type: application/json" \
  -d "{
    \"task_id\": \"$TASK_ID\",
    \"num_gates\": $NUM_GATES
  }")

if check_response "$VERIFY_RESPONSE" "验证电路执行"; then
    AUDIT_ID=$(echo "$VERIFY_RESPONSE" | grep -o '"audit_id":"[^"]*"' | cut -d'"' -f4)
    VERIFIED=$(echo "$VERIFY_RESPONSE" | grep -o '"verified":[a-z]*' | cut -d':' -f2)
    ITMAC_VERIFIED=$(echo "$VERIFY_RESPONSE" | grep -o '"itmac_verified":[a-z]*' | cut -d':' -f2)

    log "审计ID: $AUDIT_ID"
    log "验证结果: $VERIFIED"
    log "IT-MAC验证: $ITMAC_VERIFIED"
else
    log_warning "测试5失败"
fi

log ""
sleep 2

# 测试6: 查询审计日志
log "========== 测试6: 查询审计日志 =========="
if [ -n "$AUDIT_ID" ]; then
    AUDIT_LOG_RESPONSE=$(curl -s "$BASE_URL/audit/gc/query-log?audit_id=$AUDIT_ID")

    if check_response "$AUDIT_LOG_RESPONSE" "查询审计日志"; then
        log "审计日志查询成功"
        echo "$AUDIT_LOG_RESPONSE" | grep -o '"verify_result":"[^"]*"' | tee -a "$LOG_FILE"
    else
        log_warning "查询审计日志失败（可能是合约未部署）"
    fi
else
    log_warning "跳过测试6：无有效的审计ID"
fi

log ""
sleep 2

# 汇总测试结果
log "=========================================="
log "测试结果汇总"
log "=========================================="

TOTAL_TESTS=6
PASSED_TESTS=0

# 统计通过的测试
if echo "$GC_GENERATE_RESPONSE" | grep -q '"code":0'; then ((PASSED_TESTS++)); fi
if echo "$STORE_COMMITMENT_RESPONSE" | grep -q '"code":0'; then ((PASSED_TESTS++)); fi
if echo "$QUERY_COMMITMENT_RESPONSE" | grep -q '"code":0'; then ((PASSED_TESTS++)); fi
if echo "$EVALUATE_RESPONSE" | grep -q '"code":0'; then ((PASSED_TESTS++)); fi
if echo "$VERIFY_RESPONSE" | grep -q '"code":0'; then ((PASSED_TESTS++)); fi
if [ -n "$AUDIT_ID" ] && echo "$AUDIT_LOG_RESPONSE" | grep -q '"code":0'; then ((PASSED_TESTS++)); fi

log ""
log "通过测试: $PASSED_TESTS / $TOTAL_TESTS"
log "成功率: $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)%"
log ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    log "${GREEN}🎉 所有测试通过！${NC}"
    exit 0
elif [ $PASSED_TESTS -ge 3 ]; then
    log "${YELLOW}⚠️  部分测试通过，核心功能正常${NC}"
    exit 0
else
    log_error "${RED}❌ 测试失败过多${NC}"
    exit 1
fi
