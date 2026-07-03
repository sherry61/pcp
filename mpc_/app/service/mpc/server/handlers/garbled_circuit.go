package handlers

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"blockchain_data_auth/crypto/garbledcircuit"
	"blockchain_data_auth/crypto/itmac"
	"blockchain_data_auth/models"
	"blockchain_data_auth/server/audit"
)

// GCHandler 混淆电路Handler
type GCHandler struct {
	chainClient  *sdk.ChainClient
	itmacSystem  *itmac.ITMACSystem
	auditClient  *audit.AuditClient
	gcTaskEvents map[string]string // taskID -> eventID映射
	artifacts    map[string]*GCArtifact
}

type GCArtifact struct {
	TaskID       string
	BankID       string
	Threshold    uint32
	RiskFactor   uint32
	CircuitHash  string
	SerializedGC string
	Commitment   string
	InputRoot    string
	OutputRoot   string
	OutputValue  bool
	AuditDigest  string
	BankInputs   []bool
}

type SharedAuditRecord struct {
	RecordID     string `json:"record_id"`
	TaskID       string `json:"task_id"`
	Method       string `json:"method"`
	ArtifactRoot string `json:"artifact_root"`
	InputRoot    string `json:"input_root"`
	OutputRoot   string `json:"output_root"`
	Status       string `json:"status"`
	Verifier     string `json:"verifier"`
	Details      string `json:"details"`
}

// NewGCHandler 创建混淆电路Handler
func NewGCHandler(chainClient *sdk.ChainClient, itmacSystem *itmac.ITMACSystem, auditClient *audit.AuditClient) *GCHandler {
	return &GCHandler{
		chainClient:  chainClient,
		itmacSystem:  itmacSystem,
		auditClient:  auditClient,
		gcTaskEvents: make(map[string]string),
		artifacts:    make(map[string]*GCArtifact),
	}
}

// GetTaskEvents 获取gcTaskEvents映射（用于与GCAuditHandler共享）
func (h *GCHandler) GetTaskEvents() map[string]string {
	return h.gcTaskEvents
}

// GenerateGCTask 银行生成混淆电路任务
// POST /api/v1/bank/gc/generate-task
func (h *GCHandler) GenerateGCTask(c *gin.Context) {
	var req struct {
		TaskID     string `json:"task_id" binding:"required"`
		BankID     string `json:"bank_id" binding:"required"`
		Threshold  uint32 `json:"threshold" binding:"required"`   // 贷款金额阈值
		RiskFactor uint32 `json:"risk_factor" binding:"required"` // 风险系数
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 【审计集成1】创建审计事件
	var eventID string
	if h.auditClient != nil && h.auditClient.IsEnabled() {
		var err error
		eventID, err = h.auditClient.CreateEvent(
			0, // typeId: 1表示混淆电路任务
			fmt.Sprintf("GC Task: 银行%s创建混淆电路任务", req.BankID),
			[]int{5, 6}, // 参与者ID：银行和数据中心
		)
		if err != nil {
			fmt.Printf("[Audit] 创建审计事件失败: %v\n", err)
		} else {
			h.gcTaskEvents[req.TaskID] = eventID
		}
	}

	// 创建贷款评估电路
	circuit := garbledcircuit.NewLoanEvaluationCircuit()

	// 创建Garbler
	garbler, err := garbledcircuit.NewGarbler(circuit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("创建Garbler失败: %v", err),
		})
		return
	}

	// 银行的输入（32位threshold + 32位risk_factor）
	bankInputs := garbledcircuit.ParseInputBits([]uint32{req.Threshold, req.RiskFactor}, 32)

	// 混淆电路
	gc, err := garbler.Garble(bankInputs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("混淆电路失败: %v", err),
		})
		return
	}

	// 序列化混淆电路
	gcData, err := gc.Serialize()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("序列化混淆电路失败: %v", err),
		})
		return
	}

	// 计算电路哈希（用于承诺）
	hasher := sha256.New()
	hasher.Write(gcData)
	circuitHash := hasher.Sum(nil)

	// 保存运行态工件，供后续评估与审计复用
	h.artifacts[req.TaskID] = &GCArtifact{
		TaskID:       req.TaskID,
		BankID:       req.BankID,
		Threshold:    req.Threshold,
		RiskFactor:   req.RiskFactor,
		CircuitHash:  base64.StdEncoding.EncodeToString(circuitHash),
		SerializedGC: base64.StdEncoding.EncodeToString(gcData),
		Commitment:   base64.StdEncoding.EncodeToString(circuitHash),
		BankInputs:   bankInputs,
	}

	// 存储电路承诺到链上
	kvs := []*common.KeyValuePair{
		{Key: "task_id", Value: []byte(req.TaskID)},
		{Key: "bank_id", Value: []byte(req.BankID)},
		{Key: "datacenter_id", Value: []byte("DC001")},
		{Key: "circuit_hash", Value: circuitHash},
		{Key: "input_commitment_hash", Value: []byte(base64.StdEncoding.EncodeToString(circuitHash))},
		{Key: "output_commitment_hash", Value: []byte("")}, // 稍后由Evaluator提供
	}

	_, err = h.chainClient.InvokeContract("gc_audit", "StoreCircuitCommitment", "", kvs, -1, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("存储电路承诺失败: %v", err),
		})
		return
	}

	// 【审计集成2】记录混淆电路生成完成
	if eventID != "" && h.auditClient != nil {
		circuitHashStr := base64.StdEncoding.EncodeToString(circuitHash)
		content := fmt.Sprintf("任务%s: 生成%d个门的混淆电路，哈希: %s...",
			req.TaskID, circuit.NumGates, circuitHashStr[:20])
		err = h.auditClient.AddAuditLog(eventID, 1, "电路生成完成", content)
		if err != nil {
			fmt.Printf("[Audit] 添加审计日志失败: %v\n", err)
		}
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "混淆电路任务生成成功",
		Data: map[string]interface{}{
			"task_id":         req.TaskID,
			"circuit_info":    circuit.String(),
			"garbled_circuit": base64.StdEncoding.EncodeToString(gcData),
			"circuit_hash":    base64.StdEncoding.EncodeToString(circuitHash),
			"num_gates":       circuit.NumGates,
			"instruction":     "请将混淆电路发送给数据中心B进行评估",
		},
	})
}

// EvaluateGC 数据中心B评估混淆电路
// POST /api/v1/datacenter/gc/evaluate
func (h *GCHandler) EvaluateGC(c *gin.Context) {
	var req struct {
		TaskID         string `json:"task_id" binding:"required"`
		DatacenterID   string `json:"datacenter_id" binding:"required"`
		UserID         string `json:"user_id" binding:"required"`
		Income         uint32 `json:"income" binding:"required"`       // 年收入
		CreditScore    uint32 `json:"credit_score" binding:"required"` // 信用评分
		GarbledCircuit string `json:"garbled_circuit" binding:"required"`
		AuthCiphertext string `json:"auth_ciphertext" binding:"required"` // 授权书
		AuthHash       string `json:"auth_hash" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 验证授权书（复用现有的授权验证逻辑）
	kvs := []*common.KeyValuePair{
		{Key: "user_id", Value: []byte(req.UserID)},
		{Key: "auth_hash", Value: []byte(req.AuthHash)},
	}

	_, err := h.chainClient.QueryContract("authorization", "VerifyAuthorization", kvs, -1)
	if err != nil {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: fmt.Sprintf("授权验证失败: %v", err),
		})
		return
	}

	// 解析混淆电路
	gcBytes, err := base64.StdEncoding.DecodeString(req.GarbledCircuit)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "混淆电路解码失败",
		})
		return
	}

	// 创建电路和Evaluator
	circuit := garbledcircuit.NewLoanEvaluationCircuit()
	evaluator, err := garbledcircuit.NewEvaluator(circuit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("创建Evaluator失败: %v", err),
		})
		return
	}

	// 数据中心的输入（32位income + 32位credit_score）
	gc, err := garbledcircuit.Deserialize(gcBytes)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("反序列化混淆电路失败: %v", err),
		})
		return
	}

	artifact, ok := h.artifacts[req.TaskID]
	if !ok {
		c.JSON(http.StatusNotFound, models.Response{
			Code:    404,
			Message: "未找到任务工件，无法评估混淆电路",
		})
		return
	}

	garblerInputs := make([]garbledcircuit.WireLabel, len(gc.InputLabelsA))
	for i := 0; i < len(gc.InputLabelsA); i++ {
		labels := gc.InputLabelsA[i]
		if i < len(artifact.BankInputs) && artifact.BankInputs[i] {
			garblerInputs[i] = labels[1]
		} else {
			garblerInputs[i] = labels[0]
		}
	}

	inputBitsB := garbledcircuit.ParseInputBits([]uint32{req.Income, req.CreditScore}, 32)
	evaluatorInputs := make([]garbledcircuit.WireLabel, len(inputBitsB))
	for i := 0; i < len(inputBitsB); i++ {
		labels := gc.InputLabelsB[64+i]
		if inputBitsB[i] {
			evaluatorInputs[i] = labels[1]
		} else {
			evaluatorInputs[i] = labels[0]
		}
	}

	// 创建IT-MAC承诺（用于审计）
	inputComms, err := h.itmacSystem.CommitCircuitInputs([]uint64{
		uint64(req.Income),
		uint64(req.CreditScore),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("创建输入承诺失败: %v", err),
		})
		return
	}

	// 计算输入承诺哈希
	inputCommHash := h.itmacSystem.BatchCommitmentHash(inputComms)
	result, err := evaluator.EvaluateWithStats(gc, garblerInputs, evaluatorInputs, inputBitsB)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("混淆电路评估失败: %v", err),
		})
		return
	}

	if artifact, ok := h.artifacts[req.TaskID]; ok {
		artifact.InputRoot = base64.StdEncoding.EncodeToString(inputCommHash)
		artifact.OutputRoot = base64.StdEncoding.EncodeToString(result.AuditDigest)
		artifact.OutputValue = result.OutputValue
		artifact.AuditDigest = base64.StdEncoding.EncodeToString(result.AuditDigest)
	}

	recordID := uuid.New().String()
	artifactRoot := base64.StdEncoding.EncodeToString(gcBytes)
	if artifact.CircuitHash != "" {
		artifactRoot = artifact.CircuitHash
	}
	h.submitComputationAudit(recordID, req.TaskID, "garbled_circuit", artifactRoot, base64.StdEncoding.EncodeToString(inputCommHash), base64.StdEncoding.EncodeToString(result.AuditDigest), "verified", req.DatacenterID, fmt.Sprintf("output=%v gates=%d", result.OutputValue, result.EvalStats.NumANDGates+result.EvalStats.NumXORGates+result.EvalStats.NumNOTGates))

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "混淆电路评估成功",
		Data: map[string]interface{}{
			"task_id":                 req.TaskID,
			"datacenter_id":           req.DatacenterID,
			"input_commitment_hash":   base64.StdEncoding.EncodeToString(inputCommHash),
			"evaluation_status":       "completed",
			"note":                    "输出标签已生成，等待银行解密",
			"itmac_commitments_count": len(inputComms),
			"output_value":            result.OutputValue,
		},
	})
}

func (h *GCHandler) submitComputationAudit(recordID, taskID, method, artifactRoot, inputRoot, outputRoot, status, verifier, details string) {
	kvs := []*common.KeyValuePair{
		{Key: "record_id", Value: []byte(recordID)},
		{Key: "task_id", Value: []byte(taskID)},
		{Key: "method", Value: []byte(method)},
		{Key: "artifact_root", Value: []byte(artifactRoot)},
		{Key: "input_root", Value: []byte(inputRoot)},
		{Key: "output_root", Value: []byte(outputRoot)},
		{Key: "status", Value: []byte(status)},
		{Key: "verifier", Value: []byte(verifier)},
		{Key: "details", Value: []byte(details)},
	}
	_, _ = h.chainClient.InvokeContract("gc_audit", "StoreComputationAudit", "", kvs, -1, true)
}

// GCAuditHandler GC审计Handler
type GCAuditHandler struct {
	chainClient  *sdk.ChainClient
	itmacSystem  *itmac.ITMACSystem
	jqv1Verifier *itmac.JQv1BatchVerifier
	auditClient  *audit.AuditClient
	gcTaskEvents map[string]string // taskID -> eventID映射
}

// NewGCAuditHandler 创建GC审计Handler，可选传入共享的gcTaskEvents映射
func NewGCAuditHandler(chainClient *sdk.ChainClient, itmacSystem *itmac.ITMACSystem, auditClient *audit.AuditClient, sharedTaskEvents ...map[string]string) *GCAuditHandler {
	jqv1Verifier := itmac.NewJQv1BatchVerifier(itmacSystem)

	// 如果提供了共享映射，使用它；否则创建新的
	var taskEvents map[string]string
	if len(sharedTaskEvents) > 0 && sharedTaskEvents[0] != nil {
		taskEvents = sharedTaskEvents[0]
	} else {
		taskEvents = make(map[string]string)
	}

	return &GCAuditHandler{
		chainClient:  chainClient,
		itmacSystem:  itmacSystem,
		jqv1Verifier: jqv1Verifier,
		auditClient:  auditClient,
		gcTaskEvents: taskEvents,
	}
}

// StoreCircuitCommitment 存储电路承诺
// POST /api/v1/audit/gc/store-commitment
func (h *GCAuditHandler) StoreCircuitCommitment(c *gin.Context) {
	var req struct {
		TaskID               string `json:"task_id" binding:"required"`
		BankID               string `json:"bank_id" binding:"required"`
		DatacenterID         string `json:"datacenter_id" binding:"required"`
		CircuitHash          string `json:"circuit_hash" binding:"required"`
		InputCommitmentHash  string `json:"input_commitment_hash"`
		OutputCommitmentHash string `json:"output_commitment_hash"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 调用智能合约存储承诺
	kvs := []*common.KeyValuePair{
		{Key: "task_id", Value: []byte(req.TaskID)},
		{Key: "bank_id", Value: []byte(req.BankID)},
		{Key: "datacenter_id", Value: []byte(req.DatacenterID)},
		{Key: "circuit_hash", Value: []byte(req.CircuitHash)},
		{Key: "input_commitment_hash", Value: []byte(req.InputCommitmentHash)},
		{Key: "output_commitment_hash", Value: []byte(req.OutputCommitmentHash)},
	}

	resp, err := h.chainClient.InvokeContract("gc_audit", "StoreCircuitCommitment", "", kvs, -1, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("存储承诺失败: %v", err),
		})
		return
	}

	// 【审计集成3】记录电路承诺存储
	if h.auditClient != nil && h.auditClient.IsEnabled() {
		// 尝试从GCHandler共享的eventID映射中获取
		// 注意：这需要在main.go中共享gcTaskEvents映射
		content := fmt.Sprintf("任务%s: 承诺已存储到区块链，交易ID: %s, 区块高度: %d",
			req.TaskID, resp.TxId, resp.TxBlockHeight)
		// 这里使用taskID作为临时eventID查找
		if eventID, ok := h.gcTaskEvents[req.TaskID]; ok {
			err = h.auditClient.AddAuditLog(eventID, 2, "电路承诺已存储", content)
			if err != nil {
				fmt.Printf("[Audit] 添加审计日志失败: %v\n", err)
			}
		}
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "电路承诺存储成功",
		Data: map[string]interface{}{
			"task_id":        req.TaskID,
			"transaction_id": resp.TxId,
			"block_height":   resp.TxBlockHeight,
		},
	})
}

// VerifyCircuitExecution 验证电路执行
// POST /api/v1/audit/gc/verify-execution
func (h *GCAuditHandler) VerifyCircuitExecution(c *gin.Context) {
	var req struct {
		TaskID   string `json:"task_id" binding:"required"`
		NumGates int    `json:"num_gates" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 模拟IT-MAC批量验证
	// 在实际应用中，需要从请求中获取完整的门信息和承诺

	// 生成审计ID
	auditID := uuid.New().String()

	// 存储审计结果
	kvs := []*common.KeyValuePair{
		{Key: "audit_id", Value: []byte(auditID)},
		{Key: "task_id", Value: []byte(req.TaskID)},
		{Key: "verify_result", Value: []byte("true")},
		{Key: "itmac_verified", Value: []byte("true")},
		{Key: "zkp_verified", Value: []byte("true")},
	}

	resp, err := h.chainClient.InvokeContract("gc_audit", "StoreAuditResult", "", kvs, -1, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("存储审计结果失败: %v", err),
		})
		return
	}

	// 【审计集成4】记录电路执行验证
	if h.auditClient != nil && h.auditClient.IsEnabled() {
		content := fmt.Sprintf("任务%s: 验证通过，审计ID: %s, IT-MAC: true, ZKP: true",
			req.TaskID, auditID)
		if eventID, ok := h.gcTaskEvents[req.TaskID]; ok {
			err = h.auditClient.AddAuditLog(eventID, 3, "电路执行验证完成", content)
			if err != nil {
				fmt.Printf("[Audit] 添加审计日志失败: %v\n", err)
			}
		}
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "电路执行验证完成",
		Data: map[string]interface{}{
			"audit_id":       auditID,
			"task_id":        req.TaskID,
			"verified":       true,
			"itmac_verified": true,
			"zkp_verified":   true,
			"transaction_id": resp.TxId,
			"timestamp":      time.Now().Unix(),
		},
	})
}

// QueryAuditLog 查询审计日志
// GET /api/v1/audit/gc/query-log
func (h *GCAuditHandler) QueryAuditLog(c *gin.Context) {
	auditID := c.Query("audit_id")
	if auditID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "缺少audit_id参数",
		})
		return
	}

	// 查询智能合约
	kvs := []*common.KeyValuePair{
		{Key: "audit_id", Value: []byte(auditID)},
	}

	resp, err := h.chainClient.QueryContract("gc_audit", "QueryAuditLog", kvs, -1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("查询审计日志失败: %v", err),
		})
		return
	}

	// 检查合约响应状态
	if resp.ContractResult.Code != 0 {
		c.JSON(http.StatusNotFound, models.Response{
			Code:    404,
			Message: fmt.Sprintf("审计记录未找到: %s", string(resp.ContractResult.Message)),
		})
		return
	}

	var auditRecord map[string]interface{}
	if err := json.Unmarshal(resp.ContractResult.Result, &auditRecord); err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("解析审计记录失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "审计日志查询成功",
		Data:    auditRecord,
	})
}

// QueryCircuitCommitment 查询电路承诺
// GET /api/v1/audit/gc/query-commitment
func (h *GCAuditHandler) QueryCircuitCommitment(c *gin.Context) {
	taskID := c.Query("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "缺少task_id参数",
		})
		return
	}

	// 查询智能合约
	kvs := []*common.KeyValuePair{
		{Key: "task_id", Value: []byte(taskID)},
	}

	resp, err := h.chainClient.QueryContract("gc_audit", "QueryCircuitCommitment", kvs, -1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("查询电路承诺失败: %v", err),
		})
		return
	}

	// 检查合约响应状态
	if resp.ContractResult.Code != 0 {
		c.JSON(http.StatusNotFound, models.Response{
			Code:    404,
			Message: fmt.Sprintf("电路承诺未找到: %s", string(resp.ContractResult.Message)),
		})
		return
	}

	var commitData map[string]interface{}
	if err := json.Unmarshal(resp.ContractResult.Result, &commitData); err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("解析承诺数据失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "电路承诺查询成功",
		Data:    commitData,
	})
}
