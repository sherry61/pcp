package models

import (
	"encoding/json"
	"testing"
	"time"

	"blockchain_data_auth/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponse(t *testing.T) {
	tests := []struct {
		name     string
		response models.Response
		expected string
	}{
		{
			name: "成功响应",
			response: models.Response{
				Code:    200,
				Message: "success",
				Data:    map[string]string{"result": "ok"},
			},
			expected: `{"code":200,"message":"success","data":{"result":"ok"}}`,
		},
		{
			name: "错误响应",
			response: models.Response{
				Code:    400,
				Message: "bad request",
			},
			expected: `{"code":400,"message":"bad request"}`,
		},
		{
			name: "空数据响应",
			response: models.Response{
				Code:    200,
				Message: "success",
				Data:    nil,
			},
			expected: `{"code":200,"message":"success"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData, err := json.Marshal(tt.response)
			assert.NoError(t, err)
			assert.JSONEq(t, tt.expected, string(jsonData))

			// 测试反序列化
			var parsed models.Response
			err = json.Unmarshal(jsonData, &parsed)
			assert.NoError(t, err)
			assert.Equal(t, tt.response.Code, parsed.Code)
			assert.Equal(t, tt.response.Message, parsed.Message)
		})
	}
}

func TestUserRegisterRequest(t *testing.T) {
	request := models.UserRegisterRequest{
		UserID:       "user123",
		Attributes:   []string{"role:customer", "level:gold"},
		PublicKey:    "public_key_content",
		Organization: "org1",
	}

	// 测试JSON序列化
	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)
	assert.Contains(t, string(jsonData), "user123")
	assert.Contains(t, string(jsonData), "role:customer")

	// 测试JSON反序列化
	var parsed models.UserRegisterRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.UserID, parsed.UserID)
	assert.Equal(t, request.Attributes, parsed.Attributes)
	assert.Equal(t, request.PublicKey, parsed.PublicKey)
	assert.Equal(t, request.Organization, parsed.Organization)
}

func TestAuthorization(t *testing.T) {
	now := time.Now().Unix()
	auth := models.Authorization{
		ID:              "auth123",
		UserID:          "user123",
		InfoTags:        []string{"financial", "personal"},
		Purpose:         "loan application",
		ValidityPeriod:  3600,
		AuthorizedParty: "bank1",
		CreatedAt:       now,
	}

	// 测试JSON序列化
	jsonData, err := json.Marshal(auth)
	assert.NoError(t, err)

	// 测试JSON反序列化
	var parsed models.Authorization
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, auth.ID, parsed.ID)
	assert.Equal(t, auth.UserID, parsed.UserID)
	assert.Equal(t, auth.InfoTags, parsed.InfoTags)
	assert.Equal(t, auth.Purpose, parsed.Purpose)
	assert.Equal(t, auth.ValidityPeriod, parsed.ValidityPeriod)
	assert.Equal(t, auth.AuthorizedParty, parsed.AuthorizedParty)
	assert.Equal(t, auth.CreatedAt, parsed.CreatedAt)
}

func TestAuthorizationRequest(t *testing.T) {
	request := models.AuthorizationRequest{
		RequestID:       "req123",
		UserID:          "user123",
		DataTags:        []string{"financial", "credit"},
		Purpose:         "credit check",
		ValidityPeriod:  7200,
		AuthorizedParty: "bank1",
		ZKPProof:        "zkp_proof_data",
	}

	// 测试JSON序列化
	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)
	assert.Contains(t, string(jsonData), "req123")

	// 测试JSON反序列化
	var parsed models.AuthorizationRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.RequestID, parsed.RequestID)
	assert.Equal(t, request.UserID, parsed.UserID)
	assert.Equal(t, request.DataTags, parsed.DataTags)
	assert.Equal(t, request.Purpose, parsed.Purpose)
	assert.Equal(t, request.ValidityPeriod, parsed.ValidityPeriod)
}

func TestBankDataRequest(t *testing.T) {
	request := models.BankDataRequest{
		RequestID:          "bank_req123",
		BankID:             "bank1",
		UserID:             "user123",
		RequestedDataTypes: []string{"credit_score", "transaction_history"},
		BusinessPurpose:    "loan evaluation",
		UrgencyLevel:       "high",
		BankAttributes:     []string{"licensed_bank", "tier1"},
	}

	// 测试JSON序列化和反序列化
	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)

	var parsed models.BankDataRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.RequestID, parsed.RequestID)
	assert.Equal(t, request.BankID, parsed.BankID)
	assert.Equal(t, request.UserID, parsed.UserID)
	assert.Equal(t, request.RequestedDataTypes, parsed.RequestedDataTypes)
	assert.Equal(t, request.BusinessPurpose, parsed.BusinessPurpose)
}

func TestBankVerifyRequest(t *testing.T) {
	request := models.BankVerifyRequest{
		AuthorizationID:       "auth123",
		UserID:                "user123",
		BankID:                "bank1",
		VerificationChallenge: "challenge_data",
		ZKPProof:              "zkp_proof_data",
	}

	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)

	var parsed models.BankVerifyRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.AuthorizationID, parsed.AuthorizationID)
	assert.Equal(t, request.UserID, parsed.UserID)
	assert.Equal(t, request.BankID, parsed.BankID)
}

func TestDataCenterProvideRequest(t *testing.T) {
	request := models.DataCenterProvideRequest{
		RequestID:      "dc_req123",
		UserID:         "user123",
		AuthCiphertext: "encrypted_auth_data",
		RequestedTags:  []string{"financial", "credit"},
		AuthHash:       "auth_hash_value",
		DatacenterID:   "dc1",
		ZKPProof:       "zkp_proof_data",
	}

	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)

	var parsed models.DataCenterProvideRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.RequestID, parsed.RequestID)
	assert.Equal(t, request.UserID, parsed.UserID)
	assert.Equal(t, request.AuthCiphertext, parsed.AuthCiphertext)
	assert.Equal(t, request.RequestedTags, parsed.RequestedTags)
}

func TestDataCenterResponse(t *testing.T) {
	response := models.DataCenterResponse{
		RequestID:     "dc_req123",
		DatacenterID:  "dc1",
		EncryptedData: "encrypted_user_data",
		AccessLog: models.AccessLog{
			LogID:      "log123",
			UserID:     "user123",
			AccessorID: "dc1",
			DataTags:   []string{"financial"},
			Purpose:    "data provision",
			Timestamp:  time.Now(),
			Status:     "success",
		},
		TransactionID: "tx123",
		ZKPVerified:   true,
	}

	jsonData, err := json.Marshal(response)
	assert.NoError(t, err)

	var parsed models.DataCenterResponse
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, response.RequestID, parsed.RequestID)
	assert.Equal(t, response.DatacenterID, parsed.DatacenterID)
	assert.Equal(t, response.EncryptedData, parsed.EncryptedData)
	assert.Equal(t, response.ZKPVerified, parsed.ZKPVerified)
}

func TestChainTransaction(t *testing.T) {
	now := time.Now()
	tx := models.ChainTransaction{
		TxID:        "tx123",
		BlockHeight: 12345,
		Timestamp:   now,
		Status:      "committed",
	}

	jsonData, err := json.Marshal(tx)
	assert.NoError(t, err)

	var parsed models.ChainTransaction
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, tx.TxID, parsed.TxID)
	assert.Equal(t, tx.BlockHeight, parsed.BlockHeight)
	assert.Equal(t, tx.Status, parsed.Status)
	// 时间序列化可能有精度差异，检查是否在合理范围内
	assert.WithinDuration(t, tx.Timestamp, parsed.Timestamp, time.Second)
}

func TestContractParams(t *testing.T) {
	params := models.ContractParams{
		ContractName: "authorization_contract",
		Method:       "createAuthorization",
		Params: map[string][]byte{
			"user_id":    []byte("user123"),
			"auth_data":  []byte("auth_ciphertext"),
			"auth_hash":  []byte("auth_hash_value"),
		},
	}

	jsonData, err := json.Marshal(params)
	assert.NoError(t, err)

	var parsed models.ContractParams
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, params.ContractName, parsed.ContractName)
	assert.Equal(t, params.Method, parsed.Method)
	assert.Equal(t, params.Params["user_id"], parsed.Params["user_id"])
}

func TestAccessLog(t *testing.T) {
	now := time.Now()
	log := models.AccessLog{
		LogID:         "log123",
		UserID:        "user123",
		AccessorID:    "bank1",
		DataTags:      []string{"financial", "credit"},
		Purpose:       "credit evaluation",
		Timestamp:     now,
		Status:        "success",
		TransactionID: "tx123",
		ZKPVerified:   true,
	}

	jsonData, err := json.Marshal(log)
	assert.NoError(t, err)

	var parsed models.AccessLog
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, log.LogID, parsed.LogID)
	assert.Equal(t, log.UserID, parsed.UserID)
	assert.Equal(t, log.AccessorID, parsed.AccessorID)
	assert.Equal(t, log.DataTags, parsed.DataTags)
	assert.Equal(t, log.Purpose, parsed.Purpose)
	assert.Equal(t, log.Status, parsed.Status)
	assert.Equal(t, log.ZKPVerified, parsed.ZKPVerified)
}

func TestVerificationRecord(t *testing.T) {
	now := time.Now()
	record := models.VerificationRecord{
		RecordID:      "record123",
		UserID:        "user123",
		VerifierID:    "bank1",
		VerifyType:    "zkp_verification",
		Result:        true,
		Timestamp:     now,
		TransactionID: "tx123",
	}

	jsonData, err := json.Marshal(record)
	assert.NoError(t, err)

	var parsed models.VerificationRecord
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, record.RecordID, parsed.RecordID)
	assert.Equal(t, record.UserID, parsed.UserID)
	assert.Equal(t, record.VerifierID, parsed.VerifierID)
	assert.Equal(t, record.VerifyType, parsed.VerifyType)
	assert.Equal(t, record.Result, parsed.Result)
}

func TestZKProof(t *testing.T) {
	proof := models.ZKProof{
		Proof:      "base64_encoded_proof",
		DataHash:   "base64_encoded_data_hash",
		UserIDHash: "base64_encoded_user_id_hash",
	}

	jsonData, err := json.Marshal(proof)
	assert.NoError(t, err)

	var parsed models.ZKProof
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, proof.Proof, parsed.Proof)
	assert.Equal(t, proof.DataHash, parsed.DataHash)
	assert.Equal(t, proof.UserIDHash, parsed.UserIDHash)
}

func TestZKPRequest(t *testing.T) {
	request := models.ZKPRequest{
		Data:   "sensitive_data",
		UserID: "user123",
		Nonce:  "random_nonce",
	}

	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)

	var parsed models.ZKPRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.Data, parsed.Data)
	assert.Equal(t, request.UserID, parsed.UserID)
	assert.Equal(t, request.Nonce, parsed.Nonce)
}

func TestZKPVerifyRequest(t *testing.T) {
	request := models.ZKPVerifyRequest{
		Proof:      []byte("proof_bytes"),
		DataHash:   []byte("data_hash_bytes"),
		UserIDHash: []byte("user_id_hash_bytes"),
	}

	jsonData, err := json.Marshal(request)
	assert.NoError(t, err)

	var parsed models.ZKPVerifyRequest
	err = json.Unmarshal(jsonData, &parsed)
	assert.NoError(t, err)
	assert.Equal(t, request.Proof, parsed.Proof)
	assert.Equal(t, request.DataHash, parsed.DataHash)
	assert.Equal(t, request.UserIDHash, parsed.UserIDHash)
}

func TestComplexStructNesting(t *testing.T) {
	// 测试包含嵌套结构的复杂数据
	response := models.DataCenterResponse{
		RequestID:     "complex_req123",
		DatacenterID:  "dc1",
		EncryptedData: "complex_encrypted_data",
		AccessLog: models.AccessLog{
			LogID:         "nested_log123",
			UserID:        "user123",
			AccessorID:    "dc1",
			DataTags:      []string{"financial", "medical", "personal"},
			Purpose:       "comprehensive data analysis",
			Timestamp:     time.Now(),
			Status:        "success",
			TransactionID: "nested_tx123",
			ZKPVerified:   true,
		},
		TransactionID: "main_tx123",
		ZKPVerified:   true,
	}

	// 测试深度序列化和反序列化
	jsonData, err := json.Marshal(response)
	require.NoError(t, err)

	var parsed models.DataCenterResponse
	err = json.Unmarshal(jsonData, &parsed)
	require.NoError(t, err)

	// 验证主结构
	assert.Equal(t, response.RequestID, parsed.RequestID)
	assert.Equal(t, response.DatacenterID, parsed.DatacenterID)
	assert.Equal(t, response.EncryptedData, parsed.EncryptedData)

	// 验证嵌套结构
	assert.Equal(t, response.AccessLog.LogID, parsed.AccessLog.LogID)
	assert.Equal(t, response.AccessLog.UserID, parsed.AccessLog.UserID)
	assert.Equal(t, response.AccessLog.DataTags, parsed.AccessLog.DataTags)
	assert.Equal(t, response.AccessLog.ZKPVerified, parsed.AccessLog.ZKPVerified)
}

func TestEmptyAndNilValues(t *testing.T) {
	// 测试空值和nil值的处理
	tests := []struct {
		name string
		data interface{}
	}{
		{
			name: "空字符串数组",
			data: models.Authorization{
				ID:       "test",
				InfoTags: []string{},
			},
		},
		{
			name: "nil数据",
			data: models.Response{
				Code:    200,
				Message: "success",
				Data:    nil,
			},
		},
		{
			name: "空映射",
			data: models.ContractParams{
				ContractName: "test_contract",
				Method:       "test_method",
				Params:       map[string][]byte{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonData, err := json.Marshal(tt.data)
			assert.NoError(t, err)
			assert.NotEmpty(t, jsonData)

			// 确保可以反序列化
			var result interface{}
			err = json.Unmarshal(jsonData, &result)
			assert.NoError(t, err)
		})
	}
}