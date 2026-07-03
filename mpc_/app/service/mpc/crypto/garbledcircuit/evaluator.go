package garbledcircuit

import (
	"fmt"
)

// Evaluator 评估混淆电路的参与方（数据中心B）
type Evaluator struct {
	hg      *HalfGates
	circuit *Circuit
}

// NewEvaluator 创建新的Evaluator实例
func NewEvaluator(circuit *Circuit) (*Evaluator, error) {
	if err := circuit.Validate(); err != nil {
		return nil, fmt.Errorf("电路验证失败: %v", err)
	}

	hg, err := NewHalfGates()
	if err != nil {
		return nil, fmt.Errorf("初始化Half-Gates失败: %v", err)
	}

	return &Evaluator{
		hg:      hg,
		circuit: circuit,
	}, nil
}

// Evaluate 评估混淆电路
// gc: 混淆电路
// inputLabelsA: Garbler的输入标签（通过OT从Garbler获取，已选择正确的标签）
// inputLabelsB: Evaluator的输入标签（Evaluator自己的输入，需要从Garbler获取对应标签）
// 返回: 输出导线的标签
func (e *Evaluator) Evaluate(gc *GarbledCircuit, inputLabelsA, inputLabelsB []WireLabel) (WireLabel, error) {
	// 验证输入标签数量
	if len(inputLabelsA) != e.circuit.NumInputsA {
		return WireLabel{}, fmt.Errorf("输入A标签数量不匹配: 期望%d, 实际%d", e.circuit.NumInputsA, len(inputLabelsA))
	}
	if len(inputLabelsB) != e.circuit.NumInputsB {
		return WireLabel{}, fmt.Errorf("输入B标签数量不匹配: 期望%d, 实际%d", e.circuit.NumInputsB, len(inputLabelsB))
	}

	// 初始化导线标签映射
	wireLabels := make(map[int]WireLabel)

	// 设置输入A的标签
	for i, label := range inputLabelsA {
		wireLabels[i] = label
	}

	// 设置输入B的标签
	for i, label := range inputLabelsB {
		wireID := e.circuit.NumInputsA + i
		wireLabels[wireID] = label
	}

	// 按拓扑顺序评估每个门
	for _, gate := range gc.Circuit.Gates {
		outputLabel, err := e.evaluateGate(gate, gc, wireLabels)
		if err != nil {
			return WireLabel{}, fmt.Errorf("评估门%d失败: %v", gate.ID, err)
		}
		wireLabels[gate.Output] = outputLabel
	}

	// 返回输出导线的标签
	outputLabel, ok := wireLabels[gc.Circuit.OutputWireID]
	if !ok {
		return WireLabel{}, fmt.Errorf("输出导线%d的标签未找到", gc.Circuit.OutputWireID)
	}

	return outputLabel, nil
}

// evaluateGate 评估单个门
func (e *Evaluator) evaluateGate(gate Gate, gc *GarbledCircuit, wireLabels map[int]WireLabel) (WireLabel, error) {
	switch gate.Type {
	case INPUT:
		// 输入门：处理常量
		if gate.InputA == -1 {
			labels, ok := gc.WireLabels[gate.Output]
			if !ok {
				return WireLabel{}, fmt.Errorf("常量导线%d标签未找到", gate.Output)
			}
			if gate.ConstVal {
				return labels[1], nil
			}
			return labels[0], nil
		}
		return WireLabel{}, fmt.Errorf("非常量输入门不应该被评估")

	case AND:
		// AND门：使用Half-Gates协议评估
		aLabel, ok := wireLabels[gate.InputA]
		if !ok {
			return WireLabel{}, fmt.Errorf("输入A导线%d的标签未找到", gate.InputA)
		}
		bLabel, ok := wireLabels[gate.InputB]
		if !ok {
			return WireLabel{}, fmt.Errorf("输入B导线%d的标签未找到", gate.InputB)
		}

		table, ok := gc.GarbledGates[gate.ID]
		if !ok {
			return WireLabel{}, fmt.Errorf("门%d的混淆表未找到", gate.ID)
		}

		outputLabel, err := e.hg.EvaluateANDGate(aLabel, bLabel, table)
		if err != nil {
			return WireLabel{}, fmt.Errorf("评估AND门失败: %v", err)
		}

		return outputLabel, nil

	case XOR:
		// XOR门：Free-XOR评估
		aLabel, ok := wireLabels[gate.InputA]
		if !ok {
			return WireLabel{}, fmt.Errorf("输入A导线%d的标签未找到", gate.InputA)
		}
		bLabel, ok := wireLabels[gate.InputB]
		if !ok {
			return WireLabel{}, fmt.Errorf("输入B导线%d的标签未找到", gate.InputB)
		}

		outputLabel := e.hg.EvaluateXORGate(aLabel, bLabel)
		return outputLabel, nil

	case NOT:
		// NOT门：直接返回输入标签（Garbler已经交换了标签）
		aLabel, ok := wireLabels[gate.InputA]
		if !ok {
			return WireLabel{}, fmt.Errorf("输入导线%d的标签未找到", gate.InputA)
		}

		outputLabel := e.hg.EvaluateNOTGate(aLabel)
		return outputLabel, nil

	case BUF:
		aLabel, ok := wireLabels[gate.InputA]
		if !ok {
			return WireLabel{}, fmt.Errorf("输入导线%d的标签未找到", gate.InputA)
		}
		return aLabel, nil

	default:
		return WireLabel{}, fmt.Errorf("不支持的门类型: %v", gate.Type)
	}
}

// VerifyOutput 验证输出标签的有效性（可选）
// 这个方法可以用来检查输出标签是否在有效范围内
func (e *Evaluator) VerifyOutput(outputLabel WireLabel, gc *GarbledCircuit) bool {
	// 检查输出标签是否与输出标签映射中的某个标签匹配
	// 注意：这需要Garbler公开输出标签映射，会泄露输出值
	// 在实际应用中，这个验证应该由Garbler在收到输出标签后进行
	outputLabelMap, ok := gc.OutputLabels[gc.Circuit.OutputWireID]
	if !ok {
		return false
	}

	// 检查标签是否匹配任一输出值
	return labelsEqual(outputLabel, outputLabelMap[false]) ||
		labelsEqual(outputLabel, outputLabelMap[true])
}

// GetInputCommitment 获取Evaluator输入的承诺（用于审计）
// inputsB: Evaluator的实际输入值
// 返回: 输入承诺（哈希值）
func (e *Evaluator) GetInputCommitment(inputsB []bool) ([]byte, error) {
	if len(inputsB) != e.circuit.NumInputsB {
		return nil, fmt.Errorf("输入B数量不匹配: 期望%d, 实际%d", e.circuit.NumInputsB, len(inputsB))
	}

	// 将布尔值转换为字节
	inputBytes := make([]byte, (len(inputsB)+7)/8)
	for i, val := range inputsB {
		if val {
			inputBytes[i/8] |= 1 << (i % 8)
		}
	}

	// 计算承诺（使用相关鲁棒性哈希）
	commitment := correlationRobustHash(inputBytes)

	return commitment, nil
}

// EvaluationResult 评估结果结构
type EvaluationResult struct {
	OutputLabel     WireLabel       // 输出标签
	InputCommitment []byte          // 输入承诺（用于审计）
	Verified        bool            // 是否验证通过
	EvalStats       EvaluationStats // 评估统计信息
	OutputValue     bool            `json:"output_value"`
	AuditDigest     []byte          `json:"audit_digest"`
}

// EvaluationStats 评估统计信息
type EvaluationStats struct {
	NumANDGates int // 评估的AND门数量
	NumXORGates int // 评估的XOR门数量
	NumNOTGates int // 评估的NOT门数量
}

// EvaluateWithStats 评估混淆电路并收集统计信息
func (e *Evaluator) EvaluateWithStats(gc *GarbledCircuit, inputLabelsA, inputLabelsB []WireLabel, inputsB []bool) (*EvaluationResult, error) {
	// 执行评估
	outputLabel, err := e.Evaluate(gc, inputLabelsA, inputLabelsB)
	if err != nil {
		return nil, err
	}

	// 生成输入承诺
	commitment, err := e.GetInputCommitment(inputsB)
	if err != nil {
		return nil, err
	}

	// 验证输出
	verified := e.VerifyOutput(outputLabel, gc)
	outputValue, err := ParseOutputBool(outputLabel, gc)
	if err != nil {
		return nil, err
	}
	auditDigest := correlationRobustHash(append(commitment, outputLabel.Value[:]...))

	// 收集统计信息
	stats := EvaluationStats{}
	for _, gate := range gc.Circuit.Gates {
		switch gate.Type {
		case AND:
			stats.NumANDGates++
		case XOR:
			stats.NumXORGates++
		case NOT:
			stats.NumNOTGates++
		}
	}

	return &EvaluationResult{
		OutputLabel:     outputLabel,
		InputCommitment: commitment,
		Verified:        verified,
		EvalStats:       stats,
		OutputValue:     outputValue,
		AuditDigest:     auditDigest,
	}, nil
}

// ParseInputBits 将整数输入解析为位数组
// 用于将收入、信用评分等整数值转换为电路输入
func ParseInputBits(values []uint32, bitsPerValue int) []bool {
	totalBits := len(values) * bitsPerValue
	bits := make([]bool, totalBits)

	for i, value := range values {
		for j := 0; j < bitsPerValue; j++ {
			bitIndex := i*bitsPerValue + j
			bits[bitIndex] = (value>>j)&1 == 1
		}
	}

	return bits
}

// ParseOutputBool 将输出标签解析为布尔值
// 需要与Garbler协商输出标签的含义
func ParseOutputBool(outputLabel WireLabel, gc *GarbledCircuit) (bool, error) {
	outputLabelMap, ok := gc.OutputLabels[gc.Circuit.OutputWireID]
	if !ok {
		return false, fmt.Errorf("输出标签映射未找到")
	}

	if labelsEqual(outputLabel, outputLabelMap[false]) {
		return false, nil
	} else if labelsEqual(outputLabel, outputLabelMap[true]) {
		return true, nil
	}

	return false, fmt.Errorf("输出标签无法识别")
}

func (e *Evaluator) EvaluateSerialized(gcData []byte, inputLabelsA, inputLabelsB []WireLabel, inputsB []bool) (*EvaluationResult, error) {
	gc, err := Deserialize(gcData)
	if err != nil {
		return nil, err
	}
	return e.EvaluateWithStats(gc, inputLabelsA, inputLabelsB, inputsB)
}
