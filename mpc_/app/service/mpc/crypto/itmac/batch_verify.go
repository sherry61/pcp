package itmac

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
)

// JQv1BatchVerifier JesseQ v1批量验证器
// 基于哈希的批量验证，适用于任意域电路
type JQv1BatchVerifier struct {
	itmac *ITMACSystem
	hash  func([]byte) []byte
}

// NewJQv1BatchVerifier 创建JQv1批量验证器
func NewJQv1BatchVerifier(itmac *ITMACSystem) *JQv1BatchVerifier {
	return &JQv1BatchVerifier{
		itmac: itmac,
		hash:  sha256Hash,
	}
}

// MultiplicationGate 乘法门的IT-MAC承诺
type MultiplicationGate struct {
	ID            int               // 门ID
	InputAlpha    *ITMACCommitment  // 输入a的承诺 [u_alpha]
	InputBeta     *ITMACCommitment  // 输入b的承诺 [u_beta]
	Output        *ITMACCommitment  // 输出的承诺 [w_upsilon]
	QVOLECorr     *QVOLECorrelation // 二次VOLE关联
	DAlpha        *FieldElement     // d_alpha = w_alpha - u_alpha
	DBeta         *FieldElement     // d_beta = w_beta - u_beta
}

// VerifyMultiplicationGate 验证单个乘法门
// 使用JQv1的一次多项式验证方法
func (jqv1 *JQv1BatchVerifier) VerifyMultiplicationGate(gate *MultiplicationGate) (bool, *FieldElement, error) {
	// 构造一次多项式 f(X) = a_0 + a_1*X
	// 其中:
	// a_0 = d_rho * m_{u_alpha} + d_alpha * m_{u_rho} + m_y - m_{w_upsilon}
	// a_1 = (u_alpha + d_alpha) * (u_rho + d_rho) - w_upsilon

	vg := jqv1.itmac.voleGen

	// 计算a_0
	// d_rho * m_{u_alpha}
	term1 := vg.mulFieldElements(gate.DBeta, gate.InputAlpha.M)

	// d_alpha * m_{u_rho}
	term2 := vg.mulFieldElements(gate.DAlpha, gate.InputBeta.M)

	// m_y
	term3 := gate.QVOLECorr.MY

	// m_{w_upsilon}
	term4 := gate.Output.M

	a0 := vg.addFieldElements(term1, term2)
	a0 = vg.addFieldElements(a0, term3)
	a0 = vg.subFieldElements(a0, term4)

	// 计算a_1
	// (u_alpha + d_alpha)
	wAlpha := vg.addFieldElements(gate.InputAlpha.U, gate.DAlpha)

	// (u_rho + d_rho)
	wBeta := vg.addFieldElements(gate.InputBeta.U, gate.DBeta)

	// (u_alpha + d_alpha) * (u_rho + d_rho)
	product := vg.mulFieldElements(wAlpha, wBeta)

	// - w_upsilon
	a1 := vg.subFieldElements(product, gate.Output.U)

	// 验证: a_1 应该为0（当乘法门正确时）
	zero := big.NewInt(0)
	isValid := a1.Value.Cmp(zero) == 0

	return isValid, a0, nil
}

// BatchVerifyMultiplicationGates 批量验证多个乘法门
// 使用基于哈希的批量验证（JQv1的核心创新）
func (jqv1 *JQv1BatchVerifier) BatchVerifyMultiplicationGates(gates []*MultiplicationGate) (bool, error) {
	if len(gates) == 0 {
		return true, nil
	}

	// 步骤1: 验证每个门并收集常数项a_0
	a0Values := make([]*FieldElement, len(gates))

	for i, gate := range gates {
		valid, a0, err := jqv1.VerifyMultiplicationGate(gate)
		if err != nil {
			return false, fmt.Errorf("验证门%d失败: %v", gate.ID, err)
		}

		if !valid {
			return false, fmt.Errorf("门%d验证失败: a_1 != 0", gate.ID)
		}

		a0Values[i] = a0
	}

	// 步骤2: Prover计算所有a_0的哈希
	// h = H(a_{0,1} || a_{0,2} || ... || a_{0,L})
	proverHash := jqv1.hashA0Values(a0Values)

	// 步骤3: Verifier使用f_j(x)计算哈希
	// 对于每个门j: f_j(x) = a_{0,j} (因为a_1 = 0)
	// Verifier计算: h' = H(f_1(x) || f_2(x) || ... || f_L(x))

	// 计算f_j(x) = 对每个门评估多项式在x处的值
	fxValues := make([]*FieldElement, len(gates))
	for i, gate := range gates {
		// f(x) = a_0 + a_1*x
		// 由于我们已经验证a_1 = 0，所以f(x) = a_0
		// 但Verifier需要使用承诺值重新计算

		fx, err := jqv1.evaluatePolynomialAtX(gate)
		if err != nil {
			return false, fmt.Errorf("评估门%d的多项式失败: %v", gate.ID, err)
		}
		fxValues[i] = fx
	}

	verifierHash := jqv1.hashA0Values(fxValues)

	// 步骤4: 比较哈希值
	return hex.EncodeToString(proverHash) == hex.EncodeToString(verifierHash), nil
}

// evaluatePolynomialAtX Verifier评估多项式f(X)在x处的值
// f(x) = d_rho*k_{u_alpha} + d_alpha*k_{u_rho} + k_y - k_{w_upsilon}
func (jqv1 *JQv1BatchVerifier) evaluatePolynomialAtX(gate *MultiplicationGate) (*FieldElement, error) {
	vg := jqv1.itmac.voleGen

	// 使用Verifier持有的k值而不是m值
	// d_rho * k_{u_alpha}
	term1 := vg.mulFieldElements(gate.DBeta, gate.InputAlpha.K)

	// d_alpha * k_{u_rho}
	term2 := vg.mulFieldElements(gate.DAlpha, gate.InputBeta.K)

	// k_y
	term3 := gate.QVOLECorr.KY

	// k_{w_upsilon}
	term4 := gate.Output.K

	fx := vg.addFieldElements(term1, term2)
	fx = vg.addFieldElements(fx, term3)
	fx = vg.subFieldElements(fx, term4)

	return fx, nil
}

// hashA0Values 对一组域元素进行哈希
func (jqv1 *JQv1BatchVerifier) hashA0Values(values []*FieldElement) []byte {
	hasher := sha256.New()

	for _, val := range values {
		// 将域元素转换为字节并哈希
		valBytes := val.Value.Bytes()
		hasher.Write(valBytes)
	}

	return hasher.Sum(nil)
}

// sha256Hash SHA-256哈希函数
func sha256Hash(data []byte) []byte {
	hash := sha256.Sum256(data)
	return hash[:]
}

// ========== 用于混淆电路审计的集成接口 ==========

// CircuitAuditProof 电路审计证明
type CircuitAuditProof struct {
	TaskID            string                  // 任务ID
	InputCommitments  []*ITMACCommitment      // 输入承诺
	OutputCommitment  *ITMACCommitment        // 输出承诺
	MultiplicationGates []*MultiplicationGate // 乘法门列表
	ProverHash        []byte                  // Prover计算的哈希
	VerifierHash      []byte                  // Verifier计算的哈希
	Verified          bool                    // 验证结果
}

// GenerateCircuitAuditProof 生成混淆电路的审计证明
func (jqv1 *JQv1BatchVerifier) GenerateCircuitAuditProof(
	taskID string,
	inputComms []*ITMACCommitment,
	outputComm *ITMACCommitment,
	gates []*MultiplicationGate,
) (*CircuitAuditProof, error) {

	// 执行批量验证
	verified, err := jqv1.BatchVerifyMultiplicationGates(gates)
	if err != nil {
		return nil, fmt.Errorf("批量验证失败: %v", err)
	}

	// 计算Prover哈希
	a0Values := make([]*FieldElement, len(gates))
	for i, gate := range gates {
		_, a0, _ := jqv1.VerifyMultiplicationGate(gate)
		a0Values[i] = a0
	}
	proverHash := jqv1.hashA0Values(a0Values)

	// 计算Verifier哈希
	fxValues := make([]*FieldElement, len(gates))
	for i, gate := range gates {
		fx, _ := jqv1.evaluatePolynomialAtX(gate)
		fxValues[i] = fx
	}
	verifierHash := jqv1.hashA0Values(fxValues)

	return &CircuitAuditProof{
		TaskID:              taskID,
		InputCommitments:    inputComms,
		OutputCommitment:    outputComm,
		MultiplicationGates: gates,
		ProverHash:          proverHash,
		VerifierHash:        verifierHash,
		Verified:            verified,
	}, nil
}

// VerifyCircuitAuditProof 验证电路审计证明
func (jqv1 *JQv1BatchVerifier) VerifyCircuitAuditProof(proof *CircuitAuditProof) bool {
	// 验证哈希一致性
	if hex.EncodeToString(proof.ProverHash) != hex.EncodeToString(proof.VerifierHash) {
		return false
	}

	// 验证所有输入承诺
	for _, comm := range proof.InputCommitments {
		if !jqv1.itmac.VerifyCommitment(comm) {
			return false
		}
	}

	// 验证输出承诺
	if !jqv1.itmac.VerifyCommitment(proof.OutputCommitment) {
		return false
	}

	return proof.Verified
}

// ========== 链上存储的审计证明摘要 ==========

// AuditProofSummary 审计证明摘要（用于链上存储）
type AuditProofSummary struct {
	TaskID              string `json:"task_id"`
	InputCommitmentHash string `json:"input_commitment_hash"`
	OutputCommitmentHash string `json:"output_commitment_hash"`
	ProverHash          string `json:"prover_hash"`
	VerifierHash        string `json:"verifier_hash"`
	NumGates            int    `json:"num_gates"`
	Verified            bool   `json:"verified"`
}

// GenerateAuditProofSummary 生成审计证明摘要
func (jqv1 *JQv1BatchVerifier) GenerateAuditProofSummary(proof *CircuitAuditProof) *AuditProofSummary {
	inputHash := jqv1.itmac.BatchCommitmentHash(proof.InputCommitments)
	outputHash := jqv1.itmac.CommitmentHash(proof.OutputCommitment)

	return &AuditProofSummary{
		TaskID:               proof.TaskID,
		InputCommitmentHash:  hex.EncodeToString(inputHash),
		OutputCommitmentHash: hex.EncodeToString(outputHash),
		ProverHash:           hex.EncodeToString(proof.ProverHash),
		VerifierHash:         hex.EncodeToString(proof.VerifierHash),
		NumGates:             len(proof.MultiplicationGates),
		Verified:             proof.Verified,
	}
}

// ========== 性能统计 ==========

// VerificationStats 验证统计信息
type VerificationStats struct {
	NumGates          int     // 验证的门数量
	VerificationTime  float64 // 验证时间（秒）
	HashComputations  int     // 哈希计算次数
	FieldOperations   int     // 域运算次数
}

// GetVerificationStats 获取验证统计信息
func (jqv1 *JQv1BatchVerifier) GetVerificationStats(gates []*MultiplicationGate) *VerificationStats {
	// 简化的统计实现
	numGates := len(gates)
	hashComps := 2 // Prover和Verifier各计算一次哈希
	// 每个门需要约10次域运算
	fieldOps := numGates * 10

	return &VerificationStats{
		NumGates:         numGates,
		HashComputations: hashComps,
		FieldOperations:  fieldOps,
	}
}
