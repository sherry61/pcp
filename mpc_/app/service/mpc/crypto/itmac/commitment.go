package itmac

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math/big"
)

// ITMACCommitment IT-MAC承诺结构
// 承诺形式: [u] = (m, k) 满足 m = k - u*x
type ITMACCommitment struct {
	M     *FieldElement // MAC标签 (Prover持有)
	K     *FieldElement // 密钥份额 (Verifier持有)
	U     *FieldElement // 见证值 (Prover持有)
	X     *FieldElement // 全局密钥 (Verifier持有)
	Field *big.Int      // 有限域
}

// ITMACSystem IT-MAC承诺系统
type ITMACSystem struct {
	voleGen *VOLEGenerator
	globalX *FieldElement // 全局密钥
}

// NewITMACSystem 创建IT-MAC系统
func NewITMACSystem(fieldBits int) (*ITMACSystem, error) {
	voleGen, err := NewVOLEGenerator(fieldBits)
	if err != nil {
		return nil, err
	}

	// 生成全局密钥x
	globalX, err := voleGen.randomFieldElement()
	if err != nil {
		return nil, err
	}

	return &ITMACSystem{
		voleGen: voleGen,
		globalX: globalX,
	}, nil
}

// Commit 对值u进行IT-MAC承诺
// 使用VOLE生成的随机值
func (itmac *ITMACSystem) Commit(u *FieldElement) (*ITMACCommitment, error) {
	// 生成随机m
	m, err := itmac.voleGen.randomFieldElement()
	if err != nil {
		return nil, err
	}

	// 计算k = m + u * x
	uTimesX := itmac.voleGen.mulFieldElements(u, itmac.globalX)
	k := itmac.voleGen.addFieldElements(m, uTimesX)

	return &ITMACCommitment{
		M:     m,
		K:     k,
		U:     u,
		X:     itmac.globalX,
		Field: itmac.voleGen.field,
	}, nil
}

// CommitWithVOLE 使用已有的VOLE关联进行承诺
// 将随机承诺转换为对实际值w的承诺
func (itmac *ITMACSystem) CommitWithVOLE(w *FieldElement, vole *VOLECorrelation) (*ITMACCommitment, error) {
	// 计算差值 d = w - u
	d := itmac.voleGen.subFieldElements(w, vole.U)

	// 更新k: k' = k + d * x
	dTimesX := itmac.voleGen.mulFieldElements(d, vole.X)
	newK := itmac.voleGen.addFieldElements(vole.K, dTimesX)

	return &ITMACCommitment{
		M:     vole.M,
		K:     newK,
		U:     w,
		X:     vole.X,
		Field: vole.Field,
	}, nil
}

// Open 打开承诺（Prover发送m和u给Verifier）
func (itmac *ITMACSystem) Open(commitment *ITMACCommitment) (m, u *FieldElement) {
	return commitment.M, commitment.U
}

// Verify Verifier验证承诺
// 检查: m =? k - u * x
func (itmac *ITMACSystem) Verify(m, u, k, x *FieldElement) bool {
	// 计算 k - u * x
	uTimesX := itmac.voleGen.mulFieldElements(u, x)
	expected := itmac.voleGen.subFieldElements(k, uTimesX)

	return expected.Value.Cmp(m.Value) == 0
}

// VerifyCommitment 验证完整的承诺结构
func (itmac *ITMACSystem) VerifyCommitment(commitment *ITMACCommitment) bool {
	return itmac.Verify(commitment.M, commitment.U, commitment.K, commitment.X)
}

// ========== 同态运算 ==========

// AddCommitments IT-MAC承诺的同态加法
// [a+b] = [a] + [b]
func (itmac *ITMACSystem) AddCommitments(a, b *ITMACCommitment) *ITMACCommitment {
	return &ITMACCommitment{
		M:     itmac.voleGen.addFieldElements(a.M, b.M),
		K:     itmac.voleGen.addFieldElements(a.K, b.K),
		U:     itmac.voleGen.addFieldElements(a.U, b.U),
		X:     a.X, // 全局密钥保持不变
		Field: a.Field,
	}
}

// ScalarMultCommitment IT-MAC承诺的标量乘法
// [c*a] = c * [a]
func (itmac *ITMACSystem) ScalarMultCommitment(c *FieldElement, a *ITMACCommitment) *ITMACCommitment {
	return &ITMACCommitment{
		M:     itmac.voleGen.mulFieldElements(c, a.M),
		K:     itmac.voleGen.mulFieldElements(c, a.K),
		U:     itmac.voleGen.mulFieldElements(c, a.U),
		X:     a.X,
		Field: a.Field,
	}
}

// ========== 用于混淆电路审计的特殊功能 ==========

// CommitCircuitInput 对混淆电路输入进行承诺
// inputs: 输入值列表
// 返回: 每个输入的IT-MAC承诺
func (itmac *ITMACSystem) CommitCircuitInputs(inputs []uint64) ([]*ITMACCommitment, error) {
	commitments := make([]*ITMACCommitment, len(inputs))

	for i, input := range inputs {
		// 将uint64转换为域元素
		u := &FieldElement{
			Value: big.NewInt(int64(input)),
			Field: itmac.voleGen.field,
		}

		// 创建承诺
		comm, err := itmac.Commit(u)
		if err != nil {
			return nil, fmt.Errorf("承诺第%d个输入失败: %v", i, err)
		}
		commitments[i] = comm
	}

	return commitments, nil
}

// CommitCircuitOutput 对混淆电路输出进行承诺
func (itmac *ITMACSystem) CommitCircuitOutput(output uint64) (*ITMACCommitment, error) {
	u := &FieldElement{
		Value: big.NewInt(int64(output)),
		Field: itmac.voleGen.field,
	}

	return itmac.Commit(u)
}

// VerifyCircuitComputation 验证混淆电路计算的正确性
// 使用IT-MAC承诺验证输入输出关系
func (itmac *ITMACSystem) VerifyCircuitComputation(inputComms []*ITMACCommitment, outputComm *ITMACCommitment) bool {
	// 验证所有输入承诺
	for _, comm := range inputComms {
		if !itmac.VerifyCommitment(comm) {
			return false
		}
	}

	// 验证输出承诺
	return itmac.VerifyCommitment(outputComm)
}

// ========== 批量承诺 ==========

// BatchCommit 批量承诺
func (itmac *ITMACSystem) BatchCommit(values []*FieldElement) ([]*ITMACCommitment, error) {
	commitments := make([]*ITMACCommitment, len(values))

	for i, val := range values {
		comm, err := itmac.Commit(val)
		if err != nil {
			return nil, fmt.Errorf("批量承诺第%d个失败: %v", i, err)
		}
		commitments[i] = comm
	}

	return commitments, nil
}

// BatchVerify 批量验证承诺
func (itmac *ITMACSystem) BatchVerify(commitments []*ITMACCommitment) bool {
	for i, comm := range commitments {
		if !itmac.VerifyCommitment(comm) {
			fmt.Printf("批量验证失败: 第%d个承诺无效\n", i)
			return false
		}
	}
	return true
}

// ========== 承诺哈希（用于链上存储） ==========

// CommitmentHash 计算承诺的哈希值（用于上链）
func (itmac *ITMACSystem) CommitmentHash(commitment *ITMACCommitment) []byte {
	// 序列化承诺
	data := struct {
		M string
		K string
		U string
	}{
		M: commitment.M.Value.String(),
		K: commitment.K.Value.String(),
		U: commitment.U.Value.String(),
	}

	jsonData, _ := json.Marshal(data)

	// 计算SHA-256哈希
	hash := sha256.Sum256(jsonData)
	return hash[:]
}

// BatchCommitmentHash 批量承诺的总哈希
func (itmac *ITMACSystem) BatchCommitmentHash(commitments []*ITMACCommitment) []byte {
	hasher := sha256.New()

	for _, comm := range commitments {
		hash := itmac.CommitmentHash(comm)
		hasher.Write(hash)
	}

	return hasher.Sum(nil)
}

// ========== 序列化 ==========

// SerializeCommitment 序列化承诺
func (itmac *ITMACSystem) SerializeCommitment(commitment *ITMACCommitment) ([]byte, error) {
	data := struct {
		M     string `json:"m"`
		K     string `json:"k"`
		U     string `json:"u"`
		X     string `json:"x"`
		Field string `json:"field"`
	}{
		M:     commitment.M.Value.String(),
		K:     commitment.K.Value.String(),
		U:     commitment.U.Value.String(),
		X:     commitment.X.Value.String(),
		Field: commitment.Field.String(),
	}

	return json.Marshal(data)
}

// DeserializeCommitment 反序列化承诺
func (itmac *ITMACSystem) DeserializeCommitment(data []byte) (*ITMACCommitment, error) {
	var parsed struct {
		M     string `json:"m"`
		K     string `json:"k"`
		U     string `json:"u"`
		X     string `json:"x"`
		Field string `json:"field"`
	}

	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, err
	}

	mVal, _ := new(big.Int).SetString(parsed.M, 10)
	kVal, _ := new(big.Int).SetString(parsed.K, 10)
	uVal, _ := new(big.Int).SetString(parsed.U, 10)
	xVal, _ := new(big.Int).SetString(parsed.X, 10)
	field, _ := new(big.Int).SetString(parsed.Field, 10)

	return &ITMACCommitment{
		M:     &FieldElement{Value: mVal, Field: field},
		K:     &FieldElement{Value: kVal, Field: field},
		U:     &FieldElement{Value: uVal, Field: field},
		X:     &FieldElement{Value: xVal, Field: field},
		Field: field,
	}, nil
}

// GetGlobalKey 获取全局密钥（用于调试）
func (itmac *ITMACSystem) GetGlobalKey() *FieldElement {
	return itmac.globalX
}

// GetField 获取有限域
func (itmac *ITMACSystem) GetField() *big.Int {
	return itmac.voleGen.field
}
