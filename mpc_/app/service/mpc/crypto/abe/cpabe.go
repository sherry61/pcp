package abe

import (
	"encoding/json"
	"fmt"

	"blockchain_data_auth/models"
	"github.com/fentec-project/gofe/abe"
)

type CPABE struct {
	scheme *abe.FAME
}

func NewCPABE() (*CPABE, error) {
	scheme := abe.NewFAME()
	return &CPABE{scheme: scheme}, nil
}

// Setup 初始化主密钥和公钥
func (c *CPABE) Setup() (*abe.FAMEPubKey, *abe.FAMESecKey, error) {
	return c.scheme.GenerateMasterKeys()
}

// GenerateAttribKeys 生成属性密钥
func (c *CPABE) GenerateAttribKeys(attributes []string, sk *abe.FAMESecKey) (*abe.FAMEAttribKeys, error) {
	return c.scheme.GenerateAttribKeys(attributes, sk)
}

// Encrypt 使用策略加密数据
func (c *CPABE) Encrypt(msg []byte, policy string, pk *abe.FAMEPubKey) ([]byte, error) {
	msp, err := abe.BooleanToMSP(policy, false)
	if err != nil {
		return nil, fmt.Errorf("invalid policy: %v", err)
	}

	cipher, err := c.scheme.Encrypt(string(msg), msp, pk)
	if err != nil {
		return nil, err
	}

	// 序列化密文
	cipherBytes, err := json.Marshal(cipher)
	if err != nil {
		return nil, err
	}

	return cipherBytes, nil
}

// Decrypt 解密
func (c *CPABE) Decrypt(ciphertext []byte, keys *abe.FAMEAttribKeys, pk *abe.FAMEPubKey) ([]byte, error) {
	var cipher *abe.FAMECipher
	err := json.Unmarshal(ciphertext, &cipher)
	if err != nil {
		return nil, err
	}

	msg, err := c.scheme.Decrypt(cipher, keys, pk)
	if err != nil {
		return nil, err
	}

	return []byte(msg), nil
}

// GeneratePolicy 根据授权信息生成访问策略
func GeneratePolicy(auth *models.Authorization) string {
	// 修复：使用用户ID而不是授权ID，并且允许银行解密
	// 策略允许银行和具有用户ID的实体解密
	policy := fmt.Sprintf("(user_id:%s AND (", auth.UserID)

	for i, tag := range auth.InfoTags {
		if i > 0 {
			policy += " OR "
		}
		policy += fmt.Sprintf("info_tag:%s", tag)
	}

	policy += "))"
	return policy
}
