package handlers

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
	"github.com/fentec-project/gofe/abe"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	abeService "blockchain_data_auth/crypto/abe"
	"blockchain_data_auth/crypto/zkp"
	"blockchain_data_auth/models"
)

type AuthorizationHandler struct {
	chainClient *sdk.ChainClient
	cpabe       *abeService.CPABE
	zkpSystem   *zkp.ZKPSystem
	masterKey   *abe.FAMESecKey
	publicKey   *abe.FAMEPubKey
	userKeys    map[string]*abe.FAMEAttribKeys
}

func NewAuthorizationHandler(chainClient *sdk.ChainClient) *AuthorizationHandler {
	return &AuthorizationHandler{
		chainClient: chainClient,
		userKeys:    make(map[string]*abe.FAMEAttribKeys),
	}
}

// SetCryptoSystems 设置加密系统（由主程序调用）
func (h *AuthorizationHandler) SetCryptoSystems(cpabe *abeService.CPABE, zkpSystem *zkp.ZKPSystem,
	masterKey *abe.FAMESecKey, publicKey *abe.FAMEPubKey) {
	h.cpabe = cpabe
	h.zkpSystem = zkpSystem
	h.masterKey = masterKey
	h.publicKey = publicKey
}

// GenerateUserAttributeKeys 为已在数据中心注册的用户生成属性密钥
func (h *AuthorizationHandler) GenerateUserAttributeKeys(c *gin.Context) {
	var req struct {
		UserID     string   `json:"user_id" binding:"required"`
		Attributes []string `json:"attributes" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 为用户生成CP-ABE属性密钥
	userAttributes := append(req.Attributes, fmt.Sprintf("user_id:%s", req.UserID))
	attribKeys, err := h.cpabe.GenerateAttribKeys(userAttributes, h.masterKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("生成属性密钥失败: %v", err),
		})
		return
	}

	// 存储用户密钥
	h.userKeys[req.UserID] = attribKeys

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "用户属性密钥生成成功",
		Data: map[string]interface{}{
			"user_id":    req.UserID,
			"attributes": userAttributes,
			"note":       "用户现在可以创建授权书",
		},
	})
}

// RequestAuthorization 请求授权
func (h *AuthorizationHandler) RequestAuthorization(c *gin.Context) {
	var req models.AuthorizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 创建授权对象 - 不需要验证ZKP，因为这是用户自主行为
	// ZKP应该由数据中心在提供数据时生成和验证

	// 创建授权对象
	auth := &models.Authorization{
		ID:              uuid.New().String(),
		UserID:          req.UserID,
		InfoTags:        req.DataTags,
		Purpose:         req.Purpose,
		ValidityPeriod:  req.ValidityPeriod,
		AuthorizedParty: req.AuthorizedParty,
		CreatedAt:       time.Now().Unix(),
	}

	// 生成CP-ABE策略
	policy := abeService.GeneratePolicy(auth)

	// 创建授权数据
	authData := map[string]interface{}{
		"authorization": auth,
		"timestamp":     time.Now().Unix(),
	}

	authDataJSON, _ := json.Marshal(authData)

	// 使用CP-ABE加密授权数据
	authCiphertext, err := h.cpabe.Encrypt(authDataJSON, policy, h.publicKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("加密授权失败: %v", err),
		})
		return
	}

	// 生成授权哈希
	hash := sha256.Sum256(authDataJSON)
	authHash := hex.EncodeToString(hash[:])

	// 将密文转换为base64字符串
	authCiphertextStr := base64.StdEncoding.EncodeToString(authCiphertext)

	// 调用合约存储授权
	kvs := []*common.KeyValuePair{
		{Key: "user_id", Value: []byte(req.UserID)},
		{Key: "auth_hash", Value: []byte(authHash)},
		{Key: "policy", Value: []byte(policy)},
		{Key: "valid_until", Value: []byte(fmt.Sprintf("%d", time.Now().Add(time.Duration(req.ValidityPeriod)*time.Second).Unix()))},
	}

	resp, err := h.chainClient.InvokeContract("authorization", "StoreAuthorization", "", kvs, -1, true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("存储授权失败: %v", err),
		})
		return
	}

	response := models.AuthorizationResponse{
		RequestID:      req.RequestID,
		UserID:         req.UserID,
		AuthCiphertext: authCiphertextStr,
		AuthHash:       authHash,
		TransactionID:  resp.TxId,
		BlockHeight:    resp.TxBlockHeight,
		Policy:         policy,
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "授权成功",
		Data:    response,
	})
}

// GenerateZKProof 生成零知识证明
func (h *AuthorizationHandler) GenerateZKProof(c *gin.Context) {
	var req models.ZKPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: fmt.Sprintf("请求参数错误: %v", err),
		})
		return
	}

	// 生成哈希值
	dataHash := zkp.GenerateDataHash(req.Data, req.Nonce)
	userIDHash := zkp.GenerateUserIDHash(req.UserID)

	// 转换为base64字符串
	dataHashStr := base64.StdEncoding.EncodeToString(dataHash)
	userIDHashStr := base64.StdEncoding.EncodeToString(userIDHash)

	// 检查ZKP系统是否可用
	if h.zkpSystem == nil {
		c.JSON(http.StatusServiceUnavailable, models.Response{
			Code:    503,
			Message: "ZKP系统未初始化，无法生成证明",
		})
		return
	}

	// 尝试生成真实的零知识证明
	proof, err := h.zkpSystem.GenerateProof(req.Data, req.UserID, dataHash, userIDHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{
			Code:    500,
			Message: fmt.Sprintf("ZKP生成失败: %v", err),
		})
		return
	}

	// 成功生成真实证明
	proofStr := base64.StdEncoding.EncodeToString(proof)
	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "ZKP生成成功",
		Data: models.ZKProof{
			Proof:      proofStr,
			DataHash:   dataHashStr,
			UserIDHash: userIDHashStr,
		},
	})
}
