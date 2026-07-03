package garbledcircuit

import (
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"math/big"
)

// OTSender OT协议的发送方（Garbler/银行）
type OTSender struct {
	securityParam int       // 安全参数（比特数）
	p             *big.Int  // 大素数
	g             *big.Int  // 生成元
	privateKey    *big.Int  // 私钥
	publicKey     *big.Int  // 公钥
}

// OTReceiver OT协议的接收方（Evaluator/数据中心B）
type OTReceiver struct {
	securityParam int
	p             *big.Int
	g             *big.Int
}

// OTMessage OT协议的消息
type OTMessage struct {
	PublicKey   *big.Int // 发送方的公钥
	EncryptedM0 []byte   // 加密的m0
	EncryptedM1 []byte   // 加密的m1
}

// OTRequest OT协议的请求
type OTRequest struct {
	Choice     bool     // 接收方的选择位
	PublicKeyR *big.Int // 接收方的公钥
}

// NewOTSender 创建OT发送方
func NewOTSender(securityParam int) (*OTSender, error) {
	// 生成大素数p和生成元g（简化版本，实际应使用安全的参数）
	// 这里使用2048位素数
	p, err := rand.Prime(rand.Reader, securityParam)
	if err != nil {
		return nil, fmt.Errorf("生成素数失败: %v", err)
	}

	// 生成元g（简化为2）
	g := big.NewInt(2)

	// 生成私钥
	privateKey, err := rand.Int(rand.Reader, new(big.Int).Sub(p, big.NewInt(2)))
	if err != nil {
		return nil, fmt.Errorf("生成私钥失败: %v", err)
	}
	privateKey.Add(privateKey, big.NewInt(1))

	// 计算公钥 h = g^a mod p
	publicKey := new(big.Int).Exp(g, privateKey, p)

	return &OTSender{
		securityParam: securityParam,
		p:             p,
		g:             g,
		privateKey:    privateKey,
		publicKey:     publicKey,
	}, nil
}

// NewOTReceiver 创建OT接收方
func NewOTReceiver(sender *OTSender) *OTReceiver {
	return &OTReceiver{
		securityParam: sender.securityParam,
		p:             sender.p,
		g:             sender.g,
	}
}

// SendLabels 发送方发送两个标签，接收方只能获得一个
// labels: [label0, label1] 两个可选的标签
// choice: 接收方的选择（true选择label1, false选择label0）
// 返回: OT消息
func (ot *OTSender) SendLabels(labels [2]WireLabel) (*OTMessage, error) {
	// 将标签转换为字节
	m0 := labels[0].Value[:]
	m1 := labels[1].Value[:]

	// 生成随机数k0和k1
	k0, err := rand.Int(rand.Reader, ot.p)
	if err != nil {
		return nil, err
	}
	k1, err := rand.Int(rand.Reader, ot.p)
	if err != nil {
		return nil, err
	}

	// 计算 pk0 = g^k0 mod p, pk1 = g^k1 mod p
	pk0 := new(big.Int).Exp(ot.g, k0, ot.p)
	pk1 := new(big.Int).Exp(ot.g, k1, ot.p)

	// 使用pk0和pk1作为密钥加密m0和m1
	encM0, err := encryptWithKey(m0, pk0.Bytes())
	if err != nil {
		return nil, err
	}
	encM1, err := encryptWithKey(m1, pk1.Bytes())
	if err != nil {
		return nil, err
	}

	return &OTMessage{
		PublicKey:   ot.publicKey,
		EncryptedM0: encM0,
		EncryptedM1: encM1,
	}, nil
}

// ReceiveLabel 接收方根据选择获取对应的标签
// message: OT消息
// choice: 选择位（true选择label1, false选择label0）
// 返回: 选中的标签
func (otr *OTReceiver) ReceiveLabel(message *OTMessage, choice bool) (WireLabel, error) {
	// 生成随机数r
	r, err := rand.Int(rand.Reader, otr.p)
	if err != nil {
		return WireLabel{}, err
	}

	// 计算公钥: pkr = g^r mod p (如果choice=0) 或 pkr = h * g^r mod p (如果choice=1)
	pkr := new(big.Int).Exp(otr.g, r, otr.p)
	if choice {
		pkr.Mul(pkr, message.PublicKey)
		pkr.Mod(pkr, otr.p)
	}

	// 接收方只能解密对应choice的密文
	var encrypted []byte
	if choice {
		encrypted = message.EncryptedM1
	} else {
		encrypted = message.EncryptedM0
	}

	// 解密
	decrypted, err := decryptWithKey(encrypted, pkr.Bytes())
	if err != nil {
		return WireLabel{}, err
	}

	// 转换为WireLabel
	var label WireLabel
	copy(label.Value[:], decrypted)
	label.PermBit = label.Value[0]&0x01 == 1

	return label, nil
}

// BatchOT 批量OT传输
// 用于一次性传输多个标签
func (ot *OTSender) BatchSendLabels(labelPairs [][2]WireLabel) ([]*OTMessage, error) {
	messages := make([]*OTMessage, len(labelPairs))
	for i, labels := range labelPairs {
		msg, err := ot.SendLabels(labels)
		if err != nil {
			return nil, fmt.Errorf("批量OT第%d个失败: %v", i, err)
		}
		messages[i] = msg
	}
	return messages, nil
}

// BatchReceiveLabels 批量接收标签
func (otr *OTReceiver) BatchReceiveLabels(messages []*OTMessage, choices []bool) ([]WireLabel, error) {
	if len(messages) != len(choices) {
		return nil, fmt.Errorf("消息数量与选择数量不匹配")
	}

	labels := make([]WireLabel, len(messages))
	for i, msg := range messages {
		label, err := otr.ReceiveLabel(msg, choices[i])
		if err != nil {
			return nil, fmt.Errorf("批量OT第%d个接收失败: %v", i, err)
		}
		labels[i] = label
	}
	return labels, nil
}

// ========== 辅助函数 ==========

// encryptWithKey 使用密钥加密数据
func encryptWithKey(data []byte, key []byte) ([]byte, error) {
	// 使用简单的XOR加密（生产环境应使用AES-GCM等）
	// 这里使用SHA-256扩展密钥
	hash := sha256.Sum256(key)

	encrypted := make([]byte, len(data))
	for i := range data {
		encrypted[i] = data[i] ^ hash[i%len(hash)]
	}

	return encrypted, nil
}

// decryptWithKey 使用密钥解密数据
func decryptWithKey(encrypted []byte, key []byte) ([]byte, error) {
	// XOR解密与加密相同
	return encryptWithKey(encrypted, key)
}

// ========== 优化的1-out-of-2 OT扩展 ==========

// OTExtension OT扩展协议（用于大量OT传输）
type OTExtension struct {
	baseOT       *OTSender
	securityParam int
}

// NewOTExtension 创建OT扩展实例
func NewOTExtension(securityParam int) (*OTExtension, error) {
	baseOT, err := NewOTSender(securityParam)
	if err != nil {
		return nil, err
	}

	return &OTExtension{
		baseOT:       baseOT,
		securityParam: securityParam,
	}, nil
}

// ExtendedSend 使用OT扩展发送大量标签
// 基于IKNP协议的简化实现
func (ote *OTExtension) ExtendedSend(labelPairs [][2]WireLabel) ([]*OTMessage, error) {
	// 简化实现：直接使用批量OT
	// 实际的OT扩展会使用κ个基础OT + 伪随机生成器来生成大量OT
	return ote.baseOT.BatchSendLabels(labelPairs)
}

// ========== OT协议的安全性验证 ==========

// VerifyOTSecurity 验证OT协议的安全性参数
func VerifyOTSecurity(ot *OTSender) bool {
	// 检查素数p的大小
	if ot.p.BitLen() < 2048 {
		return false
	}

	// 检查私钥的范围
	if ot.privateKey.Cmp(big.NewInt(1)) <= 0 || ot.privateKey.Cmp(ot.p) >= 0 {
		return false
	}

	// 检查公钥的有效性
	expectedPK := new(big.Int).Exp(ot.g, ot.privateKey, ot.p)
	if ot.publicKey.Cmp(expectedPK) != 0 {
		return false
	}

	return true
}

// ========== 用于测试的简化OT ==========

// SimpleOT 简化的OT实现（用于测试和演示）
type SimpleOT struct{}

// SimpleSend 简化的发送（不提供安全性，仅用于测试）
func (sot *SimpleOT) SimpleSend(labels [2]WireLabel, choice bool) WireLabel {
	if choice {
		return labels[1]
	}
	return labels[0]
}

// SimpleBatchSend 简化的批量发送
func (sot *SimpleOT) SimpleBatchSend(labelPairs [][2]WireLabel, choices []bool) []WireLabel {
	if len(labelPairs) != len(choices) {
		panic("标签对数量与选择数量不匹配")
	}

	labels := make([]WireLabel, len(labelPairs))
	for i := range labelPairs {
		labels[i] = sot.SimpleSend(labelPairs[i], choices[i])
	}
	return labels
}
