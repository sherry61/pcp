package handlers

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
	"github.com/fentec-project/gofe/abe"
	"github.com/gin-gonic/gin"

	abeService "blockchain_data_auth/crypto/abe"
	"blockchain_data_auth/crypto/zkp"
	"blockchain_data_auth/models"
)

type BankHandler struct {
	chainClient    *sdk.ChainClient
	cpabe          *abeService.CPABE
	zkpSystem      *zkp.ZKPSystem
	bankID         string
	bankAttributes []string
	attribKeys     *abe.FAMEAttribKeys
	publicKey      *abe.FAMEPubKey
}

func NewBankHandler(chainClient *sdk.ChainClient) *BankHandler {
	return &BankHandler{
		chainClient: chainClient,
		bankID:      "BANK001",
		bankAttributes: []string{
			"bank_id:BANK001",
			"role:bank",
			"info_tag:credit",
			"info_tag:income",
		},
	}
}

// SetCryptoSystems 设置加密系统
func (h *BankHandler) SetCryptoSystems(cpabe *abeService.CPABE, zkpSystem *zkp.ZKPSystem,
	attribKeys *abe.FAMEAttribKeys, publicKey *abe.FAMEPubKey) {
	h.cpabe = cpabe
	h.zkpSystem = zkpSystem
	h.attribKeys = attribKeys
	h.publicKey = publicKey
}

// RequestData 银行转发授权给数据中心请求数据
func (h *BankHandler) RequestData(c *gin.Context) {
	var req models.BankDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 验证银行必须有有效的授权书才能请求数据
	if req.RequestedDataTypes == nil || len(req.RequestedDataTypes) == 0 {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "必须指定请求的数据类型",
		})
		return
	}

	// 银行不能直接获取数据，必须转发请求给数据中心
	// 这里只记录银行的数据请求意图，实际数据由数据中心提供
	
	// 生成请求哈希用于跟踪
	hashData := fmt.Sprintf("%s:%s:%s:%d",
		req.RequestID, req.BankID, req.UserID, time.Now().Unix())
	hash := sha256.Sum256([]byte(hashData))
	requestHash := hex.EncodeToString(hash[:])

	// 调用合约记录银行的数据请求意图
	kvs := []*common.KeyValuePair{
		{Key: "bank_id", Value: []byte(req.BankID)},
		{Key: "user_id", Value: []byte(req.UserID)},
		{Key: "request_hash", Value: []byte(requestHash)},
		{Key: "requested_tags", Value: []byte(fmt.Sprintf("%v", req.RequestedDataTypes))},
		{Key: "purpose", Value: []byte(req.BusinessPurpose)},
		{Key: "status", Value: []byte("pending_datacenter_verification")},
	}

	// 记录到验证合约
	_, err := h.chainClient.InvokeContract("verification", "VerifyDataAccess", "", kvs, -1, true)
	if err != nil {
		log.Printf("记录银行数据请求失败: %v", err)
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("记录数据请求失败: %v", err),
		})
		return
	}

	// 创建转发给数据中心的请求信息
	datacenterRequest := map[string]interface{}{
		"request_id":       req.RequestID,
		"request_hash":     requestHash,
		"user_id":          req.UserID,
		"bank_id":          req.BankID,
		"requested_types":  req.RequestedDataTypes,
		"business_purpose": req.BusinessPurpose,
		"next_step":        "forward_to_datacenter",
		"instruction":      "银行需要将此请求连同用户授权书一起转发给数据中心",
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "数据请求已记录，需要转发给数据中心处理",
		Data:    datacenterRequest,
	})
}

// ForwardAuthorizationToDataCenter 银行将用户授权转发给数据中心
func (h *BankHandler) ForwardAuthorizationToDataCenter(c *gin.Context) {
	var req struct {
		RequestID      string `json:"request_id" binding:"required"`
		UserID         string `json:"user_id" binding:"required"`
		BankID         string `json:"bank_id" binding:"required"`
		AuthCiphertext string `json:"auth_ciphertext" binding:"required"`
		AuthHash       string `json:"auth_hash" binding:"required"`
		RequestedTags  []string `json:"requested_tags" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 银行验证自己能否解密此授权（检查权限）
	if h.attribKeys == nil || h.publicKey == nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: "银行密钥未初始化",
		})
		return
	}

	// 尝试解密授权以验证银行有权限
	ciphertext, err := base64.StdEncoding.DecodeString(req.AuthCiphertext)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "授权密文解码失败",
		})
		return
	}

	plaintext, err := h.cpabe.Decrypt(ciphertext, h.attribKeys, h.publicKey)
	if err != nil {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: "银行无权限解密此授权，不能转发此请求",
		})
		return
	}

	var authData map[string]interface{}
	if err := json.Unmarshal(plaintext, &authData); err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: "授权数据解析失败",
		})
		return
	}

	// 记录银行转发请求到区块链
	kvs := []*common.KeyValuePair{
		{Key: "request_id", Value: []byte(req.RequestID)},
		{Key: "bank_id", Value: []byte(req.BankID)},
		{Key: "user_id", Value: []byte(req.UserID)},
		{Key: "auth_hash", Value: []byte(req.AuthHash)},
		{Key: "requested_tags", Value: []byte(fmt.Sprintf("%v", req.RequestedTags))},
		{Key: "action", Value: []byte("forward_to_datacenter")},
		{Key: "status", Value: []byte("forwarded")},
	}

	_, err = h.chainClient.InvokeContract("verification", "VerifyDataAccess", "", kvs, -1, true)
	if err != nil {
		log.Printf("记录转发请求失败: %v", err)
	}

	// 构建数据中心请求格式
	datacenterRequestData := models.DataCenterProvideRequest{
		RequestID:      req.RequestID,
		UserID:         req.UserID,
		AuthCiphertext: req.AuthCiphertext,
		RequestedTags:  req.RequestedTags,
		AuthHash:       req.AuthHash,
		DatacenterID:   "DC001", // 默认数据中心ID
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "授权已验证，已准备转发给数据中心",
		Data: map[string]interface{}{
			"forwarding_status":      "ready",
			"datacenter_request":     datacenterRequestData,
			"auth_verification":      "passed",
			"authorized_data_tags":   authData,
			"next_step":             "send_to_datacenter_api",
			"datacenter_endpoint":   "/api/v1/datacenter/provide-data",
		},
	})
}

// VerifyAuthorization 验证授权
func (h *BankHandler) VerifyAuthorization(c *gin.Context) {
	var req models.BankVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 验证ZKP（如果提供）
	zkpVerified := false
	if req.ZKPProof != "" && h.zkpSystem != nil {
		proofBytes, err := base64.StdEncoding.DecodeString(req.ZKPProof)
		if err != nil {
			log.Printf("ZKP证明base64解码失败: %v", err)
		} else {
			// 使用VerificationChallenge作为nonce，确保生成和验证时一致
			nonce := req.VerificationChallenge
			if nonce == "" {
				nonce = "default_nonce" // 提供默认值以保持兼容性
			}
			
			dataHash := zkp.GenerateDataHash(req.UserID, nonce)
			userIDHash := zkp.GenerateUserIDHash(req.UserID)

			valid, err := h.zkpSystem.VerifyProof(proofBytes, dataHash, userIDHash)
			if err != nil {
				log.Printf("ZKP验证失败: %v", err)
			} else if valid {
				zkpVerified = true
				log.Printf("ZKP验证成功")
			} else {
				log.Printf("ZKP验证未通过")
			}
		}
	}

	// 生成验证哈希
	hashData := fmt.Sprintf("%s:%s:%s:%s",
		req.AuthorizationID, req.UserID, req.BankID, req.VerificationChallenge)
	hash := sha256.Sum256([]byte(hashData))
	authHash := hex.EncodeToString(hash[:])

	// 调用合约验证
	kvs := []*common.KeyValuePair{
		{Key: "bank_id", Value: []byte(req.BankID)},
		{Key: "user_id", Value: []byte(req.UserID)},
		{Key: "auth_hash", Value: []byte(authHash)},
	}

	resp, err := h.chainClient.QueryContract("verification", "VerifyDataAccess", kvs, -1)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("验证失败: %v", err),
		})
		return
	}

	var verifyResult struct {
		Verified bool `json:"verified"`
	}
	json.Unmarshal(resp.ContractResult.Result, &verifyResult)

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "验证完成",
		Data: map[string]interface{}{
			"authorization_id": req.AuthorizationID,
			"verified":         verifyResult.Verified,
			"zkp_verified":     zkpVerified,
			"timestamp":        time.Now().Unix(),
		},
	})
}

// DecryptAuthorization 解密授权数据
func (h *BankHandler) DecryptAuthorization(c *gin.Context) {
	var req struct {
		AuthCiphertext string `json:"auth_ciphertext" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	if h.attribKeys == nil || h.publicKey == nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: "银行密钥未初始化",
		})
		return
	}

	ciphertext, err := base64.StdEncoding.DecodeString(req.AuthCiphertext)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "密文解码失败",
		})
		return
	}

	plaintext, err := h.cpabe.Decrypt(ciphertext, h.attribKeys, h.publicKey)
	if err != nil {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: fmt.Sprintf("解密失败，银行属性不满足策略: %v", err),
		})
		return
	}

	var authData map[string]interface{}
	if err := json.Unmarshal(plaintext, &authData); err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: "解析授权数据失败",
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "授权解密成功",
		Data:    authData,
	})
}

// RequestDataWithAuth 带授权的数据请求
func (h *BankHandler) RequestDataWithAuth(c *gin.Context) {
	var req models.BankRequestDataParams
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 首先解密授权密文获取用户ID和授权信息
	if h.attribKeys == nil || h.publicKey == nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: "银行密钥未初始化",
		})
		return
	}

	ciphertext, err := base64.StdEncoding.DecodeString(req.AuthCiphertext)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "授权密文解码失败",
		})
		return
	}

	plaintext, err := h.cpabe.Decrypt(ciphertext, h.attribKeys, h.publicKey)
	if err != nil {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: fmt.Sprintf("解密失败，银行属性不满足策略: %v", err),
		})
		return
	}

	var authData map[string]interface{}
	if err := json.Unmarshal(plaintext, &authData); err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: "解析授权数据失败",
		})
		return
	}

	// 从解密的授权数据中提取用户ID
	userID := ""
	if auth, ok := authData["authorization"].(map[string]interface{}); ok {
		if uid, ok := auth["user_id"].(string); ok {
			userID = uid
		}
	}

	if userID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "无法从授权数据中提取用户ID",
		})
		return
	}

	// 调用合约验证授权哈希 - 使用与存储时一致的参数
	kvs := []*common.KeyValuePair{
		{Key: "user_id", Value: []byte(userID)}, // 使用解密得到的用户ID
		{Key: "auth_hash", Value: []byte(req.AuthHash)},
	}

	_, err = h.chainClient.QueryContract("authorization", "VerifyAuthorization", kvs, -1)
	if err != nil {
		c.JSON(http.StatusForbidden, models.Response{
			Code:    403,
			Message: fmt.Sprintf("授权验证失败: %v", err),
		})
		return
	}

	// 如果查询成功，说明授权验证通过
	log.Printf("授权验证成功 - UserID: %s, AuthHash: %.20s...", userID, req.AuthHash)

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "数据请求已接受",
		Data: map[string]interface{}{
			"auth_hash":      req.AuthHash,
			"requested_tags": req.RequestedTags,
			"status":         "processing",
		},
	})
}
