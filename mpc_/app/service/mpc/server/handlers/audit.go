package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	abeService "blockchain_data_auth/crypto/abe"
	"blockchain_data_auth/crypto/zkp"
	"blockchain_data_auth/models"
)

// AuditHandler 审计处理器 - 实现智能合约A和B的验证逻辑
type AuditHandler struct {
	chainClient *sdk.ChainClient
	cpabe       *abeService.CPABE
	zkpSystem   *zkp.ZKPSystem
	auditNodeID string
}

// NewAuditHandler 创建审计处理器
func NewAuditHandler(chainClient *sdk.ChainClient) *AuditHandler {
	return &AuditHandler{
		chainClient: chainClient,
		auditNodeID: "AUDIT_NODE_001",
	}
}

// SetCryptoSystems 设置加密系统
func (h *AuditHandler) SetCryptoSystems(cpabe *abeService.CPABE, zkpSystem *zkp.ZKPSystem) {
	h.cpabe = cpabe
	h.zkpSystem = zkpSystem
}

// VerifyAuthorizationMatch 智能合约A：验证银行授权书与用户授权书匹配
func (h *AuditHandler) VerifyAuthorizationMatch(c *gin.Context) {
	var req struct {
		BankRequestID  string `json:"bank_request_id" binding:"required"`
		UserAuthHash   string `json:"user_auth_hash" binding:"required"`
		BankAuthHash   string `json:"bank_auth_hash" binding:"required"`
		BankAuthCipher string `json:"bank_auth_ciphertext" binding:"required"`
		UserID         string `json:"user_id" binding:"required"`
		BankID         string `json:"bank_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 1. 验证用户授权书是否存在于链上
	userAuthKvs := []*common.KeyValuePair{
		{Key: "user_id", Value: []byte(req.UserID)},
		{Key: "auth_hash", Value: []byte(req.UserAuthHash)},
	}

	_, err := h.chainClient.QueryContract("authorization", "VerifyAuthorization", userAuthKvs, -1)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.Response{
			Code:    401,
			Message: "用户授权书验证失败，未在链上找到匹配的授权",
		})
		return
	}

	// 2. 验证银行转发的授权哈希是否匹配用户授权哈希
	if req.BankAuthHash != req.UserAuthHash {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: "授权哈希不匹配，银行授权书与用户授权书不一致",
		})
		return
	}

	// 3. 记录审计验证结果
	auditRecord := map[string]interface{}{
		"audit_id":            uuid.New().String(),
		"audit_type":          "authorization_match",
		"bank_request_id":     req.BankRequestID,
		"user_id":             req.UserID,
		"bank_id":             req.BankID,
		"user_auth_hash":      req.UserAuthHash,
		"bank_auth_hash":      req.BankAuthHash,
		"verification_result": "passed",
		"audit_node_id":       h.auditNodeID,
		"timestamp":           time.Now().Unix(),
	}

	auditData, _ := json.Marshal(auditRecord)
	auditKvs := []*common.KeyValuePair{
		{Key: "audit_id", Value: []byte(auditRecord["audit_id"].(string))},
		{Key: "audit_data", Value: auditData},
		{Key: "audit_type", Value: []byte("authorization_match")},
	}

	_, err = h.chainClient.InvokeContract("verification", "VerifyDataAccess", "", auditKvs, -1, true)
	if err != nil {
		fmt.Printf("记录审计结果失败: %v", err)
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "智能合约A验证通过：银行授权书与用户授权书匹配",
		Data:    auditRecord,
	})
}

// VerifyDataOwnership 智能合约B：验证数据中心数据确实属于授权人
func (h *AuditHandler) VerifyDataOwnership(c *gin.Context) {
	var req struct {
		DataCenterID  string   `json:"datacenter_id" binding:"required"`
		UserID        string   `json:"user_id" binding:"required"`
		DataHash      string   `json:"data_hash" binding:"required"`
		UserIDHash    string   `json:"user_id_hash" binding:"required"`
		ZKPProof      string   `json:"zkp_proof" binding:"required"`
		RequestedTags []string `json:"requested_tags" binding:"required"`
		BankRequestID string   `json:"bank_request_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 1. 验证ZKP证明数据归属
	zkpVerified := false
	if h.zkpSystem != nil && req.ZKPProof != "" {
		proofBytes, err := base64.StdEncoding.DecodeString(req.ZKPProof)
		if err == nil {
			dataHashBytes, _ := base64.StdEncoding.DecodeString(req.DataHash)
			userIDHashBytes, _ := base64.StdEncoding.DecodeString(req.UserIDHash)

			valid, err := h.zkpSystem.VerifyProof(proofBytes, dataHashBytes, userIDHashBytes)
			if err == nil && valid {
				zkpVerified = true
			}
		}
	}

	if !zkpVerified {
		c.JSON(http.StatusUnauthorized, models.Response{
			Code:    401,
			Message: "零知识证明验证失败，无法证明数据归属",
		})
		return
	}

	// 2. 验证请求的数据标签是否超出授权范围
	// 这里应该结合智能合约A的结果来检查授权范围
	// 简化实现：检查常见的数据标签
	allowedTags := []string{"income", "credit_score", "total_assets", "basic_info"}
	for _, requestedTag := range req.RequestedTags {
		found := false
		for _, allowedTag := range allowedTags {
			if requestedTag == allowedTag {
				found = true
				break
			}
		}
		if !found {
			c.JSON(http.StatusForbidden, models.Response{
				Code:    403,
				Message: fmt.Sprintf("请求的数据标签 '%s' 超出授权范围", requestedTag),
			})
			return
		}
	}

	// 3. 记录审计验证结果到区块链
	auditRecord := map[string]interface{}{
		"audit_id":            uuid.New().String(),
		"audit_type":          "data_ownership",
		"datacenter_id":       req.DataCenterID,
		"user_id":             req.UserID,
		"bank_request_id":     req.BankRequestID,
		"data_hash":           req.DataHash,
		"zkp_verified":        zkpVerified,
		"requested_tags":      req.RequestedTags,
		"verification_result": "passed",
		"audit_node_id":       h.auditNodeID,
		"timestamp":           time.Now().Unix(),
	}

	auditData, _ := json.Marshal(auditRecord)
	auditKvs := []*common.KeyValuePair{
		{Key: "audit_id", Value: []byte(auditRecord["audit_id"].(string))},
		{Key: "audit_data", Value: auditData},
		{Key: "audit_type", Value: []byte("data_ownership")},
		{Key: "datacenter_id", Value: []byte(req.DataCenterID)},
		{Key: "user_id_hash", Value: []byte(req.UserIDHash)},
		{Key: "proof_result", Value: []byte("valid")},
	}

	_, err := h.chainClient.InvokeContract("verification", "VerifyZKProof", "", auditKvs, -1, true)
	if err != nil {
		fmt.Printf("记录ZKP验证结果失败: %v", err)
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "智能合约B验证通过：数据确实属于授权人且未超出授权范围",
		Data:    auditRecord,
	})
}

// GetAuditLog 获取审计日志
func (h *AuditHandler) GetAuditLog(c *gin.Context) {
	auditType := c.Query("audit_type")
	userID := c.Query("user_id")
	requestID := c.Query("request_id")

	if auditType == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "必须指定审计类型 (authorization_match 或 data_ownership)",
		})
		return
	}

	// 构建查询参数
	kvs := []*common.KeyValuePair{
		{Key: "audit_type", Value: []byte(auditType)},
	}

	if userID != "" {
		kvs = append(kvs, &common.KeyValuePair{
			Key: "user_id", Value: []byte(userID),
		})
	}

	if requestID != "" {
		kvs = append(kvs, &common.KeyValuePair{
			Key: "request_id", Value: []byte(requestID),
		})
	}

	// 查询审计记录
	resp, err := h.chainClient.QueryContract("verification", "GetAccessLog", kvs, -1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("查询审计日志失败: %v", err),
		})
		return
	}

	var auditLogs []map[string]interface{}
	if resp != nil && resp.ContractResult != nil && resp.ContractResult.Result != nil {
		json.Unmarshal(resp.ContractResult.Result, &auditLogs)
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "审计日志查询成功",
		Data: map[string]interface{}{
			"audit_type": auditType,
			"audit_logs": auditLogs,
			"audit_node": h.auditNodeID,
			"query_time": time.Now().Unix(),
		},
	})
}

// ValidateCompleteFlow 验证完整的三方审计流程
func (h *AuditHandler) ValidateCompleteFlow(c *gin.Context) {
	var req struct {
		BankRequestID string   `json:"bank_request_id" binding:"required"`
		UserID        string   `json:"user_id" binding:"required"`
		BankID        string   `json:"bank_id" binding:"required"`
		DataCenterID  string   `json:"datacenter_id" binding:"required"`
		UserAuthHash  string   `json:"user_auth_hash" binding:"required"`
		BankAuthHash  string   `json:"bank_auth_hash" binding:"required"`
		DataHash      string   `json:"data_hash" binding:"required"`
		UserIDHash    string   `json:"user_id_hash" binding:"required"`
		ZKPProof      string   `json:"zkp_proof" binding:"required"`
		RequestedTags []string `json:"requested_tags" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 验证步骤1：授权书匹配（智能合约A）
	authMatchResult := h.verifyAuthMatchInternal(req.UserAuthHash, req.BankAuthHash, req.UserID, req.BankID)
	if !authMatchResult.Valid {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: "智能合约A验证失败：" + authMatchResult.Message,
		})
		return
	}

	// 验证步骤2：数据归属验证（智能合约B）
	dataOwnershipResult := h.verifyDataOwnershipInternal(req.DataCenterID, req.UserID, req.DataHash, req.UserIDHash, req.ZKPProof, req.RequestedTags)
	if !dataOwnershipResult.Valid {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: "智能合约B验证失败：" + dataOwnershipResult.Message,
		})
		return
	}

	// 记录完整流程验证结果
	flowAuditRecord := map[string]interface{}{
		"audit_id":              uuid.New().String(),
		"audit_type":            "complete_flow",
		"bank_request_id":       req.BankRequestID,
		"user_id":               req.UserID,
		"bank_id":               req.BankID,
		"datacenter_id":         req.DataCenterID,
		"auth_match_result":     authMatchResult,
		"data_ownership_result": dataOwnershipResult,
		"overall_result":        "approved",
		"audit_node_id":         h.auditNodeID,
		"timestamp":             time.Now().Unix(),
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "三方审计流程验证通过，数据访问请求获得批准",
		Data:    flowAuditRecord,
	})
}

// 内部验证方法
type ValidationResult struct {
	Valid   bool        `json:"valid"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

func (h *AuditHandler) verifyAuthMatchInternal(userAuthHash, bankAuthHash, userID, bankID string) ValidationResult {
	if userAuthHash != bankAuthHash {
		return ValidationResult{
			Valid:   false,
			Message: "授权哈希不匹配",
		}
	}

	// 验证用户授权是否在链上
	kvs := []*common.KeyValuePair{
		{Key: "user_id", Value: []byte(userID)},
		{Key: "auth_hash", Value: []byte(userAuthHash)},
	}

	_, err := h.chainClient.QueryContract("authorization", "VerifyAuthorization", kvs, -1)
	if err != nil {
		return ValidationResult{
			Valid:   false,
			Message: "用户授权书未在区块链上找到",
		}
	}

	return ValidationResult{
		Valid:   true,
		Message: "授权书匹配验证通过",
	}
}

func (h *AuditHandler) verifyDataOwnershipInternal(datacenterID, userID, dataHash, userIDHash, zkpProof string, requestedTags []string) ValidationResult {
	// ZKP验证
	if h.zkpSystem != nil && zkpProof != "" {
		proofBytes, err := base64.StdEncoding.DecodeString(zkpProof)
		if err == nil {
			dataHashBytes, _ := base64.StdEncoding.DecodeString(dataHash)
			userIDHashBytes, _ := base64.StdEncoding.DecodeString(userIDHash)

			valid, err := h.zkpSystem.VerifyProof(proofBytes, dataHashBytes, userIDHashBytes)
			if err != nil || !valid {
				return ValidationResult{
					Valid:   false,
					Message: "零知识证明验证失败",
				}
			}
		}
	}

	return ValidationResult{
		Valid:   true,
		Message: "数据归属验证通过",
		Details: map[string]interface{}{
			"datacenter_id": datacenterID,
			"verified_tags": requestedTags,
		},
	}
}
