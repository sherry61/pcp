package crypto

import (
	"testing"

	"blockchain_data_auth/crypto/zkp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewZKPSystem(t *testing.T) {
	tests := []struct {
		name    string
		wantErr bool
	}{
		{
			name:    "创建ZKP系统成功",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			system, err := zkp.NewZKPSystem()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, system)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, system)
			}
		})
	}
}

func TestGenerateDataHash(t *testing.T) {
	tests := []struct {
		name     string
		data     string
		nonce    string
		expected bool // 是否期望生成哈希
	}{
		{
			name:     "正常数据和nonce",
			data:     "test_data",
			nonce:    "123456",
			expected: true,
		},
		{
			name:     "空数据",
			data:     "",
			nonce:    "123456",
			expected: true,
		},
		{
			name:     "空nonce",
			data:     "test_data",
			nonce:    "",
			expected: true,
		},
		{
			name:     "长数据",
			data:     "this_is_a_very_long_data_string_for_testing",
			nonce:    "789012",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash := zkp.GenerateDataHash(tt.data, tt.nonce)
			if tt.expected {
				assert.NotEmpty(t, hash)
				assert.True(t, len(hash) > 0)
			}
		})
	}
}

func TestGenerateUserIDHash(t *testing.T) {
	tests := []struct {
		name     string
		userID   string
		expected bool
	}{
		{
			name:     "正常用户ID",
			userID:   "user123",
			expected: true,
		},
		{
			name:     "空用户ID",
			userID:   "",
			expected: true,
		},
		{
			name:     "数字用户ID",
			userID:   "123456",
			expected: true,
		},
		{
			name:     "特殊字符用户ID",
			userID:   "user@test.com",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash := zkp.GenerateUserIDHash(tt.userID)
			if tt.expected {
				assert.NotEmpty(t, hash)
				assert.True(t, len(hash) > 0)
			}
		})
	}
}

func TestZKPSystemGenerateProofWithHash(t *testing.T) {
	system, err := zkp.NewZKPSystem()
	require.NoError(t, err)
	require.NotNil(t, system)

	tests := []struct {
		name    string
		data    string
		userID  string
		wantErr bool
	}{
		{
			name:    "正常生成证明",
			data:    "test_data",
			userID:  "user123",
			wantErr: false,
		},
		{
			name:    "空数据",
			data:    "",
			userID:  "user123",
			wantErr: false,
		},
		{
			name:    "空用户ID",
			data:    "test_data",
			userID:  "",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			proof, dataHash, userIDHash, nonce, err := system.GenerateProofWithHash(tt.data, tt.userID)
			
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, proof)
				assert.NotEmpty(t, dataHash)
				assert.NotEmpty(t, userIDHash)
				assert.NotEmpty(t, nonce)
			}
		})
	}
}

func TestZKPSystemVerifyProof(t *testing.T) {
	system, err := zkp.NewZKPSystem()
	require.NoError(t, err)
	require.NotNil(t, system)

	// 首先生成一个有效的证明
	data := "test_data"
	userID := "user123"
	proof, dataHash, userIDHash, _, err := system.GenerateProofWithHash(data, userID)
	require.NoError(t, err)

	tests := []struct {
		name       string
		proof      []byte
		dataHash   []byte
		userIDHash []byte
		wantValid  bool
		wantErr    bool
	}{
		{
			name:       "验证有效证明",
			proof:      proof,
			dataHash:   dataHash,
			userIDHash: userIDHash,
			wantValid:  true,
			wantErr:    false,
		},
		{
			name:       "空证明",
			proof:      []byte{},
			dataHash:   dataHash,
			userIDHash: userIDHash,
			wantValid:  false,
			wantErr:    true,
		},
		{
			name:       "空数据哈希",
			proof:      proof,
			dataHash:   []byte{},
			userIDHash: userIDHash,
			wantValid:  false,
			wantErr:    true,
		},
		{
			name:       "空用户ID哈希",
			proof:      proof,
			dataHash:   dataHash,
			userIDHash: []byte{},
			wantValid:  false,
			wantErr:    true,
		},
		{
			name:       "错误的数据哈希",
			proof:      proof,
			dataHash:   []byte{1, 2, 3, 4},
			userIDHash: userIDHash,
			wantValid:  false,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid, err := system.VerifyProof(tt.proof, tt.dataHash, tt.userIDHash)
			
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			assert.Equal(t, tt.wantValid, valid)
		})
	}
}

func TestNewSimpleZKPSystem(t *testing.T) {
	system, err := zkp.NewSimpleZKPSystem()
	assert.NoError(t, err)
	assert.NotNil(t, system)
}

func TestDataOwnershipCircuitWorkflow(t *testing.T) {
	// 完整的工作流测试
	system, err := zkp.NewZKPSystem()
	require.NoError(t, err)

	data := "sensitive_data"
	userID := "owner123"

	// 生成证明
	proof, dataHash, userIDHash, _, err := system.GenerateProofWithHash(data, userID)
	require.NoError(t, err)

	// 验证证明
	valid, err := system.VerifyProof(proof, dataHash, userIDHash)
	assert.NoError(t, err)
	assert.True(t, valid)
}

func TestHashConsistency(t *testing.T) {
	// 测试哈希函数的一致性
	data := "test_data"
	nonce := "123456"
	userID := "user123"

	// 多次生成应该得到相同的结果
	hash1 := zkp.GenerateDataHash(data, nonce)
	hash2 := zkp.GenerateDataHash(data, nonce)
	assert.Equal(t, hash1, hash2)

	userHash1 := zkp.GenerateUserIDHash(userID)
	userHash2 := zkp.GenerateUserIDHash(userID)
	assert.Equal(t, userHash1, userHash2)
}

func TestZKPSystemNilChecks(t *testing.T) {
	var nilSystem *zkp.ZKPSystem

	// 测试空系统的验证
	valid, err := nilSystem.VerifyProof([]byte{1, 2, 3}, []byte{4, 5, 6}, []byte{7, 8, 9})
	assert.Error(t, err)
	assert.False(t, valid)
	assert.Contains(t, err.Error(), "ZKP system not initialized")
}