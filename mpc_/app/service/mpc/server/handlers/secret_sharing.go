package handlers

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"math/big"
	"net/http"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"blockchain_data_auth/crypto/secretsharing"
	"blockchain_data_auth/models"
)

type SecretSharingHandler struct {
	chainClient *sdk.ChainClient
	ss          *secretsharing.ShamirSecretSharing
}

func NewSecretSharingHandler(chainClient *sdk.ChainClient) *SecretSharingHandler {
	ss, _ := secretsharing.NewDefaultShamirSecretSharing()
	return &SecretSharingHandler{
		chainClient: chainClient,
		ss:          ss,
	}
}

func (h *SecretSharingHandler) SplitSecret(c *gin.Context) {
	var req struct {
		TaskID    string `json:"task_id" binding:"required"`
		Secret    string `json:"secret" binding:"required"`
		Threshold int    `json:"threshold" binding:"required"`
		Shares    int    `json:"shares" binding:"required"`
		Verifier  string `json:"verifier" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{Code: 400, Message: fmt.Sprintf("请求参数错误: %v", err)})
		return
	}

	secret := new(big.Int)
	if _, ok := secret.SetString(req.Secret, 10); !ok {
		c.JSON(http.StatusBadRequest, models.Response{Code: 400, Message: "secret 必须是十进制整数"})
		return
	}

	shares, err := h.ss.Split(secret, req.Threshold, req.Shares)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{Code: 500, Message: err.Error()})
		return
	}

	encoded, err := h.ss.EncodeShares(shares)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.Response{Code: 500, Message: err.Error()})
		return
	}

	digest := sha256.Sum256(encoded)
	recordID := uuid.New().String()
	kvs := []*common.KeyValuePair{
		{Key: "record_id", Value: []byte(recordID)},
		{Key: "task_id", Value: []byte(req.TaskID)},
		{Key: "method", Value: []byte("secret_sharing")},
		{Key: "artifact_root", Value: []byte(base64.StdEncoding.EncodeToString(digest[:]))},
		{Key: "input_root", Value: []byte(base64.StdEncoding.EncodeToString([]byte(req.Secret)))},
		{Key: "output_root", Value: []byte(base64.StdEncoding.EncodeToString(encoded))},
		{Key: "status", Value: []byte("verified")},
		{Key: "verifier", Value: []byte(req.Verifier)},
		{Key: "details", Value: []byte(fmt.Sprintf("threshold=%d shares=%d", req.Threshold, req.Shares))},
	}
	_, _ = h.chainClient.InvokeContract("gc_audit", "StoreComputationAudit", "", kvs, -1, true)

	c.JSON(http.StatusOK, models.Response{
		Code:    0,
		Message: "秘密共享拆分成功",
		Data: map[string]interface{}{
			"record_id": recordID,
			"shares":    shares,
			"encoded":   string(encoded),
		},
	})
}
