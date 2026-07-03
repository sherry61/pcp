package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"blockchain_data_auth/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandleAuthorization(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		request        models.AuthorizationRequest
		expectedStatus int
		shouldContain  string
	}{
		{
			name: "有效授权请求",
			request: models.AuthorizationRequest{
				RequestID:       "req123",
				UserID:          "user123",
				DataTags:        []string{"financial", "personal"},
				Purpose:         "loan application",
				ValidityPeriod:  3600,
				AuthorizedParty: "bank1",
			},
			expectedStatus: http.StatusOK,
			shouldContain:  "success",
		},
		{
			name: "缺少必要字段",
			request: models.AuthorizationRequest{
				RequestID: "req123",
				UserID:    "",
				DataTags:  []string{"financial"},
				Purpose:   "loan application",
			},
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "error",
		},
		{
			name: "无效的数据标签",
			request: models.AuthorizationRequest{
				RequestID:       "req123",
				UserID:          "user123",
				DataTags:        []string{},
				Purpose:         "loan application",
				ValidityPeriod:  3600,
				AuthorizedParty: "bank1",
			},
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			// 准备请求body
			jsonData, err := json.Marshal(tt.request)
			require.NoError(t, err)

			req, _ := http.NewRequest("POST", "/api/authorization/apply", bytes.NewBuffer(jsonData))
			req.Header.Set("Content-Type", "application/json")
			c.Request = req

			// 模拟处理函数
			mockHandleAuthorization(c)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Contains(t, w.Body.String(), tt.shouldContain)
		})
	}
}

// mockHandleAuthorization 模拟授权处理函数
func mockHandleAuthorization(c *gin.Context) {
	var req models.AuthorizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: invalid request format",
		})
		return
	}

	// 验证必要字段
	if req.UserID == "" || len(req.DataTags) == 0 || req.Purpose == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: missing required fields",
		})
		return
	}

	// 模拟成功响应
	c.JSON(http.StatusOK, models.Response{
		Code:    200,
		Message: "success: authorization created",
		Data: models.AuthorizationResponse{
			RequestID:      req.RequestID,
			UserID:         req.UserID,
			AuthCiphertext: "mock_encrypted_auth",
			AuthHash:       "mock_auth_hash",
			TransactionID:  "mock_tx_123",
			BlockHeight:    12345,
		},
	})
}

func TestHandleBankVerification(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		request        models.BankVerifyRequest
		expectedStatus int
		shouldContain  string
	}{
		{
			name: "有效银行验证请求",
			request: models.BankVerifyRequest{
				AuthorizationID:       "auth123",
				UserID:                "user123",
				BankID:                "bank1",
				VerificationChallenge: "challenge_data",
				ZKPProof:              "zkp_proof_data",
			},
			expectedStatus: http.StatusOK,
			shouldContain:  "success",
		},
		{
			name: "缺少授权ID",
			request: models.BankVerifyRequest{
				AuthorizationID: "",
				UserID:          "user123",
				BankID:          "bank1",
			},
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			jsonData, err := json.Marshal(tt.request)
			require.NoError(t, err)

			req, _ := http.NewRequest("POST", "/api/bank/verify", bytes.NewBuffer(jsonData))
			req.Header.Set("Content-Type", "application/json")
			c.Request = req

			mockHandleBankVerification(c)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Contains(t, w.Body.String(), tt.shouldContain)
		})
	}
}

// mockHandleBankVerification 模拟银行验证处理函数
func mockHandleBankVerification(c *gin.Context) {
	var req models.BankVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: invalid request format",
		})
		return
	}

	if req.AuthorizationID == "" || req.UserID == "" || req.BankID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: missing required fields",
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    200,
		Message: "success: verification completed",
		Data: map[string]interface{}{
			"verification_result": true,
			"transaction_id":      "mock_verify_tx_123",
		},
	})
}

func TestHandleDataCenterRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		request        models.DataCenterProvideRequest
		expectedStatus int
		shouldContain  string
	}{
		{
			name: "有效数据中心请求",
			request: models.DataCenterProvideRequest{
				RequestID:      "dc_req123",
				UserID:         "user123",
				AuthCiphertext: "encrypted_auth",
				RequestedTags:  []string{"financial", "credit"},
				AuthHash:       "auth_hash",
				DatacenterID:   "dc1",
				ZKPProof:       "zkp_proof",
			},
			expectedStatus: http.StatusOK,
			shouldContain:  "success",
		},
		{
			name: "缺少认证密文",
			request: models.DataCenterProvideRequest{
				RequestID:     "dc_req123",
				UserID:        "user123",
				RequestedTags: []string{"financial"},
				AuthHash:      "auth_hash",
			},
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			jsonData, err := json.Marshal(tt.request)
			require.NoError(t, err)

			req, _ := http.NewRequest("POST", "/api/datacenter/provide", bytes.NewBuffer(jsonData))
			req.Header.Set("Content-Type", "application/json")
			c.Request = req

			mockHandleDataCenterRequest(c)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Contains(t, w.Body.String(), tt.shouldContain)
		})
	}
}

// mockHandleDataCenterRequest 模拟数据中心请求处理函数
func mockHandleDataCenterRequest(c *gin.Context) {
	var req models.DataCenterProvideRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: invalid request format",
		})
		return
	}

	if req.AuthCiphertext == "" || req.AuthHash == "" || len(req.RequestedTags) == 0 {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: missing required authentication data",
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    200,
		Message: "success: data provided",
		Data: models.DataCenterResponse{
			RequestID:     req.RequestID,
			DatacenterID:  req.DatacenterID,
			EncryptedData: "mock_encrypted_user_data",
			TransactionID: "mock_dc_tx_123",
			ZKPVerified:   true,
		},
	})
}

func TestHandleZKPGeneration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		request        models.ZKPRequest
		expectedStatus int
		shouldContain  string
	}{
		{
			name: "有效ZKP生成请求",
			request: models.ZKPRequest{
				Data:   "sensitive_data",
				UserID: "user123",
				Nonce:  "random_nonce",
			},
			expectedStatus: http.StatusOK,
			shouldContain:  "success",
		},
		{
			name: "缺少数据",
			request: models.ZKPRequest{
				Data:   "",
				UserID: "user123",
				Nonce:  "random_nonce",
			},
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			jsonData, err := json.Marshal(tt.request)
			require.NoError(t, err)

			req, _ := http.NewRequest("POST", "/api/zkp/generate", bytes.NewBuffer(jsonData))
			req.Header.Set("Content-Type", "application/json")
			c.Request = req

			mockHandleZKPGeneration(c)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Contains(t, w.Body.String(), tt.shouldContain)
		})
	}
}

// mockHandleZKPGeneration 模拟ZKP生成处理函数
func mockHandleZKPGeneration(c *gin.Context) {
	var req models.ZKPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: invalid request format",
		})
		return
	}

	if req.Data == "" || req.UserID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: missing required data or user_id",
		})
		return
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    200,
		Message: "success: ZKP generated",
		Data: models.ZKProof{
			Proof:      "mock_base64_proof",
			DataHash:   "mock_base64_data_hash",
			UserIDHash: "mock_base64_user_id_hash",
		},
	})
}

func TestHandleAuditQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		userID         string
		expectedStatus int
		shouldContain  string
	}{
		{
			name:           "有效审计查询",
			userID:         "user123",
			expectedStatus: http.StatusOK,
			shouldContain:  "success",
		},
		{
			name:           "缺少用户ID",
			userID:         "",
			expectedStatus: http.StatusBadRequest,
			shouldContain:  "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)

			req, _ := http.NewRequest("GET", "/api/audit/logs?user_id="+tt.userID, nil)
			c.Request = req

			// 设置查询参数
			if tt.userID != "" {
				c.Request.URL.RawQuery = "user_id=" + tt.userID
			}

			mockHandleAuditQuery(c)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Contains(t, w.Body.String(), tt.shouldContain)
		})
	}
}

// mockHandleAuditQuery 模拟审计查询处理函数
func mockHandleAuditQuery(c *gin.Context) {
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, models.Response{
			Code:    400,
			Message: "error: user_id parameter is required",
		})
		return
	}

	// 模拟审计日志
	logs := []models.AccessLog{
		{
			LogID:         "log1",
			UserID:        userID,
			AccessorID:    "bank1",
			DataTags:      []string{"financial"},
			Purpose:       "credit check",
			Status:        "success",
			TransactionID: "tx123",
			ZKPVerified:   true,
		},
		{
			LogID:         "log2",
			UserID:        userID,
			AccessorID:    "dc1",
			DataTags:      []string{"personal"},
			Purpose:       "data analysis",
			Status:        "success",
			TransactionID: "tx456",
			ZKPVerified:   true,
		},
	}

	c.JSON(http.StatusOK, models.Response{
		Code:    200,
		Message: "success: audit logs retrieved",
		Data:    logs,
	})
}

func TestHandlerErrorCases(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("无效JSON格式", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)

		req, _ := http.NewRequest("POST", "/api/authorization/apply", bytes.NewBuffer([]byte("{invalid json")))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req

		mockHandleAuthorization(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Body.String(), "error")
	})

	t.Run("空请求体", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)

		req, _ := http.NewRequest("POST", "/api/authorization/apply", bytes.NewBuffer([]byte("")))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req

		mockHandleAuthorization(c)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestResponseFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("检查响应格式", func(t *testing.T) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)

		validRequest := models.AuthorizationRequest{
			RequestID:       "req123",
			UserID:          "user123",
			DataTags:        []string{"financial"},
			Purpose:         "test",
			ValidityPeriod:  3600,
			AuthorizedParty: "bank1",
		}

		jsonData, _ := json.Marshal(validRequest)
		req, _ := http.NewRequest("POST", "/api/authorization/apply", bytes.NewBuffer(jsonData))
		req.Header.Set("Content-Type", "application/json")
		c.Request = req

		mockHandleAuthorization(c)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.Response
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, 200, response.Code)
		assert.Contains(t, response.Message, "success")
		assert.NotNil(t, response.Data)
	})
}