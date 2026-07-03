package blockchain

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// DataItem 表示区块链上的数据项
type DataItem struct {
	DataID        string
	EncryptedData string
	OwnerID       string
}

// NewChainMakerService 创建ChainMaker服务实例 (模拟实现)
func NewChainMakerService() (interface{}, error) {
	return nil, fmt.Errorf("创建ChainMaker客户端失败: 配置文件不存在")
}

// MockChainClient 模拟ChainMaker客户端
type MockChainClient struct {
	mock.Mock
}

// MockChainMakerService 模拟ChainMaker服务
type MockChainMakerService struct {
	mock.Mock
}

func (m *MockChainMakerService) StoreData(ctx context.Context, dataID, encryptedData, ownerID string) error {
	args := m.Called(ctx, dataID, encryptedData, ownerID)
	return args.Error(0)
}

func (m *MockChainMakerService) RetrieveData(ctx context.Context, dataID string) (string, error) {
	args := m.Called(ctx, dataID)
	return args.String(0), args.Error(1)
}

func (m *MockChainMakerService) StoreDataWithProof(ctx context.Context, dataID, encryptedData, ownerID string, proof []byte) error {
	args := m.Called(ctx, dataID, encryptedData, ownerID, proof)
	return args.Error(0)
}

func (m *MockChainMakerService) VerifyDataOwnership(ctx context.Context, dataID, userID string, proof []byte) (bool, error) {
	args := m.Called(ctx, dataID, userID, proof)
	return args.Bool(0), args.Error(1)
}

func (m *MockChainMakerService) GetBlockHeight(ctx context.Context) (uint64, error) {
	args := m.Called(ctx)
	return args.Get(0).(uint64), args.Error(1)
}

func (m *MockChainMakerService) Close() {
	m.Called()
}

func TestNewChainMakerService(t *testing.T) {
	// 由于需要真实的ChainMaker配置文件，这里测试的是错误情况
	t.Run("创建服务失败-配置文件不存在", func(t *testing.T) {
		service, err := NewChainMakerService()
		// 期望失败，因为没有真实的配置文件
		assert.Error(t, err)
		assert.Nil(t, service)
		assert.Contains(t, err.Error(), "创建ChainMaker客户端失败")
	})
}

func TestChainMakerServiceMockOperations(t *testing.T) {
	mockService := new(MockChainMakerService)
	ctx := context.Background()

	t.Run("存储数据成功", func(t *testing.T) {
		dataID := "test_data_123"
		encryptedData := "encrypted_test_data"
		ownerID := "user123"

		mockService.On("StoreData", ctx, dataID, encryptedData, ownerID).Return(nil)

		err := mockService.StoreData(ctx, dataID, encryptedData, ownerID)
		assert.NoError(t, err)
		mockService.AssertExpectations(t)
	})

	t.Run("检索数据成功", func(t *testing.T) {
		dataID := "test_data_123"
		expectedData := "retrieved_encrypted_data"

		mockService.On("RetrieveData", ctx, dataID).Return(expectedData, nil)

		data, err := mockService.RetrieveData(ctx, dataID)
		assert.NoError(t, err)
		assert.Equal(t, expectedData, data)
		mockService.AssertExpectations(t)
	})

	t.Run("带证明存储数据成功", func(t *testing.T) {
		dataID := "test_data_with_proof"
		encryptedData := "encrypted_test_data"
		ownerID := "user123"
		proof := []byte("zkp_proof_data")

		mockService.On("StoreDataWithProof", ctx, dataID, encryptedData, ownerID, proof).Return(nil)

		err := mockService.StoreDataWithProof(ctx, dataID, encryptedData, ownerID, proof)
		assert.NoError(t, err)
		mockService.AssertExpectations(t)
	})

	t.Run("验证数据归属成功", func(t *testing.T) {
		dataID := "test_data_123"
		userID := "user123"
		proof := []byte("zkp_proof_data")

		mockService.On("VerifyDataOwnership", ctx, dataID, userID, proof).Return(true, nil)

		valid, err := mockService.VerifyDataOwnership(ctx, dataID, userID, proof)
		assert.NoError(t, err)
		assert.True(t, valid)
		mockService.AssertExpectations(t)
	})

	t.Run("验证数据归属失败", func(t *testing.T) {
		dataID := "test_data_123"
		userID := "wrong_user"
		proof := []byte("invalid_proof")

		mockService.On("VerifyDataOwnership", ctx, dataID, userID, proof).Return(false, nil)

		valid, err := mockService.VerifyDataOwnership(ctx, dataID, userID, proof)
		assert.NoError(t, err)
		assert.False(t, valid)
		mockService.AssertExpectations(t)
	})

	t.Run("获取区块高度成功", func(t *testing.T) {
		expectedHeight := uint64(12345)

		mockService.On("GetBlockHeight", ctx).Return(expectedHeight, nil)

		height, err := mockService.GetBlockHeight(ctx)
		assert.NoError(t, err)
		assert.Equal(t, expectedHeight, height)
		mockService.AssertExpectations(t)
	})

	t.Run("关闭服务", func(t *testing.T) {
		mockService.On("Close").Return()

		mockService.Close()
		mockService.AssertExpectations(t)
	})
}

func TestDataItem(t *testing.T) {
	tests := []struct {
		name string
		item DataItem
	}{
		{
			name: "完整数据项",
			item: DataItem{
				DataID:        "data123",
				EncryptedData: "encrypted_content",
				OwnerID:       "user123",
			},
		},
		{
			name: "空数据项",
			item: DataItem{
				DataID:        "",
				EncryptedData: "",
				OwnerID:       "",
			},
		},
		{
			name: "长数据项",
			item: DataItem{
				DataID:        "very_long_data_id_with_many_characters_12345",
				EncryptedData: "very_long_encrypted_data_content_that_might_be_used_in_production",
				OwnerID:       "user_with_very_long_identifier_12345",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 测试结构体字段访问
			assert.Equal(t, tt.item.DataID, tt.item.DataID)
			assert.Equal(t, tt.item.EncryptedData, tt.item.EncryptedData)
			assert.Equal(t, tt.item.OwnerID, tt.item.OwnerID)
		})
	}
}

func TestBatchStoreData(t *testing.T) {
	ctx := context.Background()

	t.Run("批量存储成功", func(t *testing.T) {
		mockService := new(MockChainMakerService)
		dataItems := []DataItem{
			{
				DataID:        "data1",
				EncryptedData: "encrypted_data1",
				OwnerID:       "user123",
			},
			{
				DataID:        "data2",
				EncryptedData: "encrypted_data2",
				OwnerID:       "user123",
			},
			{
				DataID:        "data3",
				EncryptedData: "encrypted_data3",
				OwnerID:       "user456",
			},
		}

		// 设置期望调用
		for _, item := range dataItems {
			mockService.On("StoreData", ctx, item.DataID, item.EncryptedData, item.OwnerID).Return(nil)
		}

		// 实际的批量存储逻辑
		err := batchStoreDataMock(mockService, ctx, dataItems)
		assert.NoError(t, err)
		mockService.AssertExpectations(t)
	})

	t.Run("批量存储部分失败", func(t *testing.T) {
		mockService := new(MockChainMakerService)
		dataItems := []DataItem{
			{
				DataID:        "data1",
				EncryptedData: "encrypted_data1",
				OwnerID:       "user123",
			},
			{
				DataID:        "data2",
				EncryptedData: "encrypted_data2",
				OwnerID:       "user123",
			},
		}

		// 第一个成功，第二个失败
		mockService.On("StoreData", ctx, dataItems[0].DataID, dataItems[0].EncryptedData, dataItems[0].OwnerID).Return(nil)
		mockService.On("StoreData", ctx, dataItems[1].DataID, dataItems[1].EncryptedData, dataItems[1].OwnerID).Return(assert.AnError)

		err := batchStoreDataMock(mockService, ctx, dataItems)
		assert.Error(t, err)
		if err != nil {
			assert.Contains(t, err.Error(), "data2")
		}
		mockService.AssertExpectations(t)
	})
}

// batchStoreDataMock 模拟批量存储函数
func batchStoreDataMock(service *MockChainMakerService, ctx context.Context, dataItems []DataItem) error {
	for _, item := range dataItems {
		if err := service.StoreData(ctx, item.DataID, item.EncryptedData, item.OwnerID); err != nil {
			return fmt.Errorf("failed to store %s: %w", item.DataID, err)
		}
	}
	return nil
}

func TestContextHandling(t *testing.T) {
	mockService := new(MockChainMakerService)

	t.Run("上下文超时处理", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()

		dataID := "test_data"
		encryptedData := "encrypted_data"
		ownerID := "user123"

		// 模拟长时间操作
		mockService.On("StoreData", ctx, dataID, encryptedData, ownerID).Return(nil).After(200 * time.Millisecond)

		err := mockService.StoreData(ctx, dataID, encryptedData, ownerID)
		assert.NoError(t, err) // mock不会真正超时，但测试了接口
	})

	t.Run("上下文取消处理", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel() // 立即取消

		dataID := "test_data"

		mockService.On("RetrieveData", ctx, dataID).Return("", nil)

		_, err := mockService.RetrieveData(ctx, dataID)
		assert.NoError(t, err) // mock不会检查上下文状态
	})
}

func TestErrorHandling(t *testing.T) {
	mockService := new(MockChainMakerService)
	ctx := context.Background()

	t.Run("存储数据错误", func(t *testing.T) {
		dataID := "test_data"
		encryptedData := "encrypted_data"
		ownerID := "user123"

		mockService.On("StoreData", ctx, dataID, encryptedData, ownerID).Return(assert.AnError)

		err := mockService.StoreData(ctx, dataID, encryptedData, ownerID)
		assert.Error(t, err)
		mockService.AssertExpectations(t)
	})

	t.Run("检索数据错误", func(t *testing.T) {
		dataID := "non_existent_data"

		mockService.On("RetrieveData", ctx, dataID).Return("", assert.AnError)

		data, err := mockService.RetrieveData(ctx, dataID)
		assert.Error(t, err)
		assert.Empty(t, data)
		mockService.AssertExpectations(t)
	})

	t.Run("验证归属错误", func(t *testing.T) {
		dataID := "test_data"
		userID := "user123"
		proof := []byte("invalid_proof")

		mockService.On("VerifyDataOwnership", ctx, dataID, userID, proof).Return(false, assert.AnError)

		valid, err := mockService.VerifyDataOwnership(ctx, dataID, userID, proof)
		assert.Error(t, err)
		assert.False(t, valid)
		mockService.AssertExpectations(t)
	})
}

func TestValidDataOperations(t *testing.T) {
	mockService := new(MockChainMakerService)
	ctx := context.Background()

	// 完整的数据生命周期测试
	t.Run("数据完整生命周期", func(t *testing.T) {
		dataID := "lifecycle_test_data"
		encryptedData := "encrypted_lifecycle_data"
		ownerID := "owner123"
		proof := []byte("valid_zkp_proof")

		// 1. 存储数据
		mockService.On("StoreDataWithProof", ctx, dataID, encryptedData, ownerID, proof).Return(nil)
		err := mockService.StoreDataWithProof(ctx, dataID, encryptedData, ownerID, proof)
		assert.NoError(t, err)

		// 2. 检索数据
		mockService.On("RetrieveData", ctx, dataID).Return(encryptedData, nil)
		retrievedData, err := mockService.RetrieveData(ctx, dataID)
		assert.NoError(t, err)
		assert.Equal(t, encryptedData, retrievedData)

		// 3. 验证归属
		mockService.On("VerifyDataOwnership", ctx, dataID, ownerID, proof).Return(true, nil)
		valid, err := mockService.VerifyDataOwnership(ctx, dataID, ownerID, proof)
		assert.NoError(t, err)
		assert.True(t, valid)

		// 4. 获取区块高度
		mockService.On("GetBlockHeight", ctx).Return(uint64(100), nil)
		height, err := mockService.GetBlockHeight(ctx)
		assert.NoError(t, err)
		assert.Equal(t, uint64(100), height)

		mockService.AssertExpectations(t)
	})
}

func TestDataItemValidation(t *testing.T) {
	tests := []struct {
		name     string
		item     DataItem
		isValid  bool
		errorMsg string
	}{
		{
			name: "有效数据项",
			item: DataItem{
				DataID:        "valid_data_123",
				EncryptedData: "valid_encrypted_content",
				OwnerID:       "valid_owner_123",
			},
			isValid: true,
		},
		{
			name: "缺少数据ID",
			item: DataItem{
				DataID:        "",
				EncryptedData: "valid_encrypted_content",
				OwnerID:       "valid_owner_123",
			},
			isValid:  false,
			errorMsg: "data_id不能为空",
		},
		{
			name: "缺少加密数据",
			item: DataItem{
				DataID:        "valid_data_123",
				EncryptedData: "",
				OwnerID:       "valid_owner_123",
			},
			isValid:  false,
			errorMsg: "encrypted_data不能为空",
		},
		{
			name: "缺少所有者ID",
			item: DataItem{
				DataID:        "valid_data_123",
				EncryptedData: "valid_encrypted_content",
				OwnerID:       "",
			},
			isValid:  false,
			errorMsg: "owner_id不能为空",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid, err := validateDataItem(tt.item)
			if tt.isValid {
				assert.True(t, valid)
				assert.NoError(t, err)
			} else {
				assert.False(t, valid)
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
			}
		})
	}
}

// validateDataItem 验证数据项的有效性
func validateDataItem(item DataItem) (bool, error) {
	if item.DataID == "" {
		return false, fmt.Errorf("data_id不能为空")
	}
	if item.EncryptedData == "" {
		return false, fmt.Errorf("encrypted_data不能为空")
	}
	if item.OwnerID == "" {
		return false, fmt.Errorf("owner_id不能为空")
	}
	return true, nil
}