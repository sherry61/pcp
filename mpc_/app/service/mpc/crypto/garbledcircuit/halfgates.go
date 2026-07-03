package garbledcircuit

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
)

// WireLabel 表示混淆电路中的导线标签
type WireLabel struct {
	Value [16]byte // 128位标签值
	PermBit bool   // 置换位（用于Free-XOR）
}

// HalfGateTable 表示Half-Gates协议的混淆表
type HalfGateTable struct {
	TG []byte // Generator's half gate密文（16字节）
	TE []byte // Evaluator's half gate密文（16字节）
}

// HalfGates Half-Gates协议实现
type HalfGates struct {
	Delta WireLabel      // Garbler的全局密钥差值（用于Free-XOR）
	Hash  func([]byte) []byte // 相关鲁棒性哈希函数
}

// NewHalfGates 创建新的Half-Gates实例
func NewHalfGates() (*HalfGates, error) {
	// 生成随机Delta值（置换位为1）
	delta := WireLabel{PermBit: true}
	if _, err := rand.Read(delta.Value[:]); err != nil {
		return nil, fmt.Errorf("生成Delta失败: %v", err)
	}
	// 确保置换位为1
	delta.Value[0] |= 0x01

	return &HalfGates{
		Delta: delta,
		Hash:  correlationRobustHash,
	}, nil
}

// GenerateWireLabelPair 生成一对导线标签（0标签和1标签）
func (hg *HalfGates) GenerateWireLabelPair() (label0, label1 WireLabel, err error) {
	// 生成随机0标签
	if _, err = rand.Read(label0.Value[:]); err != nil {
		return
	}
	label0.PermBit = false
	label0.Value[0] &= 0xFE // 确保置换位为0

	// 1标签 = 0标签 XOR Delta
	label1 = xorWireLabel(label0, hg.Delta)

	return
}

// GarbleANDGate 使用Half-Gates协议混淆AND门
// 输入: a的标签对, b的标签对, 输出c的标签对, a和b的实际值
// 返回: 混淆表
func (hg *HalfGates) GarbleANDGate(aLabels, bLabels [2]WireLabel, pa, pb bool) (table HalfGateTable, cLabels [2]WireLabel, err error) {
	cLabels[0], cLabels[1], err = hg.GenerateWireLabelPair()
	if err != nil {
		return
	}

	// The previous code attempted a Half-Gates optimization but used pa/pb for
	// intermediate and evaluator-owned wires where the clear value is unknown.
	// That produces labels outside the garbler's output-label set. Use a
	// complete 4-row garbled table here; it is slower but protocol-correct.
	for aBit := 0; aBit <= 1; aBit++ {
		for bBit := 0; bBit <= 1; bBit++ {
			outBit := 0
			if aBit == 1 && bBit == 1 {
				outBit = 1
			}
			plain := encodeAuthenticatedLabel(cLabels[outBit])
			pad := deriveANDPad(aLabels[aBit], bLabels[bBit], len(plain))
			table.TG = append(table.TG, xorBytes(plain, pad)...)
		}
	}
	return
}

// EvaluateANDGate Evaluator评估AND门
// 输入: a的实际标签, b的实际标签, 混淆表
// 返回: 输出c的标签
func (hg *HalfGates) EvaluateANDGate(aLabel, bLabel WireLabel, table HalfGateTable) (cLabel WireLabel, err error) {
	const entrySize = 32
	if len(table.TG)%entrySize != 0 {
		return WireLabel{}, fmt.Errorf("AND门混淆表长度无效: %d", len(table.TG))
	}

	for offset := 0; offset < len(table.TG); offset += entrySize {
		entry := table.TG[offset : offset+entrySize]
		pad := deriveANDPad(aLabel, bLabel, entrySize)
		plain := xorBytes(entry, pad)
		label, ok := decodeAuthenticatedLabel(plain)
		if ok {
			return label, nil
		}
	}

	return WireLabel{}, fmt.Errorf("AND门没有可解密的输出标签")
}

// GarbleXORGate 混淆XOR门（使用Free-XOR技术，无需混淆表）
func (hg *HalfGates) GarbleXORGate(aLabels, bLabels [2]WireLabel) (cLabels [2]WireLabel) {
	// Free-XOR requires every label pair to share the same global Delta:
	// c0 = a0 XOR b0, c1 = c0 XOR Delta.
	cLabels[0] = xorWireLabel(aLabels[0], bLabels[0])
	cLabels[1] = xorWireLabel(cLabels[0], hg.Delta)
	return
}

// EvaluateXORGate Evaluator评估XOR门
func (hg *HalfGates) EvaluateXORGate(aLabel, bLabel WireLabel) WireLabel {
	return xorWireLabel(aLabel, bLabel)
}

// GarbleNOTGate 混淆NOT门（交换标签，无需混淆表）
func (hg *HalfGates) GarbleNOTGate(aLabels [2]WireLabel) [2]WireLabel {
	// NOT门只需交换0标签和1标签
	return [2]WireLabel{aLabels[1], aLabels[0]}
}

// EvaluateNOTGate Evaluator评估NOT门（不需要操作，在混淆时已处理）
func (hg *HalfGates) EvaluateNOTGate(aLabel WireLabel) WireLabel {
	// Evaluator端不需要操作，因为Garbler已经交换了标签
	return aLabel
}

// ========== 辅助函数 ==========

// xorWireLabel 对两个导线标签进行XOR操作
func xorWireLabel(a, b WireLabel) WireLabel {
	var result WireLabel
	for i := 0; i < 16; i++ {
		result.Value[i] = a.Value[i] ^ b.Value[i]
	}
	result.PermBit = a.PermBit != b.PermBit // XOR置换位
	return result
}

// xorBytes16 对两个16字节数组进行XOR
func xorBytes16(a, b [16]byte) [16]byte {
	var result [16]byte
	for i := 0; i < 16; i++ {
		result[i] = a[i] ^ b[i]
	}
	return result
}

func xorBytes(a, b []byte) []byte {
	result := make([]byte, len(a))
	for i := range a {
		result[i] = a[i] ^ b[i]
	}
	return result
}

func encodeAuthenticatedLabel(label WireLabel) []byte {
	plain := make([]byte, 32)
	copy(plain[:16], label.Value[:])
	copy(plain[16:], labelAuthTag(label))
	return plain
}

func decodeAuthenticatedLabel(plain []byte) (WireLabel, bool) {
	if len(plain) != 32 {
		return WireLabel{}, false
	}
	var label WireLabel
	copy(label.Value[:], plain[:16])
	label.PermBit = label.Value[0]&0x01 == 1
	expected := labelAuthTag(label)
	for i := 0; i < 16; i++ {
		if plain[16+i] != expected[i] {
			return WireLabel{}, false
		}
	}
	return label, true
}

func labelAuthTag(label WireLabel) []byte {
	h := sha256.New()
	h.Write([]byte("gc-label-v1"))
	h.Write(label.Value[:])
	digest := h.Sum(nil)
	return digest[:16]
}

func deriveANDPad(aLabel, bLabel WireLabel, size int) []byte {
	h := sha256.New()
	h.Write([]byte("gc-and-v1"))
	h.Write(aLabel.Value[:])
	h.Write(bLabel.Value[:])
	seed := h.Sum(nil)

	pad := make([]byte, 0, size)
	counter := uint64(0)
	for len(pad) < size {
		blockHash := sha256.New()
		blockHash.Write(seed)
		var counterBytes [8]byte
		binary.BigEndian.PutUint64(counterBytes[:], counter)
		blockHash.Write(counterBytes[:])
		pad = append(pad, blockHash.Sum(nil)...)
		counter++
	}
	return pad[:size]
}

// correlationRobustHash 相关鲁棒性哈希函数
// 用于Half-Gates协议，确保安全性
func correlationRobustHash(input []byte) []byte {
	// 使用SHA-256作为底层哈希
	hash := sha256.New()
	hash.Write(input)
	digest := hash.Sum(nil)

	// 使用AES作为伪随机函数增强相关鲁棒性
	block, err := aes.NewCipher(digest[:16])
	if err != nil {
		panic(fmt.Sprintf("AES初始化失败: %v", err))
	}

	var counter [16]byte
	binary.BigEndian.PutUint64(counter[8:], uint64(len(input)))

	var output [16]byte
	block.Encrypt(output[:], counter[:])

	return output[:]
}

// EncryptLabel 使用对称加密加密标签（用于传输）
func EncryptLabel(label WireLabel, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	plaintext := label.Value[:]
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	return ciphertext, nil
}

// DecryptLabel 解密标签
func DecryptLabel(ciphertext []byte, key []byte) (WireLabel, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return WireLabel{}, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return WireLabel{}, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return WireLabel{}, fmt.Errorf("密文长度不足")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return WireLabel{}, err
	}

	var label WireLabel
	copy(label.Value[:], plaintext)
	label.PermBit = label.Value[0]&0x01 == 1

	return label, nil
}
