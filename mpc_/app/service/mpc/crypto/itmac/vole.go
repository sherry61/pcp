package itmac

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math/big"
)

// FieldElement 有限域元素（使用big.Int表示）
type FieldElement struct {
	Value *big.Int
	Field *big.Int // 域的模数
}

// VOLECorrelation VOLE关联随机数
// 满足关系: k = m + u * x
type VOLECorrelation struct {
	// Prover持有
	M *FieldElement // MAC标签
	U *FieldElement // 见证值

	// Verifier持有
	K *FieldElement // 密钥份额
	X *FieldElement // 全局密钥

	// 公共参数
	Field *big.Int // 有限域模数
}

// QVOLECorrelation 二次VOLE关联随机数
// 除了基本的VOLE关联，还包含: uy = u_alpha * u_beta
type QVOLECorrelation struct {
	// 基本VOLE关联
	Alpha *VOLECorrelation
	Beta  *VOLECorrelation
	Gamma *VOLECorrelation

	// 二次关联: uy = u_alpha * u_beta
	UY *FieldElement
	MY *FieldElement
	KY *FieldElement
}

// VOLEGenerator VOLE关联随机数生成器
type VOLEGenerator struct {
	field         *big.Int // 有限域模数（素数）
	securityParam int      // 安全参数
}

// NewVOLEGenerator 创建VOLE生成器
func NewVOLEGenerator(fieldBits int) (*VOLEGenerator, error) {
	// 生成大素数作为有限域模数
	field, err := rand.Prime(rand.Reader, fieldBits)
	if err != nil {
		return nil, fmt.Errorf("生成域失败: %v", err)
	}

	return &VOLEGenerator{
		field:         field,
		securityParam: fieldBits,
	}, nil
}

// GenerateVOLE 生成单个VOLE关联随机数
// 返回: (m, u) for Prover, (k, x) for Verifier
func (vg *VOLEGenerator) GenerateVOLE() (*VOLECorrelation, error) {
	// 生成随机的全局密钥x
	x, err := vg.randomFieldElement()
	if err != nil {
		return nil, err
	}

	// 生成随机的u（Prover的见证值）
	u, err := vg.randomFieldElement()
	if err != nil {
		return nil, err
	}

	// 生成随机的m（Prover的MAC标签）
	m, err := vg.randomFieldElement()
	if err != nil {
		return nil, err
	}

	// 计算k = m + u * x
	k := vg.addFieldElements(m, vg.mulFieldElements(u, x))

	return &VOLECorrelation{
		M:     m,
		U:     u,
		K:     k,
		X:     x,
		Field: vg.field,
	}, nil
}

// GenerateBatchVOLE 批量生成VOLE关联随机数
func (vg *VOLEGenerator) GenerateBatchVOLE(count int) ([]*VOLECorrelation, error) {
	correlations := make([]*VOLECorrelation, count)
	for i := 0; i < count; i++ {
		corr, err := vg.GenerateVOLE()
		if err != nil {
			return nil, fmt.Errorf("生成第%d个VOLE失败: %v", i, err)
		}
		correlations[i] = corr
	}
	return correlations, nil
}

// GenerateQVOLE 生成二次VOLE关联随机数
// 用于JesseQ协议中的乘法门验证
func (vg *VOLEGenerator) GenerateQVOLE() (*QVOLECorrelation, error) {
	// 生成三个基本VOLE关联
	alpha, err := vg.GenerateVOLE()
	if err != nil {
		return nil, err
	}
	beta, err := vg.GenerateVOLE()
	if err != nil {
		return nil, err
	}
	gamma, err := vg.GenerateVOLE()
	if err != nil {
		return nil, err
	}

	// 计算uy = u_alpha * u_beta
	uy := vg.mulFieldElements(alpha.U, beta.U)

	// 生成my（随机）
	my, err := vg.randomFieldElement()
	if err != nil {
		return nil, err
	}

	// 计算ky = my + uy * x
	ky := vg.addFieldElements(my, vg.mulFieldElements(uy, alpha.X))

	return &QVOLECorrelation{
		Alpha: alpha,
		Beta:  beta,
		Gamma: gamma,
		UY:    uy,
		MY:    my,
		KY:    ky,
	}, nil
}

// GenerateBatchQVOLE 批量生成二次VOLE关联随机数
func (vg *VOLEGenerator) GenerateBatchQVOLE(count int) ([]*QVOLECorrelation, error) {
	qcorrs := make([]*QVOLECorrelation, count)
	for i := 0; i < count; i++ {
		qcorr, err := vg.GenerateQVOLE()
		if err != nil {
			return nil, fmt.Errorf("生成第%d个QVOLE失败: %v", i, err)
		}
		qcorrs[i] = qcorr
	}
	return qcorrs, nil
}

// VerifyVOLERelation 验证VOLE关联关系是否正确
// k =? m + u * x
func (vg *VOLEGenerator) VerifyVOLERelation(corr *VOLECorrelation) bool {
	// 计算 m + u * x
	expected := vg.addFieldElements(corr.M, vg.mulFieldElements(corr.U, corr.X))

	// 比较是否等于k
	return expected.Value.Cmp(corr.K.Value) == 0
}

// VerifyQVOLERelation 验证二次VOLE关联关系
func (vg *VOLEGenerator) VerifyQVOLERelation(qcorr *QVOLECorrelation) bool {
	// 验证基本VOLE关联
	if !vg.VerifyVOLERelation(qcorr.Alpha) {
		return false
	}
	if !vg.VerifyVOLERelation(qcorr.Beta) {
		return false
	}
	if !vg.VerifyVOLERelation(qcorr.Gamma) {
		return false
	}

	// 验证二次关系: uy = u_alpha * u_beta
	expectedUY := vg.mulFieldElements(qcorr.Alpha.U, qcorr.Beta.U)
	if expectedUY.Value.Cmp(qcorr.UY.Value) != 0 {
		return false
	}

	// 验证: ky = my + uy * x
	expectedKY := vg.addFieldElements(qcorr.MY, vg.mulFieldElements(qcorr.UY, qcorr.Alpha.X))
	return expectedKY.Value.Cmp(qcorr.KY.Value) == 0
}

// ========== 域运算辅助函数 ==========

// randomFieldElement 生成随机域元素
func (vg *VOLEGenerator) randomFieldElement() (*FieldElement, error) {
	val, err := rand.Int(rand.Reader, vg.field)
	if err != nil {
		return nil, err
	}

	return &FieldElement{
		Value: val,
		Field: vg.field,
	}, nil
}

// addFieldElements 域加法
func (vg *VOLEGenerator) addFieldElements(a, b *FieldElement) *FieldElement {
	result := new(big.Int).Add(a.Value, b.Value)
	result.Mod(result, vg.field)

	return &FieldElement{
		Value: result,
		Field: vg.field,
	}
}

// subFieldElements 域减法
func (vg *VOLEGenerator) subFieldElements(a, b *FieldElement) *FieldElement {
	result := new(big.Int).Sub(a.Value, b.Value)
	result.Mod(result, vg.field)

	return &FieldElement{
		Value: result,
		Field: vg.field,
	}
}

// mulFieldElements 域乘法
func (vg *VOLEGenerator) mulFieldElements(a, b *FieldElement) *FieldElement {
	result := new(big.Int).Mul(a.Value, b.Value)
	result.Mod(result, vg.field)

	return &FieldElement{
		Value: result,
		Field: vg.field,
	}
}

// ========== 子域VOLE (sVOLE) ==========
// 用于小域电路的安全增强

// SubfieldVOLECorrelation 子域VOLE关联
// u ∈ F_p, k, m ∈ F_{p^r}, x ∈ F_{p^r}
type SubfieldVOLECorrelation struct {
	M          *FieldElement   // MAC标签 (在扩域中)
	U          *FieldElement   // 见证值 (在基域中)
	K          *FieldElement   // 密钥份额 (在扩域中)
	X          *FieldElement   // 全局密钥 (在扩域中)
	BaseField  *big.Int        // 基域F_p
	ExtField   *big.Int        // 扩域F_{p^r}
	Extension  int             // 扩展度r
}

// GenerateSubfieldVOLE 生成子域VOLE关联
func (vg *VOLEGenerator) GenerateSubfieldVOLE(extension int) (*SubfieldVOLECorrelation, error) {
	// 基域 = vg.field
	// 扩域 = field^extension (简化实现，实际需要使用多项式扩域)

	// 生成扩域元素（简化：使用更大的域模拟）
	extFieldBits := vg.securityParam * extension
	extField, err := rand.Prime(rand.Reader, extFieldBits)
	if err != nil {
		return nil, err
	}

	// 在基域中生成u
	u, err := vg.randomFieldElement()
	if err != nil {
		return nil, err
	}

	// 在扩域中生成x, m
	x, err := vg.randomExtFieldElement(extField)
	if err != nil {
		return nil, err
	}
	m, err := vg.randomExtFieldElement(extField)
	if err != nil {
		return nil, err
	}

	// 计算k = m + u * x (在扩域中)
	// 需要将基域的u扩展到扩域
	uExt := &FieldElement{Value: new(big.Int).Set(u.Value), Field: extField}
	uTimesX := vg.mulExtFieldElements(uExt, x, extField)
	k := vg.addExtFieldElements(m, uTimesX, extField)

	return &SubfieldVOLECorrelation{
		M:         m,
		U:         u,
		K:         k,
		X:         x,
		BaseField: vg.field,
		ExtField:  extField,
		Extension: extension,
	}, nil
}

func (vg *VOLEGenerator) randomExtFieldElement(extField *big.Int) (*FieldElement, error) {
	val, err := rand.Int(rand.Reader, extField)
	if err != nil {
		return nil, err
	}
	return &FieldElement{Value: val, Field: extField}, nil
}

func (vg *VOLEGenerator) addExtFieldElements(a, b *FieldElement, field *big.Int) *FieldElement {
	result := new(big.Int).Add(a.Value, b.Value)
	result.Mod(result, field)
	return &FieldElement{Value: result, Field: field}
}

func (vg *VOLEGenerator) mulExtFieldElements(a, b *FieldElement, field *big.Int) *FieldElement {
	result := new(big.Int).Mul(a.Value, b.Value)
	result.Mod(result, field)
	return &FieldElement{Value: result, Field: field}
}

// ========== VOLE扩展 (VOLE Extension) ==========
// 使用伪随机生成器从少量VOLE生成大量VOLE

// VOLEExtension VOLE扩展协议
type VOLEExtension struct {
	baseVOLEs []*VOLECorrelation
	prg       func([]byte) []byte // 伪随机生成器
}

// NewVOLEExtension 创建VOLE扩展实例
func NewVOLEExtension(baseVOLEs []*VOLECorrelation) *VOLEExtension {
	return &VOLEExtension{
		baseVOLEs: baseVOLEs,
		prg:       sha256PRG,
	}
}

// ExtendVOLEs 扩展VOLE数量
// targetCount: 目标VOLE数量
func (ve *VOLEExtension) ExtendVOLEs(targetCount int) ([]*VOLECorrelation, error) {
	if len(ve.baseVOLEs) == 0 {
		return nil, fmt.Errorf("基础VOLE数量为0")
	}

	// 使用PRG扩展（简化实现）
	extended := make([]*VOLECorrelation, targetCount)

	// 复制基础VOLE
	for i := 0; i < len(ve.baseVOLEs) && i < targetCount; i++ {
		extended[i] = ve.baseVOLEs[i]
	}

	// 使用PRG生成剩余VOLE
	seed := ve.baseVOLEs[0].M.Value.Bytes()
	for i := len(ve.baseVOLEs); i < targetCount; i++ {
		// 使用PRG生成伪随机VOLE
		seed = ve.prg(seed)

		// 从seed派生VOLE参数（简化）
		m := &FieldElement{
			Value: new(big.Int).SetBytes(seed[:16]),
			Field: ve.baseVOLEs[0].Field,
		}
		m.Value.Mod(m.Value, ve.baseVOLEs[0].Field)

		extended[i] = &VOLECorrelation{
			M:     m,
			U:     ve.baseVOLEs[0].U,
			X:     ve.baseVOLEs[0].X,
			Field: ve.baseVOLEs[0].Field,
		}
		// 重新计算K
		vg := &VOLEGenerator{field: ve.baseVOLEs[0].Field}
		extended[i].K = vg.addFieldElements(m, vg.mulFieldElements(extended[i].U, extended[i].X))
	}

	return extended, nil
}

// sha256PRG SHA-256作为伪随机生成器
func sha256PRG(seed []byte) []byte {
	hash := sha256.Sum256(seed)
	return hash[:]
}

// ========== 序列化/反序列化 ==========

// SerializeVOLE 序列化VOLE关联
func SerializeVOLE(corr *VOLECorrelation) []byte {
	// 简化实现：连接所有字节
	mBytes := corr.M.Value.Bytes()
	uBytes := corr.U.Value.Bytes()
	kBytes := corr.K.Value.Bytes()
	xBytes := corr.X.Value.Bytes()

	result := make([]byte, 4+len(mBytes)+len(uBytes)+len(kBytes)+len(xBytes))
	offset := 0

	binary.BigEndian.PutUint32(result[offset:], uint32(len(mBytes)))
	offset += 4
	copy(result[offset:], mBytes)
	offset += len(mBytes)

	// ... 类似地序列化其他字段

	return result
}

// GetField 获取VOLE生成器的域
func (vg *VOLEGenerator) GetField() *big.Int {
	return vg.field
}
