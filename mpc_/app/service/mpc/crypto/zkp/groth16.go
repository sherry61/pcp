package zkp

import (
	"bytes"
	"crypto/rand"
	"fmt"
	"math/big"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/witness"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// DataOwnershipCircuit 数据归属证明电路
type DataOwnershipCircuit struct {
	// 公开输入
	DataHash   frontend.Variable `gnark:",public"`
	UserIDHash frontend.Variable `gnark:",public"`

	// 私有输入
	Data   frontend.Variable
	UserID frontend.Variable
	Nonce  frontend.Variable
}

// Define 定义约束 - 使用统一的简化哈希算法
func (circuit *DataOwnershipCircuit) Define(api frontend.API) error {
	// 验证数据哈希 - 使用简化哈希算法
	// 算法：(data + nonce) * 7 + 13，取模 1000000
	dataWithNonce := api.Add(circuit.Data, circuit.Nonce)
	temp1 := api.Mul(dataWithNonce, 7)
	computedDataHash := api.Add(temp1, 13)
	// 为了简化，在电路中不做模运算，而是在哈希生成时确保值在合理范围内
	api.AssertIsEqual(circuit.DataHash, computedDataHash)

	// 验证用户ID哈希
	// 算法：userID * 11 + 17
	temp2 := api.Mul(circuit.UserID, 11)
	computedUserIDHash := api.Add(temp2, 17)
	api.AssertIsEqual(circuit.UserIDHash, computedUserIDHash)

	return nil
}

type ZKPSystem struct {
	cs constraint.ConstraintSystem
	pk groth16.ProvingKey
	vk groth16.VerifyingKey
}

func NewZKPSystem() (*ZKPSystem, error) {
	// 编译电路
	var circuit DataOwnershipCircuit
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &circuit)
	if err != nil {
		return nil, err
	}

	// 生成证明和验证密钥
	pk, vk, err := groth16.Setup(cs)
	if err != nil {
		return nil, err
	}

	return &ZKPSystem{
		cs: cs,
		pk: pk,
		vk: vk,
	}, nil
}

// NewSimpleZKPSystem 兼容旧测试入口
func NewSimpleZKPSystem() (*ZKPSystem, error) {
	return NewZKPSystem()
}

// GenerateProofWithHash 生成证明和对应的哈希值
func (z *ZKPSystem) GenerateProofWithHash(data, userID string) (proof []byte, dataHash []byte, userIDHash []byte, nonce string, err error) {
	// 生成nonce
	nonce = generateNonce()

	// 生成哈希值
	dataHash = GenerateDataHash(data, nonce)
	userIDHash = GenerateUserIDHash(userID)

	// 生成证明
	proof, err = z.GenerateProof(data, userID, dataHash, userIDHash)
	return
}

// GenerateProof 生成数据归属证明 - 简化版本，直接使用一致的nonce
func (z *ZKPSystem) GenerateProof(data, userID string, dataHash, userIDHash []byte) ([]byte, error) {
	// 将字符串转换为数值
	dataBigInt := stringToBigInt(data)
	userIDBigInt := stringToBigInt(userID)

	// 需要找到生成dataHash时使用的nonce
	// 由于哈希算法是 (data + nonce) * 7 + 13，我们需要反推nonce
	targetHash := new(big.Int).SetBytes(dataHash)
	targetUserIDHash := new(big.Int).SetBytes(userIDHash)

	// 验证userID哈希是否正确
	expectedUserIDHash := new(big.Int).Mul(userIDBigInt, big.NewInt(11))
	expectedUserIDHash.Add(expectedUserIDHash, big.NewInt(17))
	if expectedUserIDHash.Cmp(targetUserIDHash) != 0 {
		return nil, fmt.Errorf("用户ID哈希不匹配")
	}

	// 反推nonce：从 (data + nonce) * 7 + 13 = targetHash 得到 nonce
	// nonce = ((targetHash - 13) / 7) - data
	temp := new(big.Int).Sub(targetHash, big.NewInt(13))
	tempCopy := new(big.Int).Set(temp)
	if tempCopy.Mod(tempCopy, big.NewInt(7)).Cmp(big.NewInt(0)) != 0 {
		return nil, fmt.Errorf("数据哈希格式不正确，无法整除")
	}
	temp.Div(temp, big.NewInt(7))
	nonceBigInt := new(big.Int).Sub(temp, dataBigInt)

	// 创建witness
	assignment := &DataOwnershipCircuit{
		DataHash:   targetHash,
		UserIDHash: targetUserIDHash,
		Data:       dataBigInt,
		UserID:     userIDBigInt,
		Nonce:      nonceBigInt,
	}

	witness, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		return nil, err
	}

	// 生成证明
	proof, err := groth16.Prove(z.cs, z.pk, witness)
	if err != nil {
		return nil, err
	}

	// 序列化证明
	var buf bytes.Buffer
	_, err = proof.WriteTo(&buf)
	if err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// VerifyProof 验证证明
func (z *ZKPSystem) VerifyProof(proof []byte, dataHash, userIDHash []byte) (valid bool, err error) {
	// 基础验证
	if z == nil {
		return false, fmt.Errorf("ZKP system not initialized")
	}
	if z.cs == nil {
		return false, fmt.Errorf("constraint system is nil")
	}
	if z.vk == nil {
		return false, fmt.Errorf("verifying key is nil")
	}
	if len(proof) == 0 {
		return false, fmt.Errorf("proof is empty")
	}
	if len(dataHash) == 0 || len(userIDHash) == 0 {
		return false, fmt.Errorf("hash values cannot be empty")
	}

	// 执行实际验证
	actualResult := z.attemptVerification(proof, dataHash, userIDHash)

	if actualResult {
		return true, nil
	} else {
		return false, fmt.Errorf("ZKP proof verification failed")
	}
}

// attemptVerification 尝试实际验证，捕获所有错误
func (z *ZKPSystem) attemptVerification(proof []byte, dataHash, userIDHash []byte) bool {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("DEBUG: ZKP verification panic: %v\n", r)
		}
	}()

	// 基础检查
	if z == nil || z.vk == nil || z.cs == nil {
		return false
	}

	// 反序列化证明 - 使用正确的proof创建方法
	p := groth16.NewProof(ecc.BN254)
	buf := bytes.NewReader(proof)
	_, err := p.ReadFrom(buf)
	if err != nil {
		return false
	}

	// 创建BigInt
	dataHashBigInt := new(big.Int).SetBytes(dataHash)
	userIDHashBigInt := new(big.Int).SetBytes(userIDHash)

	// 确保值不为0
	if dataHashBigInt.Sign() <= 0 {
		dataHashBigInt.SetInt64(1)
	}
	if userIDHashBigInt.Sign() <= 0 {
		userIDHashBigInt.SetInt64(1)
	}

	// 创建witness
	publicAssignment := DataOwnershipCircuit{
		DataHash:   dataHashBigInt,
		UserIDHash: userIDHashBigInt,
	}

	publicWitness, err := frontend.NewWitness(&publicAssignment, ecc.BN254.ScalarField(), frontend.PublicOnly())
	if err != nil {
		return false
	}

	// 执行验证
	err = groth16.Verify(p, z.vk, publicWitness)
	if err != nil {
		return false
	}

	return true
}

// doVerification 执行实际的验证过程，独立处理panic
func (z *ZKPSystem) doVerification(p groth16.Proof, w witness.Witness) (bool, error) {
	defer func() {
		if r := recover(); r != nil {
			// 记录详细的panic信息用于调试
			fmt.Printf("Debug: groth16.Verify panic details: %+v\n", r)
		}
	}()

	// 进行验证
	err := groth16.Verify(p, z.vk, w)
	if err != nil {
		return false, fmt.Errorf("verification failed: %v", err)
	}

	return true, nil
}

func generateNonce() string {
	// 生成固定长度的数字字符串，避免过大的数值
	max := big.NewInt(876544)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		// 如果随机数生成失败，使用固定值
		n = big.NewInt(456789)
	}
	nonce := 123456 + n.Int64() // 生成6位数字
	return fmt.Sprintf("%d", nonce)
}

// stringToBigInt 将字符串转换为big.Int
func stringToBigInt(s string) *big.Int {
	result := big.NewInt(0)
	for i, b := range []byte(s) {
		result.Add(result, big.NewInt(int64(b)*int64(i+1)))
	}
	return result
}

// GenerateDataHash 生成数据哈希 - 与电路算法完全一致
func GenerateDataHash(data string, nonce string) []byte {
	// 将字符串转换为BigInt（与电路中的处理方式相同）
	dataBigInt := stringToBigInt(data)
	nonceBigInt := stringToBigInt(nonce)

	// 使用与电路完全相同的算法：(data + nonce) * 7 + 13
	dataWithNonce := new(big.Int).Add(dataBigInt, nonceBigInt)
	temp := new(big.Int).Mul(dataWithNonce, big.NewInt(7))
	hash := new(big.Int).Add(temp, big.NewInt(13))

	// 为了保持一致性，不在这里做模运算
	// 返回计算结果的字节表示
	return hash.Bytes()
}

// GenerateUserIDHash 生成用户ID哈希 - 与电路算法完全一致
func GenerateUserIDHash(userID string) []byte {
	// 将字符串转换为BigInt（与电路中的处理方式相同）
	userIDBigInt := stringToBigInt(userID)

	// 使用与电路完全相同的算法：userID * 11 + 17
	temp := new(big.Int).Mul(userIDBigInt, big.NewInt(11))
	hash := new(big.Int).Add(temp, big.NewInt(17))

	// 返回计算结果的字节表示
	return hash.Bytes()
}
