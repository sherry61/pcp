package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"blockchain_data_auth/crypto/vfl"
	"blockchain_data_auth/models"
	"blockchain_data_auth/server/audit"
)

type VFLHandler struct {
	chainClient *sdk.ChainClient
	auditClient *audit.AuditClient
	taskEvents  map[string]string
	proofs      map[string]vfl.TrainingProof
	results     map[string]vfl.TrainResult
}

func NewVFLHandler(chainClient *sdk.ChainClient, auditClient *audit.AuditClient) *VFLHandler {
	return &VFLHandler{
		chainClient: chainClient,
		auditClient: auditClient,
		taskEvents:  make(map[string]string),
		proofs:      make(map[string]vfl.TrainingProof),
		results:     make(map[string]vfl.TrainResult),
	}
}

func (h *VFLHandler) Train(c *gin.Context) {
	var req vfl.TrainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	eventID := h.createAuditEvent(req.TaskID, req.ModelID, req.Participants)
	h.addAuditLog(req.TaskID, 1, "纵向联邦训练开始", fmt.Sprintf("任务%s: 参与方=%v epoch=%d", req.TaskID, req.Participants, req.Epochs))

	result, err := vfl.Train(req)
	if err != nil {
		h.addAuditLog(req.TaskID, 99, "纵向联邦训练失败", err.Error())
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("纵向联邦学习训练失败: %v", err),
		})
		return
	}

	if eventID != "" {
		h.taskEvents[req.TaskID] = eventID
	}
	h.proofs[req.TaskID] = result.TrainingProof
	h.results[req.TaskID] = result

	txID, blockHeight, err := h.storeTrainingProof(result.TrainingProof)
	if err != nil {
		h.addAuditLog(req.TaskID, 99, "训练证明上链失败", err.Error())
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("训练完成但证明上链失败: %v", err),
		})
		return
	}

	h.addAuditLog(req.TaskID, 2, "训练证明已上链", fmt.Sprintf("dataset_root=%s model_hash=%s proof_root=%s tx=%s", result.DatasetRoot, result.ModelHash, result.ProofRoot, txID))

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "纵向联邦学习训练完成",
		Data: map[string]interface{}{
			"task_id":        result.TaskID,
			"model_id":       result.ModelID,
			"weights":        result.Weights,
			"accuracy":       result.Accuracy,
			"final_loss":     result.FinalLoss,
			"dataset_root":   result.DatasetRoot,
			"model_hash":     result.ModelHash,
			"proof_root":     result.ProofRoot,
			"training_proof": result.TrainingProof,
			"transaction_id": txID,
			"block_height":   blockHeight,
		},
	})
}

func (h *VFLHandler) Verify(c *gin.Context) {
	var req struct {
		TaskID        string            `json:"task_id"`
		TrainingProof vfl.TrainingProof `json:"training_proof"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	proof := req.TrainingProof
	if proof.TaskID == "" && req.TaskID != "" {
		if storedProof, ok := h.proofs[req.TaskID]; ok {
			proof = storedProof
		}
	}
	if proof.TaskID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "必须提供training_proof或可查询的task_id",
		})
		return
	}

	verifyResult := vfl.VerifyProof(proof)
	if !verifyResult.Verified {
		h.addAuditLog(proof.TaskID, 98, "训练证明本地验证失败", fmt.Sprintf("reasons=%v", verifyResult.Reasons))
		c.JSON(http.StatusUnprocessableEntity, models.Response{
			Code:    422,
			Message: "训练证明验证失败",
			Data:    verifyResult,
		})
		return
	}

	auditID := uuid.New().String()
	txID, blockHeight, err := h.verifyOnChain(auditID, proof, verifyResult)
	if err != nil {
		h.addAuditLog(proof.TaskID, 99, "训练证明链上验证失败", err.Error())
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("链上验证失败: %v", err),
			Data:    verifyResult,
		})
		return
	}

	h.addAuditLog(proof.TaskID, 3, "训练证明链上验证完成", fmt.Sprintf("audit_id=%s tx=%s verified=%t", auditID, txID, verifyResult.Verified))

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "纵向联邦学习证明验证完成",
		Data: map[string]interface{}{
			"audit_id":       auditID,
			"task_id":        proof.TaskID,
			"model_id":       proof.ModelID,
			"verified":       verifyResult.Verified,
			"dataset_root":   verifyResult.DatasetRoot,
			"model_hash":     verifyResult.ModelHash,
			"proof_root":     verifyResult.ProofRoot,
			"round_count":    verifyResult.RoundCount,
			"transaction_id": txID,
			"block_height":   blockHeight,
			"timestamp":      time.Now().Unix(),
		},
	})
}

func (h *VFLHandler) QueryAudit(c *gin.Context) {
	auditID := c.Query("audit_id")
	taskID := c.Query("task_id")
	if auditID == "" && taskID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "必须提供audit_id或task_id",
		})
		return
	}

	method := "QueryVFLAudit"
	kvs := []*common.KeyValuePair{}
	if auditID != "" {
		kvs = append(kvs, &common.KeyValuePair{Key: "audit_id", Value: []byte(auditID)})
	} else {
		method = "QueryVFLProof"
		kvs = append(kvs, &common.KeyValuePair{Key: "task_id", Value: []byte(taskID)})
	}

	resp, err := h.chainClient.QueryContract("vfl_audit", method, kvs, -1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("查询VFL审计记录失败: %v", err),
		})
		return
	}
	if resp.ContractResult.Code != 0 {
		c.JSON(http.StatusNotFound, models.Response{
			Code:    404,
			Message: fmt.Sprintf("VFL审计记录未找到: %s", string(resp.ContractResult.Message)),
		})
		return
	}

	var record map[string]interface{}
	if err := json.Unmarshal(resp.ContractResult.Result, &record); err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("解析VFL审计记录失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "VFL审计记录查询成功",
		Data:    record,
	})
}

func (h *VFLHandler) createAuditEvent(taskID, modelID string, participants []string) string {
	if h.auditClient == nil || !h.auditClient.IsEnabled() {
		return ""
	}
	ids := make([]int, len(participants))
	for i := range participants {
		ids[i] = 5 + i
	}
	eventID, err := h.auditClient.CreateEvent(3, fmt.Sprintf("VFL Task: %s/%s", taskID, modelID), ids)
	if err != nil {
		fmt.Printf("[Audit] VFL创建审计事件失败: %v\n", err)
		return ""
	}
	h.taskEvents[taskID] = eventID
	return eventID
}

func (h *VFLHandler) addAuditLog(taskID string, status int, statusName, content string) {
	if h.auditClient == nil || !h.auditClient.IsEnabled() {
		return
	}
	eventID := h.taskEvents[taskID]
	if eventID == "" {
		return
	}
	if err := h.auditClient.AddAuditLog(eventID, status, statusName, content); err != nil {
		fmt.Printf("[Audit] VFL添加审计日志失败: %v\n", err)
	}
}

func (h *VFLHandler) storeTrainingProof(proof vfl.TrainingProof) (string, uint64, error) {
	proofBytes, err := json.Marshal(proof)
	if err != nil {
		return "", 0, err
	}
	kvs := []*common.KeyValuePair{
		{Key: "task_id", Value: []byte(proof.TaskID)},
		{Key: "model_id", Value: []byte(proof.ModelID)},
		{Key: "dataset_root", Value: []byte(proof.DatasetRoot)},
		{Key: "model_hash", Value: []byte(proof.ModelHash)},
		{Key: "proof_root", Value: []byte(proof.ProofRoot)},
		{Key: "round_count", Value: []byte(fmt.Sprintf("%d", len(proof.Rounds)))},
		{Key: "sample_count", Value: []byte(fmt.Sprintf("%d", proof.SampleCount))},
		{Key: "learning_rate_scaled", Value: []byte(fmt.Sprintf("%d", proof.LearningRateScaled))},
		{Key: "proof_json", Value: proofBytes},
	}
	resp, err := h.chainClient.InvokeContract("vfl_audit", "StoreVFLProof", "", kvs, -1, true)
	if err != nil {
		return "", 0, err
	}
	if resp.Code != 0 {
		return "", 0, fmt.Errorf("合约执行失败: %s", resp.Message)
	}
	return resp.TxId, resp.TxBlockHeight, nil
}

func (h *VFLHandler) verifyOnChain(auditID string, proof vfl.TrainingProof, verifyResult vfl.VerificationResult) (string, uint64, error) {
	proofBytes, err := json.Marshal(proof)
	if err != nil {
		return "", 0, err
	}
	reasons, _ := json.Marshal(verifyResult.Reasons)
	kvs := []*common.KeyValuePair{
		{Key: "audit_id", Value: []byte(auditID)},
		{Key: "task_id", Value: []byte(proof.TaskID)},
		{Key: "model_id", Value: []byte(proof.ModelID)},
		{Key: "dataset_root", Value: []byte(proof.DatasetRoot)},
		{Key: "model_hash", Value: []byte(proof.ModelHash)},
		{Key: "proof_root", Value: []byte(proof.ProofRoot)},
		{Key: "verified", Value: []byte(fmt.Sprintf("%t", verifyResult.Verified))},
		{Key: "monotonic_loss", Value: []byte(fmt.Sprintf("%t", verifyResult.MonotonicLoss))},
		{Key: "gradient_linked", Value: []byte(fmt.Sprintf("%t", verifyResult.GradientLinked))},
		{Key: "round_count", Value: []byte(fmt.Sprintf("%d", verifyResult.RoundCount))},
		{Key: "sample_count", Value: []byte(fmt.Sprintf("%d", verifyResult.SampleCount))},
		{Key: "reasons", Value: reasons},
		{Key: "proof_json", Value: proofBytes},
	}
	resp, err := h.chainClient.InvokeContract("vfl_audit", "VerifyVFLProof", "", kvs, -1, true)
	if err != nil {
		return "", 0, err
	}
	if resp.Code != 0 {
		return "", 0, fmt.Errorf("合约执行失败: %s", resp.Message)
	}
	return resp.TxId, resp.TxBlockHeight, nil
}
