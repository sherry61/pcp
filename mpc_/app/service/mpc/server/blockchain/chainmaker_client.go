package blockchain

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"chainmaker.org/chainmaker/pb-go/v2/common"
	"chainmaker.org/chainmaker/pb-go/v2/discovery"
	sdk "chainmaker.org/chainmaker/sdk-go/v2"
)

// ChainMakerService 封装ChainMaker客户端
type ChainMakerService struct {
	client *sdk.ChainClient
}

// NewChainMakerService 创建新的ChainMaker服务实例
func NewChainMakerService() (*ChainMakerService, error) {
	client, err := createClientWithConfig()
	if err != nil {
		return nil, fmt.Errorf("创建ChainMaker客户端失败: %v", err)
	}

	return &ChainMakerService{
		client: client,
	}, nil
}

// createClientWithConfig 使用配置文件创建客户端
func createClientWithConfig() (*sdk.ChainClient, error) {
	configPath := os.Getenv("SDK_CONFIG_PATH")
	if configPath == "" {
		configPath = "./config/sdk_config.yml"
	}

	chainClient, err := sdk.NewChainClient(
		sdk.WithConfPath(configPath),
	)

	if err != nil {
		return nil, err
	}

	return chainClient, nil
}

// GetChainClient 返回ChainMaker客户端实例
// 用于handlers直接调用区块链合约
func (cms *ChainMakerService) GetChainClient() *sdk.ChainClient {
	return cms.client
}

// Close 关闭客户端连接
func (cms *ChainMakerService) Close() {
	if cms.client != nil {
		cms.client.Stop()
	}
}

// StoreData 存储数据到链上
func (cms *ChainMakerService) StoreData(ctx context.Context, dataID, encryptedData, ownerID string) error {
	// 构造合约调用参数
	kvs := []*common.KeyValuePair{
		{
			Key:   "data_id",
			Value: []byte(dataID),
		},
		{
			Key:   "encrypted_data",
			Value: []byte(encryptedData),
		},
		{
			Key:   "owner_id",
			Value: []byte(ownerID),
		},
		{
			Key:   "action",
			Value: []byte("store"),
		},
	}

	// 调用合约
	resp, err := cms.client.InvokeContract("data_storage", "store_data", "", kvs, -1, true)
	if err != nil {
		return fmt.Errorf("调用存储合约失败: %v", err)
	}

	if resp.Code != 0 {
		return fmt.Errorf("合约执行失败: %s", resp.Message)
	}

	log.Printf("数据存储成功，交易ID: %s", resp.TxId)
	return nil
}

// RetrieveData 从链上检索数据
func (cms *ChainMakerService) RetrieveData(ctx context.Context, dataID string) (string, error) {
	// 构造查询参数
	kvs := []*common.KeyValuePair{
		{
			Key:   "data_id",
			Value: []byte(dataID),
		},
		{
			Key:   "action",
			Value: []byte("retrieve"),
		},
	}

	// 查询合约
	resp, err := cms.client.QueryContract("data_storage", "get_data", kvs, -1)
	if err != nil {
		return "", fmt.Errorf("查询数据失败: %v", err)
	}

	if resp.Code != 0 {
		return "", fmt.Errorf("合约查询失败: %s", resp.Message)
	}

	return string(resp.ContractResult.Result), nil
}

// StoreDataWithProof 存储带零知识证明的数据
func (cms *ChainMakerService) StoreDataWithProof(ctx context.Context, dataID, encryptedData, ownerID string, proof []byte) error {
	// 构造合约调用参数
	kvs := []*common.KeyValuePair{
		{
			Key:   "data_id",
			Value: []byte(dataID),
		},
		{
			Key:   "encrypted_data",
			Value: []byte(encryptedData),
		},
		{
			Key:   "owner_id",
			Value: []byte(ownerID),
		},
		{
			Key:   "zkp_proof",
			Value: proof,
		},
		{
			Key:   "action",
			Value: []byte("store_with_proof"),
		},
	}

	// 调用合约
	resp, err := cms.client.InvokeContract("data_storage", "store_data_with_proof", "", kvs, -1, true)
	if err != nil {
		return fmt.Errorf("调用存储合约失败: %v", err)
	}

	if resp.Code != 0 {
		return fmt.Errorf("合约执行失败: %s", resp.Message)
	}

	log.Printf("带证明的数据存储成功，交易ID: %s", resp.TxId)
	return nil
}

// VerifyDataOwnership 验证数据归属
func (cms *ChainMakerService) VerifyDataOwnership(ctx context.Context, dataID, userID string, proof []byte) (bool, error) {
	// 构造查询参数
	kvs := []*common.KeyValuePair{
		{
			Key:   "data_id",
			Value: []byte(dataID),
		},
		{
			Key:   "user_id",
			Value: []byte(userID),
		},
		{
			Key:   "zkp_proof",
			Value: proof,
		},
		{
			Key:   "action",
			Value: []byte("verify_ownership"),
		},
	}

	// 查询合约
	resp, err := cms.client.QueryContract("data_storage", "verify_ownership", kvs, -1)
	if err != nil {
		return false, fmt.Errorf("验证归属失败: %v", err)
	}

	if resp.Code != 0 {
		return false, fmt.Errorf("合约查询失败: %s", resp.Message)
	}

	// 解析验证结果
	var result struct {
		Valid bool `json:"valid"`
	}

	if err := json.Unmarshal(resp.ContractResult.Result, &result); err != nil {
		return false, fmt.Errorf("解析验证结果失败: %v", err)
	}

	return result.Valid, nil
}

// GetChainInfo 获取链信息
func (cms *ChainMakerService) GetChainInfo(ctx context.Context) (*discovery.ChainInfo, error) {
	return cms.client.GetChainInfo()
}

// GetBlockHeight 获取当前区块高度
func (cms *ChainMakerService) GetBlockHeight(ctx context.Context) (uint64, error) {
	chainInfo, err := cms.client.GetChainInfo()
	if err != nil {
		return 0, fmt.Errorf("获取链信息失败: %v", err)
	}
	return chainInfo.BlockHeight, nil
}

// SubscribeBlock 订阅区块事件
func (cms *ChainMakerService) SubscribeBlock(ctx context.Context) (<-chan *common.BlockInfo, error) {
	blockCh := make(chan *common.BlockInfo, 100)

	// 启动区块订阅
	go func() {
		defer close(blockCh)

		// 这里需要根据实际的SDK API来实现区块订阅
		// 示例代码，实际实现可能不同
		for {
			select {
			case <-ctx.Done():
				return
			default:
				// 获取最新区块信息的逻辑
				// blockInfo, err := cms.client.GetBlockByHeight(height)
				// if err == nil {
				//     blockCh <- blockInfo
				// }
			}
		}
	}()

	return blockCh, nil
}

// BatchStoreData 批量存储数据
func (cms *ChainMakerService) BatchStoreData(ctx context.Context, dataItems []DataItem) error {
	for _, item := range dataItems {
		if err := cms.StoreData(ctx, item.DataID, item.EncryptedData, item.OwnerID); err != nil {
			return fmt.Errorf("批量存储失败，数据ID %s: %v", item.DataID, err)
		}
	}
	return nil
}

// DataItem 数据项结构
type DataItem struct {
	DataID        string `json:"data_id"`
	EncryptedData string `json:"encrypted_data"`
	OwnerID       string `json:"owner_id"`
}
