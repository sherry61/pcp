package garbledcircuit

import (
	"encoding/json"
	"fmt"
)

type serializedGarbledCircuit struct {
	Circuit      *Circuit              `json:"circuit"`
	GarbledGates map[int]HalfGateTable `json:"garbled_gates"`
	InputLabelsA map[int][2]WireLabel  `json:"input_labels_a"`
	InputLabelsB map[int][2]WireLabel  `json:"input_labels_b"`
	OutputLabels map[int][2]WireLabel  `json:"output_labels"`
	WireLabels   map[int][2]WireLabel  `json:"wire_labels"`
}

// GarbledCircuit 表示混淆后的电路
type GarbledCircuit struct {
	Circuit      *Circuit                   // 原始电路结构
	GarbledGates map[int]HalfGateTable      // 混淆门的混淆表 (门ID -> 混淆表)
	InputLabelsA map[int][2]WireLabel       // 参与方A的输入标签 (导线ID -> [0标签, 1标签])
	InputLabelsB map[int][2]WireLabel       // 参与方B的输入标签 (导线ID -> [0标签, 1标签])
	OutputLabels map[int]map[bool]WireLabel // 输出标签映射 (导线ID -> {false: 0标签, true: 1标签})
	WireLabels   map[int][2]WireLabel       // 所有中间导线的标签对 (导线ID -> [0标签, 1标签])
}

// Garbler 混淆电路的生成方（银行）
type Garbler struct {
	hg      *HalfGates
	circuit *Circuit
}

// NewGarbler 创建新的Garbler实例
func NewGarbler(circuit *Circuit) (*Garbler, error) {
	if err := circuit.Validate(); err != nil {
		return nil, fmt.Errorf("电路验证失败: %v", err)
	}

	hg, err := NewHalfGates()
	if err != nil {
		return nil, fmt.Errorf("初始化Half-Gates失败: %v", err)
	}

	return &Garbler{
		hg:      hg,
		circuit: circuit,
	}, nil
}

// Garble 混淆整个电路
// inputsA: 银行的实际输入值（用于电路优化，可选）
// 返回: 混淆电路和Garbler需要保留的信息
func (g *Garbler) Garble(inputsA []bool) (*GarbledCircuit, error) {
	gc := &GarbledCircuit{
		Circuit:      g.circuit,
		GarbledGates: make(map[int]HalfGateTable),
		InputLabelsA: make(map[int][2]WireLabel),
		InputLabelsB: make(map[int][2]WireLabel),
		OutputLabels: make(map[int]map[bool]WireLabel),
		WireLabels:   make(map[int][2]WireLabel),
	}

	// 步骤1: 为所有输入导线生成标签对
	// 参与方A的输入 (导线0 到 NumInputsA-1)
	for i := 0; i < g.circuit.NumInputsA; i++ {
		labels, err := g.generateInputLabels()
		if err != nil {
			return nil, fmt.Errorf("生成输入标签失败: %v", err)
		}
		gc.InputLabelsA[i] = labels
		gc.WireLabels[i] = labels
	}

	// 参与方B的输入 (导线NumInputsA 到 NumInputsA+NumInputsB-1)
	for i := 0; i < g.circuit.NumInputsB; i++ {
		wireID := g.circuit.NumInputsA + i
		labels, err := g.generateInputLabels()
		if err != nil {
			return nil, fmt.Errorf("生成输入标签失败: %v", err)
		}
		gc.InputLabelsB[wireID] = labels
		gc.WireLabels[wireID] = labels
	}

	// 步骤2: 按拓扑顺序混淆每个门
	for _, gate := range g.circuit.Gates {
		if err := g.garbleGate(gate, gc, inputsA); err != nil {
			return nil, fmt.Errorf("混淆门%d失败: %v", gate.ID, err)
		}
	}

	// 步骤3: 设置输出标签映射
	gc.OutputLabels[g.circuit.OutputWireID] = map[bool]WireLabel{
		false: gc.WireLabels[g.circuit.OutputWireID][0],
		true:  gc.WireLabels[g.circuit.OutputWireID][1],
	}

	return gc, nil
}

func (g *Garbler) SerializeCircuit(gc *GarbledCircuit) ([]byte, error) {
	payload := serializedGarbledCircuit{
		Circuit:      gc.Circuit,
		GarbledGates: gc.GarbledGates,
		InputLabelsA: gc.InputLabelsA,
		InputLabelsB: gc.InputLabelsB,
		OutputLabels: make(map[int][2]WireLabel, len(gc.OutputLabels)),
		WireLabels:   gc.WireLabels,
	}
	for wireID, labelMap := range gc.OutputLabels {
		payload.OutputLabels[wireID] = [2]WireLabel{
			labelMap[false],
			labelMap[true],
		}
	}
	return json.Marshal(payload)
}

func (gc *GarbledCircuit) Serialize() ([]byte, error) {
	return (&Garbler{}).SerializeCircuit(gc)
}

func Deserialize(data []byte) (*GarbledCircuit, error) {
	var payload serializedGarbledCircuit
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	gc := &GarbledCircuit{
		Circuit:      payload.Circuit,
		GarbledGates: payload.GarbledGates,
		InputLabelsA: payload.InputLabelsA,
		InputLabelsB: payload.InputLabelsB,
		OutputLabels: make(map[int]map[bool]WireLabel, len(payload.OutputLabels)),
		WireLabels:   payload.WireLabels,
	}
	if gc.Circuit == nil {
		gc.Circuit = NewLoanEvaluationCircuit()
	}
	if gc.GarbledGates == nil {
		gc.GarbledGates = make(map[int]HalfGateTable)
	}
	if gc.InputLabelsA == nil {
		gc.InputLabelsA = make(map[int][2]WireLabel)
	}
	if gc.InputLabelsB == nil {
		gc.InputLabelsB = make(map[int][2]WireLabel)
	}
	if gc.WireLabels == nil {
		gc.WireLabels = make(map[int][2]WireLabel)
	}
	for wireID, labels := range payload.OutputLabels {
		gc.OutputLabels[wireID] = map[bool]WireLabel{
			false: labels[0],
			true:  labels[1],
		}
	}
	return gc, nil
}

// generateInputLabels 为输入导线生成标签对
func (g *Garbler) generateInputLabels() ([2]WireLabel, error) {
	label0, label1, err := g.hg.GenerateWireLabelPair()
	if err != nil {
		return [2]WireLabel{}, err
	}
	return [2]WireLabel{label0, label1}, nil
}

// garbleGate 混淆单个门
func (g *Garbler) garbleGate(gate Gate, gc *GarbledCircuit, inputsA []bool) error {
	switch gate.Type {
	case INPUT:
		// 输入门：处理常量输入
		if gate.InputA == -1 {
			// 这是一个常量门
			labels, err := g.generateInputLabels()
			if err != nil {
				return err
			}
			gc.WireLabels[gate.Output] = labels
		}
		return nil

	case AND:
		// AND门：使用Half-Gates协议
		aLabels, ok := gc.WireLabels[gate.InputA]
		if !ok {
			return fmt.Errorf("输入A导线%d的标签未找到", gate.InputA)
		}
		bLabels, ok := gc.WireLabels[gate.InputB]
		if !ok {
			return fmt.Errorf("输入B导线%d的标签未找到", gate.InputB)
		}

		// 确定输入的实际值（用于优化）
		pa := false
		pb := false
		if gate.InputA < len(inputsA) {
			pa = inputsA[gate.InputA]
		}
		if gate.InputB < len(inputsA) {
			pb = inputsA[gate.InputB]
		}

		table, cLabels, err := g.hg.GarbleANDGate(aLabels, bLabels, pa, pb)
		if err != nil {
			return fmt.Errorf("混淆AND门失败: %v", err)
		}

		gc.GarbledGates[gate.ID] = table
		gc.WireLabels[gate.Output] = cLabels
		return nil

	case XOR:
		// XOR门：使用Free-XOR技术
		aLabels, ok := gc.WireLabels[gate.InputA]
		if !ok {
			return fmt.Errorf("输入A导线%d的标签未找到", gate.InputA)
		}
		bLabels, ok := gc.WireLabels[gate.InputB]
		if !ok {
			return fmt.Errorf("输入B导线%d的标签未找到", gate.InputB)
		}

		cLabels := g.hg.GarbleXORGate(aLabels, bLabels)
		gc.WireLabels[gate.Output] = cLabels
		// XOR门不需要混淆表
		return nil

	case NOT:
		// NOT门：交换标签
		aLabels, ok := gc.WireLabels[gate.InputA]
		if !ok {
			return fmt.Errorf("输入导线%d的标签未找到", gate.InputA)
		}

		cLabels := g.hg.GarbleNOTGate(aLabels)
		gc.WireLabels[gate.Output] = cLabels
		// NOT门不需要混淆表
		return nil

	case BUF:
		aLabels, ok := gc.WireLabels[gate.InputA]
		if !ok {
			return fmt.Errorf("输入导线%d的标签未找到", gate.InputA)
		}
		gc.WireLabels[gate.Output] = aLabels
		return nil

	default:
		return fmt.Errorf("不支持的门类型: %v", gate.Type)
	}
}

// GetEvaluatorInfo 获取Evaluator需要的信息
// inputsB: Evaluator（数据中心B）的实际输入值
// 返回: Evaluator的输入标签（已选择对应实际值的标签）
func (g *Garbler) GetEvaluatorInfo(gc *GarbledCircuit, inputsB []bool) ([]WireLabel, error) {
	if len(inputsB) != g.circuit.NumInputsB {
		return nil, fmt.Errorf("输入B数量不匹配: 期望%d, 实际%d", g.circuit.NumInputsB, len(inputsB))
	}

	evaluatorLabels := make([]WireLabel, g.circuit.NumInputsB)

	for i := 0; i < g.circuit.NumInputsB; i++ {
		wireID := g.circuit.NumInputsA + i
		labels, ok := gc.InputLabelsB[wireID]
		if !ok {
			return nil, fmt.Errorf("导线%d的标签未找到", wireID)
		}

		// 根据实际输入值选择对应的标签
		if inputsB[i] {
			evaluatorLabels[i] = labels[1]
		} else {
			evaluatorLabels[i] = labels[0]
		}
	}

	return evaluatorLabels, nil
}

// DecodeOutput 解码输出结果
// outputLabel: Evaluator返回的输出标签
// 返回: 布尔结果值
func (g *Garbler) DecodeOutput(gc *GarbledCircuit, outputLabel WireLabel) (bool, error) {
	outputLabelMap, ok := gc.OutputLabels[g.circuit.OutputWireID]
	if !ok {
		return false, fmt.Errorf("输出标签映射未找到")
	}

	// 比较标签以确定结果
	if labelsEqual(outputLabel, outputLabelMap[false]) {
		return false, nil
	} else if labelsEqual(outputLabel, outputLabelMap[true]) {
		return true, nil
	}

	return false, fmt.Errorf("输出标签无法识别")
}

// labelsEqual 比较两个标签是否相等
func labelsEqual(a, b WireLabel) bool {
	for i := 0; i < 16; i++ {
		if a.Value[i] != b.Value[i] {
			return false
		}
	}
	return a.PermBit == b.PermBit
}

// GetDelta 获取Garbler的全局Delta值（用于调试，生产环境不应暴露）
func (g *Garbler) GetDelta() WireLabel {
	return g.hg.Delta
}
