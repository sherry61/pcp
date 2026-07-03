package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ChainMaker ChainMakerConfig `yaml:"chainmaker"`
	Audit      AuditConfig      `yaml:"audit"`
}

type ChainMakerConfig struct {
	ChainID   string                    `yaml:"chain_id"`
	OrgID     string                    `yaml:"org_id"`
	NodeAddr  string                    `yaml:"node_addr"`
	TLS       TLSConfig                 `yaml:"tls"`
	User      UserConfig                `yaml:"user"`
	Contracts map[string]ContractConfig `yaml:"contracts"`
}

type TLSConfig struct {
	Hostname   string `yaml:"hostname"`
	CACertPath string `yaml:"ca_cert_path"`
}

type UserConfig struct {
	KeyPath  string `yaml:"key_path"`
	CertPath string `yaml:"cert_path"`
}

type ContractConfig struct {
	Name         string `yaml:"name"`
	Version      string `yaml:"version"`
	Runtime      string `yaml:"runtime"`
	BytecodePath string `yaml:"bytecode_path"`
}

type AuditConfig struct {
	BaseURL string `yaml:"base_url"`
	Enabled bool   `yaml:"enabled"`
}

func LoadConfig(configPath string) (*Config, error) {
	// 如果没有指定配置文件路径，使用默认路径
	if configPath == "" {
		configPath = "./config/config.yaml"
	}

	// 检查文件是否存在
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("config file not found: %s", configPath)
	}

	// 读取配置文件
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %v", err)
	}

	// 解析YAML
	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %v", err)
	}

	// 转换相对路径为绝对路径
	if err := config.normalizePaths(filepath.Dir(configPath)); err != nil {
		return nil, fmt.Errorf("failed to normalize paths: %v", err)
	}

	return &config, nil
}

// normalizePaths 将相对路径转换为绝对路径
func (c *Config) normalizePaths(baseDir string) error {
	// TLS CA证书路径
	if !filepath.IsAbs(c.ChainMaker.TLS.CACertPath) {
		c.ChainMaker.TLS.CACertPath = filepath.Join(baseDir, c.ChainMaker.TLS.CACertPath)
	}

	// 用户密钥路径
	if !filepath.IsAbs(c.ChainMaker.User.KeyPath) {
		c.ChainMaker.User.KeyPath = filepath.Join(baseDir, c.ChainMaker.User.KeyPath)
	}

	// 用户证书路径
	if !filepath.IsAbs(c.ChainMaker.User.CertPath) {
		c.ChainMaker.User.CertPath = filepath.Join(baseDir, c.ChainMaker.User.CertPath)
	}

	// 合约字节码路径
	for name, contract := range c.ChainMaker.Contracts {
		if !filepath.IsAbs(contract.BytecodePath) {
			contract.BytecodePath = filepath.Join(baseDir, contract.BytecodePath)
			c.ChainMaker.Contracts[name] = contract
		}
	}

	return nil
}

// ToClientConfig 转换为客户端配置
func (c *Config) ToClientConfig() *ClientConfig {
	return &ClientConfig{
		NodeAddr:      c.ChainMaker.NodeAddr,
		ChainID:       c.ChainMaker.ChainID,
		OrgID:         c.ChainMaker.OrgID,
		UserKeyPath:   c.ChainMaker.User.KeyPath,
		UserCertPath:  c.ChainMaker.User.CertPath,
		TLSHostName:   c.ChainMaker.TLS.Hostname,
		TLSCACertPath: c.ChainMaker.TLS.CACertPath,
	}
}

type ClientConfig struct {
	NodeAddr      string
	ChainID       string
	OrgID         string
	UserKeyPath   string
	UserCertPath  string
	TLSHostName   string
	TLSCACertPath string
}
