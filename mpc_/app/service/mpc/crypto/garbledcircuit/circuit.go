package garbledcircuit

import (
	"fmt"
)

// GateType 门类型
type GateType int

const (
	INPUT GateType = iota // 输入门
	AND                   // AND门
	XOR                   // XOR门
	NOT                   // NOT门
	OR                    // OR门 (可以用AND+NOT实现)
	GE                    // 大于等于比较门
	BUF                   // 透传门
)

// Gate 表示电路中的一个门
type Gate struct {
	Type     GateType
	ID       int
	InputA   int  // 输入A的导线ID (-1表示常量)
	InputB   int  // 输入B的导线ID (-1表示常量，仅单输入门使用)
	Output   int  // 输出导线ID
	ConstVal bool // 常量值（当InputA或InputB为-1时使用）
}

// Circuit 表示完整的布尔电路
type Circuit struct {
	NumInputsA   int    // 参与方A的输入数量
	NumInputsB   int    // 参与方B的输入数量
	NumWires     int    // 总导线数量
	NumGates     int    // 总门数量
	Gates        []Gate // 所有门的列表
	OutputWireID int    // 输出导线ID
}

// NewLoanEvaluationCircuit 创建贷款评估电路
// 输入:
//   - 银行(A)输入: threshold (32位), risk_factor (32位)
//   - 数据中心(B)输入: income (32位), credit_score (32位)
//
// 输出: approved (1位) = (income >= threshold) AND (credit_score >= 650)
func NewLoanEvaluationCircuit() *Circuit {
	const (
		bitsPerValue = 32 // 每个数值使用32位

		// 导线ID分配
		// A的输入: threshold (0-31), risk_factor (32-63)
		// B的输入: income (64-95), credit_score (96-127)
		thresholdStart   = 0
		riskFactorStart  = 32
		incomeStart      = 64
		creditScoreStart = 96

		// 中间导线从128开始
		wireStart = 128
	)

	circuit := &Circuit{
		NumInputsA: bitsPerValue * 2, // threshold + risk_factor
		NumInputsB: bitsPerValue * 2, // income + credit_score
		NumWires:   0,
		Gates:      make([]Gate, 0),
	}

	nextWireID := wireStart
	gateID := 0

	// ===== 第一部分: income >= threshold 的比较电路 =====
	// 使用32位比较器: GE32(income, threshold)
	ge1OutputWire := nextWireID
	nextWireID++

	ge1Gates := buildGE32Circuit(incomeStart, thresholdStart, ge1OutputWire, &gateID, &nextWireID)
	circuit.Gates = append(circuit.Gates, ge1Gates...)

	// ===== 第二部分: credit_score >= 650 的比较电路 =====
	// 650的二进制表示需要作为常量电路输入
	const creditThreshold = 650
	creditThresholdWires := buildConstant32(creditThreshold, &nextWireID, &gateID)
	circuit.Gates = append(circuit.Gates, creditThresholdWires.gates...)

	ge2OutputWire := nextWireID
	nextWireID++

	ge2Gates := buildGE32Circuit(creditScoreStart, creditThresholdWires.startWire, ge2OutputWire, &gateID, &nextWireID)
	circuit.Gates = append(circuit.Gates, ge2Gates...)

	// ===== 第三部分: AND 门组合两个条件 =====
	approvedWire := nextWireID
	nextWireID++

	andGate := Gate{
		Type:   AND,
		ID:     gateID,
		InputA: ge1OutputWire,
		InputB: ge2OutputWire,
		Output: approvedWire,
	}
	gateID++
	circuit.Gates = append(circuit.Gates, andGate)

	circuit.OutputWireID = approvedWire
	circuit.NumWires = nextWireID
	circuit.NumGates = gateID

	return circuit
}

// buildGE32Circuit 构建32位大于等于比较电路
// 返回: 比较结果的导线ID
func buildGE32Circuit(aStart, bStart, outputWire int, gateID, nextWireID *int) []Gate {
	gates := make([]Gate, 0)
	const bits = 32

	// 逐位比较，从最高位开始
	// 算法: a >= b 等价于找到第一个不同的位，该位a为1
	// 或者所有位都相同

	// 存储每一位的比较结果
	gtWires := make([]int, bits) // a[i] > b[i] 的结果
	eqWires := make([]int, bits) // a[i] == b[i] 的结果

	for i := bits - 1; i >= 0; i-- { // 从最高位开始
		aWire := aStart + i
		bWire := bStart + i

		// 计算 a[i] > b[i]: a[i] AND (NOT b[i])
		notBWire := *nextWireID
		*nextWireID++
		gates = append(gates, Gate{
			Type:   NOT,
			ID:     *gateID,
			InputA: bWire,
			Output: notBWire,
		})
		*gateID++

		gtWires[i] = *nextWireID
		*nextWireID++
		gates = append(gates, Gate{
			Type:   AND,
			ID:     *gateID,
			InputA: aWire,
			InputB: notBWire,
			Output: gtWires[i],
		})
		*gateID++

		// 计算 a[i] == b[i]: NOT (a[i] XOR b[i])
		xorWire := *nextWireID
		*nextWireID++
		gates = append(gates, Gate{
			Type:   XOR,
			ID:     *gateID,
			InputA: aWire,
			InputB: bWire,
			Output: xorWire,
		})
		*gateID++

		eqWires[i] = *nextWireID
		*nextWireID++
		gates = append(gates, Gate{
			Type:   NOT,
			ID:     *gateID,
			InputA: xorWire,
			Output: eqWires[i],
		})
		*gateID++
	}

	// 组合所有位的结果
	// result = gt[31] OR (eq[31] AND (gt[30] OR (eq[30] AND (... ))))
	// 递归构建
	resultWire := buildGEResultCombination(gtWires, eqWires, 31, gateID, nextWireID, &gates)

	// 最后一个门: 将结果输出到指定导线
	gates = append(gates, Gate{
		Type:   BUF,
		ID:     *gateID,
		InputA: resultWire,
		Output: outputWire,
	})
	*gateID++

	return gates
}

// buildGEResultCombination 递归构建GE比较结果的组合逻辑
func buildGEResultCombination(gtWires, eqWires []int, bitIdx int, gateID, nextWireID *int, gates *[]Gate) int {
	if bitIdx < 0 {
		// 所有位都相等，返回true (1)
		// 需要一个常量1的导线
		constWire := *nextWireID
		*nextWireID++
		*gates = append(*gates, Gate{
			Type:     INPUT,
			ID:       *gateID,
			InputA:   -1,
			ConstVal: true,
			Output:   constWire,
		})
		*gateID++
		return constWire
	}

	// result[i] = gt[i] OR (eq[i] AND result[i-1])
	// 使用 OR = NOT(NOT a AND NOT b) (De Morgan)

	// 递归获取低位的结果
	lowerResult := buildGEResultCombination(gtWires, eqWires, bitIdx-1, gateID, nextWireID, gates)

	// eq[i] AND result[i-1]
	andWire := *nextWireID
	*nextWireID++
	*gates = append(*gates, Gate{
		Type:   AND,
		ID:     *gateID,
		InputA: eqWires[bitIdx],
		InputB: lowerResult,
		Output: andWire,
	})
	*gateID++

	// gt[i] OR (eq[i] AND result[i-1])
	// 使用 OR = a + b - a*b (布尔代数)
	// 但在布尔电路中, OR可以用 NOT(NOT(a) AND NOT(b))
	notGtWire := *nextWireID
	*nextWireID++
	*gates = append(*gates, Gate{
		Type:   NOT,
		ID:     *gateID,
		InputA: gtWires[bitIdx],
		Output: notGtWire,
	})
	*gateID++

	notAndWire := *nextWireID
	*nextWireID++
	*gates = append(*gates, Gate{
		Type:   NOT,
		ID:     *gateID,
		InputA: andWire,
		Output: notAndWire,
	})
	*gateID++

	nandWire := *nextWireID
	*nextWireID++
	*gates = append(*gates, Gate{
		Type:   AND,
		ID:     *gateID,
		InputA: notGtWire,
		InputB: notAndWire,
		Output: nandWire,
	})
	*gateID++

	orWire := *nextWireID
	*nextWireID++
	*gates = append(*gates, Gate{
		Type:   NOT,
		ID:     *gateID,
		InputA: nandWire,
		Output: orWire,
	})
	*gateID++

	return orWire
}

// buildConstant32 构建32位常量值的电路
type ConstantWires struct {
	startWire int    // 起始导线ID
	gates     []Gate // 构建常量需要的门
}

func buildConstant32(value uint32, nextWireID, gateID *int) ConstantWires {
	startWire := *nextWireID
	gates := make([]Gate, 0, 32)

	for i := 0; i < 32; i++ {
		bit := (value >> i) & 1
		wireID := *nextWireID
		*nextWireID++

		gates = append(gates, Gate{
			Type:     INPUT,
			ID:       *gateID,
			InputA:   -1,
			ConstVal: bit == 1,
			Output:   wireID,
		})
		*gateID++
	}

	return ConstantWires{
		startWire: startWire,
		gates:     gates,
	}
}

// Validate 验证电路的有效性
func (c *Circuit) Validate() error {
	// 检查输入数量
	if c.NumInputsA < 0 || c.NumInputsB < 0 {
		return fmt.Errorf("输入数量不能为负")
	}

	// 检查门的输入导线是否有效
	for _, gate := range c.Gates {
		if gate.InputA >= c.NumWires && gate.InputA != -1 {
			return fmt.Errorf("门%d的输入A导线%d无效", gate.ID, gate.InputA)
		}
		if gate.Type != NOT && gate.Type != INPUT && gate.InputB >= c.NumWires && gate.InputB != -1 {
			return fmt.Errorf("门%d的输入B导线%d无效", gate.ID, gate.InputB)
		}
		if gate.Output >= c.NumWires {
			return fmt.Errorf("门%d的输出导线%d无效", gate.ID, gate.Output)
		}
	}

	// 检查输出导线
	if c.OutputWireID >= c.NumWires {
		return fmt.Errorf("输出导线%d无效", c.OutputWireID)
	}

	return nil
}

// GetGateCount 获取不同类型门的数量统计
func (c *Circuit) GetGateCount() map[GateType]int {
	counts := make(map[GateType]int)
	for _, gate := range c.Gates {
		counts[gate.Type]++
	}
	return counts
}

// String 返回电路的字符串表示
func (c *Circuit) String() string {
	counts := c.GetGateCount()
	return fmt.Sprintf("Circuit(inputs: %d+%d, wires: %d, gates: %d [AND:%d, XOR:%d, NOT:%d, INPUT:%d])",
		c.NumInputsA, c.NumInputsB, c.NumWires, c.NumGates,
		counts[AND], counts[XOR], counts[NOT], counts[INPUT])
}
