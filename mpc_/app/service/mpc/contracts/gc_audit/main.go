package main

import (
	"encoding/json"
	"fmt"
	"log"

	"chainmaker.org/chainmaker/contract-sdk-go/v2/pb/protogo"
	"chainmaker.org/chainmaker/contract-sdk-go/v2/sandbox"
	"chainmaker.org/chainmaker/contract-sdk-go/v2/sdk"
)

// GCAuditContract 混淆电路审计合约
type GCAuditContract struct{}

type ComputationAuditRecord struct {
	RecordID     string `json:"record_id"`
	TaskID       string `json:"task_id"`
	Method       string `json:"method"`
	ArtifactRoot string `json:"artifact_root"`
	InputRoot    string `json:"input_root"`
	OutputRoot   string `json:"output_root"`
	Status       string `json:"status"`
	Verifier     string `json:"verifier"`
	Details      string `json:"details"`
	Timestamp    string `json:"timestamp"`
}

// InitContract 初始化合约
func (gc *GCAuditContract) InitContract() protogo.Response {
	return sdk.Success([]byte("GC Audit contract initialized"))
}

// UpgradeContract 升级合约
func (gc *GCAuditContract) UpgradeContract() protogo.Response {
	return sdk.Success([]byte("GC Audit contract upgraded"))
}

// StoreCircuitCommitment 存储混淆电路承诺
func (gc *GCAuditContract) StoreCircuitCommitment() protogo.Response {
	params := sdk.Instance.GetArgs()

	taskID := string(params["task_id"])
	bankID := string(params["bank_id"])
	datacenterID := string(params["datacenter_id"])
	circuitHash := string(params["circuit_hash"])
	inputCommitmentHash := string(params["input_commitment_hash"])
	outputCommitmentHash := string(params["output_commitment_hash"])

	if taskID == "" || circuitHash == "" {
		return sdk.Error("Missing required parameters")
	}

	// 获取时间戳
	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	// 构建存储key
	key := fmt.Sprintf("GC_COMMIT_%s", taskID)

	// 构建存储数据
	commitData := map[string]string{
		"task_id":                taskID,
		"bank_id":                bankID,
		"datacenter_id":          datacenterID,
		"circuit_hash":           circuitHash,
		"input_commitment_hash":  inputCommitmentHash,
		"output_commitment_hash": outputCommitmentHash,
		"timestamp":              timestamp,
		"status":                 "committed",
	}

	data, _ := json.Marshal(commitData)

	// 存储到链上
	err = sdk.Instance.PutStateByte("gc_audit", key, data)
	if err != nil {
		return sdk.Error(fmt.Sprintf("Failed to store commitment: %v", err))
	}

	// 发出事件
	sdk.Instance.EmitEvent("CircuitCommitmentStored", []string{taskID, bankID, datacenterID})

	return sdk.Success([]byte("Circuit commitment stored successfully"))
}

// StoreITMACCommitment 存储IT-MAC承诺
func (gc *GCAuditContract) StoreITMACCommitment() protogo.Response {
	params := sdk.Instance.GetArgs()

	taskID := string(params["task_id"])
	commitmentType := string(params["commitment_type"]) // "input" 或 "output"
	commitmentHash := string(params["commitment_hash"])
	proverHash := string(params["prover_hash"])

	if taskID == "" || commitmentHash == "" {
		return sdk.Error("Missing required parameters")
	}

	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	// 构建存储key
	key := fmt.Sprintf("ITMAC_COMMIT_%s_%s", taskID, commitmentType)

	// 构建存储数据
	itmacData := map[string]string{
		"task_id":         taskID,
		"commitment_type": commitmentType,
		"commitment_hash": commitmentHash,
		"prover_hash":     proverHash,
		"timestamp":       timestamp,
	}

	data, _ := json.Marshal(itmacData)

	// 存储到链上
	err = sdk.Instance.PutStateByte("gc_audit", key, data)
	if err != nil {
		return sdk.Error(fmt.Sprintf("Failed to store IT-MAC commitment: %v", err))
	}

	// 发出事件
	sdk.Instance.EmitEvent("ITMACCommitmentStored", []string{taskID, commitmentType})

	return sdk.Success([]byte("IT-MAC commitment stored successfully"))
}

// VerifyCircuitExecution 验证电路执行的IT-MAC承诺
func (gc *GCAuditContract) VerifyCircuitExecution() protogo.Response {
	params := sdk.Instance.GetArgs()

	taskID := string(params["task_id"])
	verifierHash := string(params["verifier_hash"])
	numGates := string(params["num_gates"])

	if taskID == "" || verifierHash == "" {
		return sdk.Error("Missing required parameters")
	}

	// 获取存储的Prover哈希
	inputKey := fmt.Sprintf("ITMAC_COMMIT_%s_input", taskID)
	inputData, err := sdk.Instance.GetStateByte("gc_audit", inputKey)
	if err != nil || len(inputData) == 0 {
		return sdk.Error("Input commitment not found")
	}

	var inputCommit map[string]string
	if err := json.Unmarshal(inputData, &inputCommit); err != nil {
		return sdk.Error("Failed to parse input commitment")
	}

	proverHash := inputCommit["prover_hash"]

	// 验证Prover哈希与Verifier哈希是否匹配
	verified := proverHash == verifierHash

	// 获取时间戳
	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	// 构建验证结果
	verifyResult := map[string]interface{}{
		"task_id":       taskID,
		"verified":      verified,
		"prover_hash":   proverHash,
		"verifier_hash": verifierHash,
		"num_gates":     numGates,
		"timestamp":     timestamp,
	}

	resultData, _ := json.Marshal(verifyResult)

	return sdk.Success(resultData)
}

// StoreAuditResult 存储审计验证结果
func (gc *GCAuditContract) StoreAuditResult() protogo.Response {
	params := sdk.Instance.GetArgs()

	auditID := string(params["audit_id"])
	taskID := string(params["task_id"])
	verifyResult := string(params["verify_result"])   // "true" 或 "false"
	itmacVerified := string(params["itmac_verified"]) // "true" 或 "false"
	zkpVerified := string(params["zkp_verified"])     // "true" 或 "false"

	if auditID == "" || taskID == "" {
		return sdk.Error("Missing required parameters")
	}

	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	// 构建存储key
	key := fmt.Sprintf("AUDIT_RESULT_%s", auditID)

	// 构建审计记录
	auditRecord := map[string]string{
		"audit_id":       auditID,
		"task_id":        taskID,
		"verify_result":  verifyResult,
		"itmac_verified": itmacVerified,
		"zkp_verified":   zkpVerified,
		"timestamp":      timestamp,
		"status":         "completed",
	}

	data, _ := json.Marshal(auditRecord)

	// 存储到链上
	err = sdk.Instance.PutStateByte("gc_audit", key, data)
	if err != nil {
		return sdk.Error(fmt.Sprintf("Failed to store audit result: %v", err))
	}

	// 发出事件
	sdk.Instance.EmitEvent("AuditResultStored", []string{auditID, taskID, verifyResult})

	return sdk.Success([]byte("Audit result stored successfully"))
}

// QueryAuditLog 查询审计日志
func (gc *GCAuditContract) QueryAuditLog() protogo.Response {
	params := sdk.Instance.GetArgs()

	auditID := string(params["audit_id"])
	if auditID == "" {
		return sdk.Error("Audit ID is required")
	}

	// 查询审计结果
	key := fmt.Sprintf("AUDIT_RESULT_%s", auditID)
	data, err := sdk.Instance.GetStateByte("gc_audit", key)
	if err != nil || len(data) == 0 {
		return sdk.Error("Audit record not found")
	}

	var auditRecord map[string]string
	if err := json.Unmarshal(data, &auditRecord); err != nil {
		return sdk.Error("Failed to parse audit record")
	}

	resultData, _ := json.Marshal(auditRecord)
	return sdk.Success(resultData)
}

// QueryCircuitCommitment 查询电路承诺
func (gc *GCAuditContract) QueryCircuitCommitment() protogo.Response {
	params := sdk.Instance.GetArgs()

	taskID := string(params["task_id"])
	if taskID == "" {
		return sdk.Error("Task ID is required")
	}

	// 查询电路承诺
	key := fmt.Sprintf("GC_COMMIT_%s", taskID)
	data, err := sdk.Instance.GetStateByte("gc_audit", key)
	if err != nil || len(data) == 0 {
		return sdk.Error("Circuit commitment not found")
	}

	var commitData map[string]string
	if err := json.Unmarshal(data, &commitData); err != nil {
		return sdk.Error("Failed to parse commitment data")
	}

	resultData, _ := json.Marshal(commitData)
	return sdk.Success(resultData)
}

func (gc *GCAuditContract) StoreComputationAudit() protogo.Response {
	params := sdk.Instance.GetArgs()
	recordID := string(params["record_id"])
	taskID := string(params["task_id"])
	method := string(params["method"])
	artifactRoot := string(params["artifact_root"])
	inputRoot := string(params["input_root"])
	outputRoot := string(params["output_root"])
	status := string(params["status"])
	verifier := string(params["verifier"])
	details := string(params["details"])

	if recordID == "" || taskID == "" || method == "" || artifactRoot == "" {
		return sdk.Error("Missing required parameters")
	}

	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	key := fmt.Sprintf("COMP_AUDIT_%s", recordID)
	record := ComputationAuditRecord{
		RecordID:     recordID,
		TaskID:       taskID,
		Method:       method,
		ArtifactRoot: artifactRoot,
		InputRoot:    inputRoot,
		OutputRoot:   outputRoot,
		Status:       status,
		Verifier:     verifier,
		Details:      details,
		Timestamp:    timestamp,
	}
	data, _ := json.Marshal(record)
	if err := sdk.Instance.PutStateByte("gc_audit", key, data); err != nil {
		return sdk.Error(fmt.Sprintf("Failed to store computation audit: %v", err))
	}

	sdk.Instance.EmitEvent("ComputationAuditStored", []string{recordID, taskID, method})
	return sdk.Success([]byte("computation audit stored successfully"))
}

func (gc *GCAuditContract) QueryComputationAudit() protogo.Response {
	params := sdk.Instance.GetArgs()
	recordID := string(params["record_id"])
	if recordID == "" {
		return sdk.Error("Record ID is required")
	}
	key := fmt.Sprintf("COMP_AUDIT_%s", recordID)
	data, err := sdk.Instance.GetStateByte("gc_audit", key)
	if err != nil || len(data) == 0 {
		return sdk.Error("Computation audit not found")
	}
	return sdk.Success(data)
}

// InvokeContract 合约调用入口
func (gc *GCAuditContract) InvokeContract(method string) protogo.Response {
	switch method {
	case "StoreCircuitCommitment":
		return gc.StoreCircuitCommitment()
	case "StoreITMACCommitment":
		return gc.StoreITMACCommitment()
	case "VerifyCircuitExecution":
		return gc.VerifyCircuitExecution()
	case "StoreAuditResult":
		return gc.StoreAuditResult()
	case "QueryAuditLog":
		return gc.QueryAuditLog()
	case "QueryCircuitCommitment":
		return gc.QueryCircuitCommitment()
	case "StoreComputationAudit":
		return gc.StoreComputationAudit()
	case "QueryComputationAudit":
		return gc.QueryComputationAudit()
	default:
		return sdk.Error("invalid method")
	}
}

func main() {
	err := sandbox.Start(new(GCAuditContract))
	if err != nil {
		log.Fatal(err)
	}
}
