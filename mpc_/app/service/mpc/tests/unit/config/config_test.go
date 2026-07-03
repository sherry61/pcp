package config

import (
	"os"
	"path/filepath"
	"testing"

	"blockchain_data_auth/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

func TestLoadConfig(t *testing.T) {
	// 创建临时配置文件
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "test_config.yaml")

	validConfig := `
chainmaker:
  chain_id: "chain1"
  org_id: "org1"
  node_addr: "127.0.0.1:12301"
  tls:
    hostname: "chainmaker.org"
    ca_cert_path: "crypto_config/ca/ca.crt"
  user:
    key_path: "crypto_config/user/client1/client1.sign.key"
    cert_path: "crypto_config/user/client1/client1.sign.crt"
  contracts:
    authorization:
      name: "authorization_contract"
      version: "1.0.0"
      runtime: "GASM"
      bytecode_path: "contracts/authorization.7z"
`

	err := os.WriteFile(configPath, []byte(validConfig), 0644)
	require.NoError(t, err)

	tests := []struct {
		name       string
		configPath string
		wantErr    bool
		setup      func() string
	}{
		{
			name:       "加载有效配置文件",
			configPath: configPath,
			wantErr:    false,
			setup:      nil,
		},
		{
			name:       "配置文件不存在",
			configPath: "/non/existent/path",
			wantErr:    true,
			setup:      nil,
		},
		{
			name:    "无效YAML格式",
			wantErr: true,
			setup: func() string {
				invalidPath := filepath.Join(tempDir, "invalid.yaml")
				err := os.WriteFile(invalidPath, []byte("invalid: yaml: content: ["), 0644)
				require.NoError(t, err)
				return invalidPath
			},
		},
		{
			name:       "默认配置路径-文件不存在",
			configPath: "",
			wantErr:    true,
			setup:      nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			testConfigPath := tt.configPath
			if tt.setup != nil {
				testConfigPath = tt.setup()
			}

			config, err := config.LoadConfig(testConfigPath)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, config)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, config)
				assert.Equal(t, "chain1", config.ChainMaker.ChainID)
				assert.Equal(t, "org1", config.ChainMaker.OrgID)
				assert.Equal(t, "127.0.0.1:12301", config.ChainMaker.NodeAddr)
			}
		})
	}
}

func TestConfigNormalizePaths(t *testing.T) {
	tempDir := t.TempDir()
	
	// 创建测试配置文件，使用相对路径
	configPath := filepath.Join(tempDir, "test_config.yaml")
	configContent := `
chainmaker:
  chain_id: "chain1"
  org_id: "org1"
  node_addr: "127.0.0.1:12301"
  tls:
    hostname: "chainmaker.org"
    ca_cert_path: "crypto_config/ca/ca.crt"
  user:
    key_path: "crypto_config/user/client1/client1.sign.key"
    cert_path: "crypto_config/user/client1/client1.sign.crt"
  contracts:
    authorization:
      name: "authorization_contract"
      version: "1.0.0"
      runtime: "GASM"
      bytecode_path: "contracts/authorization.7z"
`

	err := os.WriteFile(configPath, []byte(configContent), 0644)
	require.NoError(t, err)

	// 加载配置（LoadConfig内部会调用normalizePaths）
	config, err := config.LoadConfig(configPath)
	require.NoError(t, err)

	// 验证路径已被转换为绝对路径
	assert.True(t, filepath.IsAbs(config.ChainMaker.TLS.CACertPath))
	assert.True(t, filepath.IsAbs(config.ChainMaker.User.KeyPath))
	assert.True(t, filepath.IsAbs(config.ChainMaker.User.CertPath))
	assert.True(t, filepath.IsAbs(config.ChainMaker.Contracts["authorization"].BytecodePath))

	// 验证路径包含基础目录
	assert.Contains(t, config.ChainMaker.TLS.CACertPath, tempDir)
	assert.Contains(t, config.ChainMaker.User.KeyPath, tempDir)
	assert.Contains(t, config.ChainMaker.User.CertPath, tempDir)
	assert.Contains(t, config.ChainMaker.Contracts["authorization"].BytecodePath, tempDir)
}

func TestConfigNormalizePathsWithAbsolutePaths(t *testing.T) {
	tempDir := t.TempDir()
	
	// 创建测试配置文件，使用绝对路径
	configPath := filepath.Join(tempDir, "test_config.yaml")
	configContent := `
chainmaker:
  chain_id: "chain1"
  org_id: "org1"
  node_addr: "127.0.0.1:12301"
  tls:
    hostname: "chainmaker.org"
    ca_cert_path: "/absolute/path/ca.crt"
  user:
    key_path: "/absolute/path/client1.key"
    cert_path: "/absolute/path/client1.crt"
  contracts:
    authorization:
      name: "authorization_contract"
      version: "1.0.0"
      runtime: "GASM"
      bytecode_path: "/absolute/path/authorization.7z"
`

	err := os.WriteFile(configPath, []byte(configContent), 0644)
	require.NoError(t, err)

	// 加载配置
	config, err := config.LoadConfig(configPath)
	require.NoError(t, err)

	// 绝对路径应该保持不变
	assert.Equal(t, "/absolute/path/ca.crt", config.ChainMaker.TLS.CACertPath)
	assert.Equal(t, "/absolute/path/client1.key", config.ChainMaker.User.KeyPath)
	assert.Equal(t, "/absolute/path/client1.crt", config.ChainMaker.User.CertPath)
	assert.Equal(t, "/absolute/path/authorization.7z", config.ChainMaker.Contracts["authorization"].BytecodePath)
}

func TestConfigToClientConfig(t *testing.T) {
	config := &config.Config{
		ChainMaker: config.ChainMakerConfig{
			ChainID:  "test_chain",
			OrgID:    "test_org",
			NodeAddr: "127.0.0.1:12301",
			TLS: config.TLSConfig{
				Hostname:   "test.chainmaker.org",
				CACertPath: "/path/to/ca.crt",
			},
			User: config.UserConfig{
				KeyPath:  "/path/to/client.key",
				CertPath: "/path/to/client.crt",
			},
		},
	}

	clientConfig := config.ToClientConfig()

	assert.NotNil(t, clientConfig)
	assert.Equal(t, "test_chain", clientConfig.ChainID)
	assert.Equal(t, "test_org", clientConfig.OrgID)
	assert.Equal(t, "127.0.0.1:12301", clientConfig.NodeAddr)
	assert.Equal(t, "test.chainmaker.org", clientConfig.TLSHostName)
	assert.Equal(t, "/path/to/ca.crt", clientConfig.TLSCACertPath)
	assert.Equal(t, "/path/to/client.key", clientConfig.UserKeyPath)
	assert.Equal(t, "/path/to/client.crt", clientConfig.UserCertPath)
}

func TestConfigStructures(t *testing.T) {
	// 测试配置结构体的完整性
	config := config.Config{
		ChainMaker: config.ChainMakerConfig{
			ChainID:  "chain1",
			OrgID:    "org1",
			NodeAddr: "127.0.0.1:12301",
			TLS: config.TLSConfig{
				Hostname:   "chainmaker.org",
				CACertPath: "crypto_config/ca/ca.crt",
			},
			User: config.UserConfig{
				KeyPath:  "crypto_config/user/client1/client1.sign.key",
				CertPath: "crypto_config/user/client1/client1.sign.crt",
			},
			Contracts: map[string]config.ContractConfig{
				"authorization": {
					Name:         "authorization_contract",
					Version:      "1.0.0",
					Runtime:      "GASM",
					BytecodePath: "contracts/authorization.7z",
				},
				"verification": {
					Name:         "verification_contract",
					Version:      "1.0.0",
					Runtime:      "GASM", 
					BytecodePath: "contracts/verification.7z",
				},
			},
		},
	}

	// 验证结构体字段
	assert.Equal(t, "chain1", config.ChainMaker.ChainID)
	assert.Equal(t, "org1", config.ChainMaker.OrgID)
	assert.Equal(t, "127.0.0.1:12301", config.ChainMaker.NodeAddr)
	assert.Equal(t, "chainmaker.org", config.ChainMaker.TLS.Hostname)
	assert.Len(t, config.ChainMaker.Contracts, 2)
	assert.Contains(t, config.ChainMaker.Contracts, "authorization")
	assert.Contains(t, config.ChainMaker.Contracts, "verification")
}

func TestYamlMarshalUnmarshal(t *testing.T) {
	originalConfig := config.Config{
		ChainMaker: config.ChainMakerConfig{
			ChainID:  "test_chain",
			OrgID:    "test_org",
			NodeAddr: "127.0.0.1:12301",
			TLS: config.TLSConfig{
				Hostname:   "test.chainmaker.org",
				CACertPath: "crypto_config/ca/ca.crt",
			},
			User: config.UserConfig{
				KeyPath:  "crypto_config/user/client1/client1.sign.key",
				CertPath: "crypto_config/user/client1/client1.sign.crt",
			},
			Contracts: map[string]config.ContractConfig{
				"authorization": {
					Name:         "authorization_contract",
					Version:      "1.0.0",
					Runtime:      "GASM",
					BytecodePath: "contracts/authorization.7z",
				},
			},
		},
	}

	// 序列化为YAML
	yamlData, err := yaml.Marshal(&originalConfig)
	assert.NoError(t, err)
	assert.NotEmpty(t, yamlData)

	// 反序列化回配置对象
	var parsedConfig config.Config
	err = yaml.Unmarshal(yamlData, &parsedConfig)
	assert.NoError(t, err)

	// 验证反序列化的配置与原始配置相同
	assert.Equal(t, originalConfig.ChainMaker.ChainID, parsedConfig.ChainMaker.ChainID)
	assert.Equal(t, originalConfig.ChainMaker.OrgID, parsedConfig.ChainMaker.OrgID)
	assert.Equal(t, originalConfig.ChainMaker.NodeAddr, parsedConfig.ChainMaker.NodeAddr)
	assert.Equal(t, originalConfig.ChainMaker.TLS.Hostname, parsedConfig.ChainMaker.TLS.Hostname)
	assert.Equal(t, originalConfig.ChainMaker.TLS.CACertPath, parsedConfig.ChainMaker.TLS.CACertPath)
	assert.Equal(t, originalConfig.ChainMaker.User.KeyPath, parsedConfig.ChainMaker.User.KeyPath)
	assert.Equal(t, originalConfig.ChainMaker.User.CertPath, parsedConfig.ChainMaker.User.CertPath)
	assert.Len(t, parsedConfig.ChainMaker.Contracts, 1)
	assert.Contains(t, parsedConfig.ChainMaker.Contracts, "authorization")
}

func TestLoadConfigWithMissingFields(t *testing.T) {
	// 测试配置文件缺少某些字段的情况
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "minimal_config.yaml")

	minimalConfig := `
chainmaker:
  chain_id: "chain1"
  node_addr: "127.0.0.1:12301"
`

	err := os.WriteFile(configPath, []byte(minimalConfig), 0644)
	require.NoError(t, err)

	config, err := config.LoadConfig(configPath)
	assert.NoError(t, err)
	assert.NotNil(t, config)
	assert.Equal(t, "chain1", config.ChainMaker.ChainID)
	assert.Equal(t, "127.0.0.1:12301", config.ChainMaker.NodeAddr)
	// 缺少的字段应该是零值
	assert.Empty(t, config.ChainMaker.OrgID)
	assert.Empty(t, config.ChainMaker.TLS.Hostname)
}

func TestClientConfigStructure(t *testing.T) {
	clientConfig := &config.ClientConfig{
		NodeAddr:      "127.0.0.1:12301",
		ChainID:       "test_chain",
		OrgID:         "test_org",
		UserKeyPath:   "/path/to/key",
		UserCertPath:  "/path/to/cert",
		TLSHostName:   "test.chainmaker.org",
		TLSCACertPath: "/path/to/ca",
	}

	assert.Equal(t, "127.0.0.1:12301", clientConfig.NodeAddr)
	assert.Equal(t, "test_chain", clientConfig.ChainID)
	assert.Equal(t, "test_org", clientConfig.OrgID)
	assert.Equal(t, "/path/to/key", clientConfig.UserKeyPath)
	assert.Equal(t, "/path/to/cert", clientConfig.UserCertPath)
	assert.Equal(t, "test.chainmaker.org", clientConfig.TLSHostName)
	assert.Equal(t, "/path/to/ca", clientConfig.TLSCACertPath)
}