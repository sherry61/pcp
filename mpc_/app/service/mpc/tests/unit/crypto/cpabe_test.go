package crypto

import (
	"testing"

	"blockchain_data_auth/crypto/abe"
	"blockchain_data_auth/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewCPABE(t *testing.T) {
	tests := []struct {
		name    string
		wantErr bool
	}{
		{
			name:    "创建CP-ABE成功",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cpabe, err := abe.NewCPABE()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, cpabe)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, cpabe)
			}
		})
	}
}

func TestCPABESetup(t *testing.T) {
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	pubKey, secKey, err := cpabe.Setup()
	assert.NoError(t, err)
	assert.NotNil(t, pubKey)
	assert.NotNil(t, secKey)
}

func TestCPABEGenerateAttribKeys(t *testing.T) {
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	_, secKey, err := cpabe.Setup()
	require.NoError(t, err)

	tests := []struct {
		name       string
		attributes []string
		wantErr    bool
	}{
		{
			name:       "生成用户属性密钥",
			attributes: []string{"user_id:user123", "info_tag:financial", "role:admin"},
			wantErr:    false,
		},
		{
			name:       "生成银行属性密钥",
			attributes: []string{"user_id:bank", "info_tag:financial", "role:bank"},
			wantErr:    false,
		},
		{
			name:       "空属性列表",
			attributes: []string{},
			wantErr:    false,
		},
		{
			name:       "单个属性",
			attributes: []string{"user_id:user123"},
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attribKeys, err := cpabe.GenerateAttribKeys(tt.attributes, secKey)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, attribKeys)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, attribKeys)
			}
		})
	}
}

func TestCPABEEncrypt(t *testing.T) {
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	pubKey, _, err := cpabe.Setup()
	require.NoError(t, err)

	tests := []struct {
		name    string
		msg     []byte
		policy  string
		wantErr bool
	}{
		{
			name:    "加密财务信息",
			msg:     []byte("sensitive financial data"),
			policy:  "(user_id:user123 AND info_tag:financial)",
			wantErr: false,
		},
		{
			name:    "加密医疗信息",
			msg:     []byte("medical records"),
			policy:  "(user_id:user456 AND info_tag:medical)",
			wantErr: false,
		},
		{
			name:    "复杂策略",
			msg:     []byte("complex data"),
			policy:  "(user_id:user123 AND (info_tag:financial OR info_tag:medical))",
			wantErr: false,
		},
		{
			name:    "空消息",
			msg:     []byte(""),
			policy:  "(user_id:user123 AND info_tag:financial)",
			wantErr: false,
		},
		{
			name:    "无效策略",
			msg:     []byte("test data"),
			policy:  "((invalid policy syntax",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ciphertext, err := cpabe.Encrypt(tt.msg, tt.policy, pubKey)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, ciphertext)
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, ciphertext)
			}
		})
	}
}

func TestCPABEDecrypt(t *testing.T) {
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	pubKey, secKey, err := cpabe.Setup()
	require.NoError(t, err)

	// 准备测试数据
	originalMsg := []byte("test message for decryption")
	policy := "(user_id:user123 AND info_tag:financial)"

	// 加密消息
	ciphertext, err := cpabe.Encrypt(originalMsg, policy, pubKey)
	require.NoError(t, err)

	tests := []struct {
		name       string
		attributes []string
		wantErr    bool
		wantMsg    []byte
	}{
		{
			name:       "成功解密-正确属性",
			attributes: []string{"user_id:user123", "info_tag:financial"},
			wantErr:    false,
			wantMsg:    originalMsg,
		},
		{
			name:       "解密失败-缺少属性",
			attributes: []string{"user_id:user123"},
			wantErr:    true,
			wantMsg:    nil,
		},
		{
			name:       "解密失败-错误用户ID",
			attributes: []string{"user_id:user456", "info_tag:financial"},
			wantErr:    true,
			wantMsg:    nil,
		},
		{
			name:       "解密失败-错误标签",
			attributes: []string{"user_id:user123", "info_tag:medical"},
			wantErr:    true,
			wantMsg:    nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			attribKeys, err := cpabe.GenerateAttribKeys(tt.attributes, secKey)
			require.NoError(t, err)

			decryptedMsg, err := cpabe.Decrypt(ciphertext, attribKeys, pubKey)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantMsg, decryptedMsg)
			}
		})
	}
}

func TestCPABEInvalidCiphertext(t *testing.T) {
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	pubKey, secKey, err := cpabe.Setup()
	require.NoError(t, err)

	attributes := []string{"user_id:user123", "info_tag:financial"}
	attribKeys, err := cpabe.GenerateAttribKeys(attributes, secKey)
	require.NoError(t, err)

	tests := []struct {
		name       string
		ciphertext []byte
		wantErr    bool
	}{
		{
			name:       "无效密文-随机字节",
			ciphertext: []byte("invalid ciphertext"),
			wantErr:    true,
		},
		{
			name:       "无效密文-空字节",
			ciphertext: []byte{},
			wantErr:    true,
		},
		{
			name:       "无效密文-JSON格式错误",
			ciphertext: []byte("{invalid json}"),
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := cpabe.Decrypt(tt.ciphertext, attribKeys, pubKey)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGeneratePolicy(t *testing.T) {
	tests := []struct {
		name     string
		auth     *models.Authorization
		expected string
	}{
		{
			name: "财务信息策略",
			auth: &models.Authorization{
				UserID:   "user123",
				InfoTags: []string{"financial", "personal"},
			},
			expected: "(user_id:user123 AND (info_tag:financial OR info_tag:personal))",
		},
		{
			name: "医疗信息策略",
			auth: &models.Authorization{
				UserID:   "user456",
				InfoTags: []string{"medical"},
			},
			expected: "(user_id:user456 AND (info_tag:medical))",
		},
		{
			name: "多标签策略",
			auth: &models.Authorization{
				UserID:   "user789",
				InfoTags: []string{"financial", "medical", "personal", "business"},
			},
			expected: "(user_id:user789 AND (info_tag:financial OR info_tag:medical OR info_tag:personal OR info_tag:business))",
		},
		{
			name: "单标签策略",
			auth: &models.Authorization{
				UserID:   "admin",
				InfoTags: []string{"admin"},
			},
			expected: "(user_id:admin AND (info_tag:admin))",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := abe.GeneratePolicy(tt.auth)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCPABEWorkflow(t *testing.T) {
	// 完整的CP-ABE工作流测试
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	// 1. 系统初始化
	pubKey, secKey, err := cpabe.Setup()
	require.NoError(t, err)

	// 2. 生成用户属性密钥
	userAttributes := []string{"user_id:alice", "info_tag:financial", "role:customer"}
	userKeys, err := cpabe.GenerateAttribKeys(userAttributes, secKey)
	require.NoError(t, err)

	// 3. 根据授权生成策略
	auth := &models.Authorization{
		UserID:   "alice",
		InfoTags: []string{"financial"},
	}
	policy := abe.GeneratePolicy(auth)
	assert.Equal(t, "(user_id:alice AND (info_tag:financial))", policy)

	// 4. 加密数据
	originalData := []byte("Alice's bank account balance: $10,000")
	ciphertext, err := cpabe.Encrypt(originalData, policy, pubKey)
	require.NoError(t, err)
	assert.NotEmpty(t, ciphertext)

	// 5. 解密数据
	decryptedData, err := cpabe.Decrypt(ciphertext, userKeys, pubKey)
	require.NoError(t, err)
	assert.Equal(t, originalData, decryptedData)

	// 6. 验证非授权用户无法解密
	unauthorizedAttributes := []string{"user_id:bob", "info_tag:financial", "role:customer"}
	unauthorizedKeys, err := cpabe.GenerateAttribKeys(unauthorizedAttributes, secKey)
	require.NoError(t, err)

	_, err = cpabe.Decrypt(ciphertext, unauthorizedKeys, pubKey)
	assert.Error(t, err, "Unauthorized user should not be able to decrypt")
}

func TestCPABEMultipleMessagesEncryption(t *testing.T) {
	// 测试多条消息的加密解密
	cpabe, err := abe.NewCPABE()
	require.NoError(t, err)

	pubKey, secKey, err := cpabe.Setup()
	require.NoError(t, err)

	userAttributes := []string{"user_id:user123", "info_tag:financial", "info_tag:medical"}
	userKeys, err := cpabe.GenerateAttribKeys(userAttributes, secKey)
	require.NoError(t, err)

	messages := [][]byte{
		[]byte("Financial record 1"),
		[]byte("Medical record 1"),
		[]byte("Personal data 1"),
	}

	policies := []string{
		"(user_id:user123 AND info_tag:financial)",
		"(user_id:user123 AND info_tag:medical)",
		"(user_id:user123 AND (info_tag:financial OR info_tag:medical))",
	}

	// 加密所有消息
	ciphertexts := make([][]byte, len(messages))
	for i, msg := range messages {
		ciphertext, err := cpabe.Encrypt(msg, policies[i], pubKey)
		require.NoError(t, err)
		ciphertexts[i] = ciphertext
	}

	// 解密并验证所有消息
	for i, ciphertext := range ciphertexts {
		decryptedMsg, err := cpabe.Decrypt(ciphertext, userKeys, pubKey)
		require.NoError(t, err)
		assert.Equal(t, messages[i], decryptedMsg)
	}
}