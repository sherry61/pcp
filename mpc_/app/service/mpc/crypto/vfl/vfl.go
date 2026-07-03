package vfl

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
)

const Scale = 1000000

const (
	sgxSimulationMode        = "SGX_SIM"
	sgxGradientMeasurementV1 = "pcp-vfl-sgx-gradient-enclave-v1"
	sgxAttestationSeedV1     = "pcp-vfl-sgx-simulation-attestation-key-v1"
)

type PartyDataset struct {
	PartyID  string      `json:"party_id"`
	Features [][]float64 `json:"features"`
	Labels   []float64   `json:"labels,omitempty"`
}

type TrainRequest struct {
	TaskID       string         `json:"task_id"`
	ModelID      string         `json:"model_id"`
	Participants []string       `json:"participants"`
	Datasets     []PartyDataset `json:"datasets"`
	Epochs       int            `json:"epochs"`
	LearningRate float64        `json:"learning_rate"`
}

type RoundProof struct {
	Round              int              `json:"round"`
	WeightsBefore      []int64          `json:"weights_before"`
	Gradient           []int64          `json:"gradient,omitempty"`
	GradientCommitment string           `json:"gradient_commitment,omitempty"`
	WeightsAfter       []int64          `json:"weights_after"`
	LossScaled         int64            `json:"loss_scaled"`
	RoundHash          string           `json:"round_hash"`
	EnclaveReport      SGXEnclaveReport `json:"enclave_report,omitempty"`
}

type SGXEnclaveReport struct {
	Mode        string `json:"mode"`
	Measurement string `json:"measurement"`
	PublicKey   string `json:"public_key"`
	PayloadHash string `json:"payload_hash"`
	Signature   string `json:"signature"`
}

type TrainingProof struct {
	TaskID             string       `json:"task_id"`
	ModelID            string       `json:"model_id"`
	Participants       []string     `json:"participants"`
	SampleCount        int          `json:"sample_count"`
	FeatureDimensions  []int        `json:"feature_dimensions"`
	LearningRateScaled int64        `json:"learning_rate_scaled"`
	DatasetRoot        string       `json:"dataset_root"`
	ModelHash          string       `json:"model_hash"`
	ProofRoot          string       `json:"proof_root"`
	Rounds             []RoundProof `json:"rounds"`
	FinalWeights       []int64      `json:"final_weights"`
}

type TrainResult struct {
	TaskID        string        `json:"task_id"`
	ModelID       string        `json:"model_id"`
	Weights       []float64     `json:"weights"`
	Accuracy      float64       `json:"accuracy"`
	FinalLoss     float64       `json:"final_loss"`
	DatasetRoot   string        `json:"dataset_root"`
	ModelHash     string        `json:"model_hash"`
	ProofRoot     string        `json:"proof_root"`
	TrainingProof TrainingProof `json:"training_proof"`
}

type VerificationResult struct {
	Verified       bool     `json:"verified"`
	Reasons        []string `json:"reasons"`
	DatasetRoot    string   `json:"dataset_root"`
	ModelHash      string   `json:"model_hash"`
	ProofRoot      string   `json:"proof_root"`
	RoundCount     int      `json:"round_count"`
	SampleCount    int      `json:"sample_count"`
	MonotonicLoss  bool     `json:"monotonic_loss"`
	GradientLinked bool     `json:"gradient_linked"`
}

func Train(req TrainRequest) (TrainResult, error) {
	if err := validateTrainRequest(req); err != nil {
		return TrainResult{}, err
	}

	x, y, dims, err := mergeVerticalDatasets(req.Datasets)
	if err != nil {
		return TrainResult{}, err
	}

	learningRateScaled := scaleFloat(req.LearningRate)
	weights := make([]int64, len(x[0]))
	rounds := make([]RoundProof, 0, req.Epochs)

	for round := 1; round <= req.Epochs; round++ {
		before := cloneInt64s(weights)
		after, roundProof, err := protectedGradientStep(req.TaskID, req.ModelID, round, x, y, before, learningRateScaled)
		if err != nil {
			return TrainResult{}, err
		}
		weights = after
		rounds = append(rounds, roundProof)
	}

	datasetRoot, err := DatasetRoot(req.Datasets)
	if err != nil {
		return TrainResult{}, err
	}
	modelHash, err := ModelHash(req.TaskID, req.ModelID, weights)
	if err != nil {
		return TrainResult{}, err
	}
	proofRoot, err := ProofRoot(req.TaskID, req.ModelID, datasetRoot, modelHash, rounds)
	if err != nil {
		return TrainResult{}, err
	}

	proof := TrainingProof{
		TaskID:             req.TaskID,
		ModelID:            req.ModelID,
		Participants:       cloneStrings(req.Participants),
		SampleCount:        len(x),
		FeatureDimensions:  dims,
		LearningRateScaled: learningRateScaled,
		DatasetRoot:        datasetRoot,
		ModelHash:          modelHash,
		ProofRoot:          proofRoot,
		Rounds:             rounds,
		FinalWeights:       cloneInt64s(weights),
	}

	finalLoss := 0.0
	if len(rounds) > 0 {
		finalLoss = unscaleFloat(rounds[len(rounds)-1].LossScaled)
	}

	return TrainResult{
		TaskID:        req.TaskID,
		ModelID:       req.ModelID,
		Weights:       unscaleSlice(weights),
		Accuracy:      accuracy(x, y, weights),
		FinalLoss:     finalLoss,
		DatasetRoot:   datasetRoot,
		ModelHash:     modelHash,
		ProofRoot:     proofRoot,
		TrainingProof: proof,
	}, nil
}

func VerifyProof(proof TrainingProof) VerificationResult {
	result := VerificationResult{
		DatasetRoot: proof.DatasetRoot,
		ModelHash:   proof.ModelHash,
		ProofRoot:   proof.ProofRoot,
		RoundCount:  len(proof.Rounds),
		SampleCount: proof.SampleCount,
	}

	addReason := func(reason string) {
		result.Reasons = append(result.Reasons, reason)
	}

	if proof.TaskID == "" {
		addReason("task_id is required")
	}
	if proof.ModelID == "" {
		addReason("model_id is required")
	}
	if proof.DatasetRoot == "" {
		addReason("dataset_root is required")
	}
	if len(proof.Rounds) == 0 {
		addReason("rounds are required")
	}

	monotonicLoss := true
	gradientLinked := true
	var previousLoss int64
	var previousAfter []int64

	for i, round := range proof.Rounds {
		if round.Round != i+1 {
			addReason(fmt.Sprintf("round %d has invalid index %d", i+1, round.Round))
		}
		if i > 0 && !equalInt64s(previousAfter, round.WeightsBefore) {
			gradientLinked = false
			addReason(fmt.Sprintf("round %d weights_before does not match prior weights_after", round.Round))
		}
		if i > 0 && round.LossScaled > previousLoss {
			monotonicLoss = false
			addReason(fmt.Sprintf("round %d loss increased", round.Round))
		}
		expectedHash, err := expectedRoundHash(proof.TaskID, proof.ModelID, round)
		if err != nil {
			addReason(fmt.Sprintf("round %d hash calculation failed: %v", round.Round, err))
		} else if expectedHash != round.RoundHash {
			addReason(fmt.Sprintf("round %d hash mismatch", round.Round))
		}
		if len(round.Gradient) > 0 {
			if len(round.WeightsBefore) != len(round.Gradient) || len(round.WeightsAfter) != len(round.Gradient) {
				addReason(fmt.Sprintf("round %d vector length mismatch", round.Round))
			} else {
				for j := range round.Gradient {
					expectedAfter := round.WeightsBefore[j] - (proof.LearningRateScaled*round.Gradient[j])/Scale
					if expectedAfter != round.WeightsAfter[j] {
						gradientLinked = false
						addReason(fmt.Sprintf("round %d weight %d is not derived from gradient", round.Round, j))
						break
					}
				}
			}
		} else {
			if err := verifySGXRoundReport(proof.TaskID, proof.ModelID, proof.LearningRateScaled, round); err != nil {
				gradientLinked = false
				addReason(fmt.Sprintf("round %d protected gradient report invalid: %v", round.Round, err))
			}
		}
		previousLoss = round.LossScaled
		previousAfter = round.WeightsAfter
	}

	result.MonotonicLoss = monotonicLoss
	result.GradientLinked = gradientLinked

	if len(proof.Rounds) > 0 && !equalInt64s(proof.FinalWeights, proof.Rounds[len(proof.Rounds)-1].WeightsAfter) {
		addReason("final_weights does not match final round")
	}

	expectedModelHash, err := ModelHash(proof.TaskID, proof.ModelID, proof.FinalWeights)
	if err != nil {
		addReason(fmt.Sprintf("model hash calculation failed: %v", err))
	} else if expectedModelHash != proof.ModelHash {
		addReason("model_hash mismatch")
	}

	expectedProofRoot, err := ProofRoot(proof.TaskID, proof.ModelID, proof.DatasetRoot, proof.ModelHash, proof.Rounds)
	if err != nil {
		addReason(fmt.Sprintf("proof root calculation failed: %v", err))
	} else if expectedProofRoot != proof.ProofRoot {
		addReason("proof_root mismatch")
	}

	result.Verified = len(result.Reasons) == 0 && result.MonotonicLoss && result.GradientLinked
	return result
}

func DatasetRoot(datasets []PartyDataset) (string, error) {
	if len(datasets) == 0 {
		return "", errors.New("datasets are required")
	}
	partyHashes := make([]string, 0, len(datasets))
	for _, dataset := range datasets {
		if dataset.PartyID == "" {
			return "", errors.New("party_id is required")
		}
		payload := struct {
			PartyID  string    `json:"party_id"`
			Features [][]int64 `json:"features"`
			Labels   []int64   `json:"labels,omitempty"`
		}{
			PartyID:  dataset.PartyID,
			Features: scaleMatrix(dataset.Features),
			Labels:   scaleSlice(dataset.Labels),
		}
		hash, err := hashCanonical(payload)
		if err != nil {
			return "", err
		}
		partyHashes = append(partyHashes, hash)
	}
	sort.Strings(partyHashes)
	return hashCanonical(map[string]interface{}{"party_hashes": partyHashes})
}

func ModelHash(taskID, modelID string, weights []int64) (string, error) {
	return hashCanonical(map[string]interface{}{
		"task_id":  taskID,
		"model_id": modelID,
		"weights":  weights,
	})
}

func HashRound(taskID, modelID string, round int, before, gradient, after []int64, lossScaled int64) (string, error) {
	return hashCanonical(map[string]interface{}{
		"task_id":        taskID,
		"model_id":       modelID,
		"round":          round,
		"weights_before": before,
		"gradient":       gradient,
		"weights_after":  after,
		"loss_scaled":    lossScaled,
	})
}

func HashProtectedRound(taskID, modelID string, round int, before, after []int64, lossScaled int64, gradientCommitment string, report SGXEnclaveReport) (string, error) {
	return hashCanonical(map[string]interface{}{
		"task_id":             taskID,
		"model_id":            modelID,
		"round":               round,
		"weights_before":      before,
		"gradient_commitment": gradientCommitment,
		"weights_after":       after,
		"loss_scaled":         lossScaled,
		"enclave_report":      report,
	})
}

func buildRoundProof(taskID, modelID string, round int, before, gradient, after []int64, lossScaled, learningRateScaled int64) (RoundProof, error) {
	if os.Getenv("VFL_DISABLE_SGX_GRADIENT_PROTECTION") == "true" {
		roundHash, err := HashRound(taskID, modelID, round, before, gradient, after, lossScaled)
		if err != nil {
			return RoundProof{}, err
		}
		return RoundProof{
			Round:         round,
			WeightsBefore: before,
			Gradient:      gradient,
			WeightsAfter:  after,
			LossScaled:    lossScaled,
			RoundHash:     roundHash,
		}, nil
	}
	if err := ensureSGXSimulationAvailable(); err != nil {
		return RoundProof{}, err
	}

	gradientCommitment, err := hashCanonical(map[string]interface{}{
		"task_id":  taskID,
		"model_id": modelID,
		"round":    round,
		"gradient": gradient,
	})
	if err != nil {
		return RoundProof{}, err
	}

	report, err := signSGXRoundReport(taskID, modelID, round, before, gradientCommitment, after, lossScaled, learningRateScaled)
	if err != nil {
		return RoundProof{}, err
	}

	roundHash, err := HashProtectedRound(taskID, modelID, round, before, after, lossScaled, gradientCommitment, report)
	if err != nil {
		return RoundProof{}, err
	}
	return RoundProof{
		Round:              round,
		WeightsBefore:      before,
		GradientCommitment: gradientCommitment,
		WeightsAfter:       after,
		LossScaled:         lossScaled,
		RoundHash:          roundHash,
		EnclaveReport:      report,
	}, nil
}

func protectedGradientStep(taskID, modelID string, round int, x [][]int64, y []int64, before []int64, learningRateScaled int64) ([]int64, RoundProof, error) {
	gradient, lossScaled := gradientAndLoss(x, y, before)
	after := cloneInt64s(before)
	for i := range after {
		after[i] -= (learningRateScaled * gradient[i]) / Scale
	}
	roundProof, err := buildRoundProof(taskID, modelID, round, before, gradient, after, lossScaled, learningRateScaled)
	if err != nil {
		return nil, RoundProof{}, err
	}
	return after, roundProof, nil
}

func expectedRoundHash(taskID, modelID string, round RoundProof) (string, error) {
	if len(round.Gradient) > 0 {
		return HashRound(taskID, modelID, round.Round, round.WeightsBefore, round.Gradient, round.WeightsAfter, round.LossScaled)
	}
	return HashProtectedRound(taskID, modelID, round.Round, round.WeightsBefore, round.WeightsAfter, round.LossScaled, round.GradientCommitment, round.EnclaveReport)
}

func signSGXRoundReport(taskID, modelID string, round int, before []int64, gradientCommitment string, after []int64, lossScaled, learningRateScaled int64) (SGXEnclaveReport, error) {
	payloadHash, err := sgxRoundPayloadHash(taskID, modelID, round, before, gradientCommitment, after, lossScaled, learningRateScaled)
	if err != nil {
		return SGXEnclaveReport{}, err
	}
	privateKey := sgxAttestationPrivateKey()
	signature := ed25519.Sign(privateKey, []byte(payloadHash))
	publicKey := privateKey.Public().(ed25519.PublicKey)
	return SGXEnclaveReport{
		Mode:        sgxSimulationMode,
		Measurement: sgxMeasurement(),
		PublicKey:   hex.EncodeToString(publicKey),
		PayloadHash: payloadHash,
		Signature:   hex.EncodeToString(signature),
	}, nil
}

func verifySGXRoundReport(taskID, modelID string, learningRateScaled int64, round RoundProof) error {
	if round.GradientCommitment == "" {
		return errors.New("gradient_commitment is required")
	}
	if len(round.WeightsBefore) != len(round.WeightsAfter) {
		return errors.New("weight vector length mismatch")
	}
	report := round.EnclaveReport
	if report.Mode != sgxSimulationMode {
		return fmt.Errorf("unsupported enclave mode %q", report.Mode)
	}
	if report.Measurement != sgxMeasurement() {
		return errors.New("enclave measurement mismatch")
	}
	expectedPayloadHash, err := sgxRoundPayloadHash(taskID, modelID, round.Round, round.WeightsBefore, round.GradientCommitment, round.WeightsAfter, round.LossScaled, learningRateScaled)
	if err != nil {
		return err
	}
	if report.PayloadHash != expectedPayloadHash {
		return errors.New("enclave payload hash mismatch")
	}
	publicKey, err := hex.DecodeString(report.PublicKey)
	if err != nil {
		return fmt.Errorf("invalid enclave public key: %v", err)
	}
	if !equalBytes(publicKey, sgxAttestationPublicKey()) {
		return errors.New("enclave public key mismatch")
	}
	signature, err := hex.DecodeString(report.Signature)
	if err != nil {
		return fmt.Errorf("invalid enclave signature: %v", err)
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), []byte(report.PayloadHash), signature) {
		return errors.New("enclave signature verification failed")
	}
	return nil
}

func sgxRoundPayloadHash(taskID, modelID string, round int, before []int64, gradientCommitment string, after []int64, lossScaled, learningRateScaled int64) (string, error) {
	return hashCanonical(map[string]interface{}{
		"mode":                 sgxSimulationMode,
		"measurement":          sgxMeasurement(),
		"task_id":              taskID,
		"model_id":             modelID,
		"round":                round,
		"weights_before":       before,
		"gradient_commitment":  gradientCommitment,
		"weights_after":        after,
		"loss_scaled":          lossScaled,
		"learning_rate_scaled": learningRateScaled,
	})
}

func sgxMeasurement() string {
	sum := sha256.Sum256([]byte(sgxGradientMeasurementV1))
	return hex.EncodeToString(sum[:])
}

func ensureSGXSimulationAvailable() error {
	sgxSDK := os.Getenv("SGX_SDK")
	if sgxSDK == "" {
		sgxSDK = "/opt/intel/sgxsdk"
	}
	candidates := []string{
		filepath.Join(sgxSDK, "lib64", "libsgx_urts_sim.so"),
		filepath.Join(sgxSDK, "sdk_libs", "libsgx_urts_sim.so"),
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return nil
		}
	}
	return fmt.Errorf("SGX simulation runtime not found under %s; source /opt/intel/sgxsdk/environment or set VFL_DISABLE_SGX_GRADIENT_PROTECTION=true for legacy mode", sgxSDK)
}

func sgxAttestationPrivateKey() ed25519.PrivateKey {
	seedSum := sha256.Sum256([]byte(sgxAttestationSeedV1))
	return ed25519.NewKeyFromSeed(seedSum[:])
}

func sgxAttestationPublicKey() []byte {
	return sgxAttestationPrivateKey().Public().(ed25519.PublicKey)
}

func ProofRoot(taskID, modelID, datasetRoot, modelHash string, rounds []RoundProof) (string, error) {
	roundHashes := make([]string, len(rounds))
	for i, round := range rounds {
		roundHashes[i] = round.RoundHash
	}
	return hashCanonical(map[string]interface{}{
		"task_id":      taskID,
		"model_id":     modelID,
		"dataset_root": datasetRoot,
		"model_hash":   modelHash,
		"round_hashes": roundHashes,
	})
}

func validateTrainRequest(req TrainRequest) error {
	if req.TaskID == "" {
		return errors.New("task_id is required")
	}
	if req.ModelID == "" {
		return errors.New("model_id is required")
	}
	if len(req.Participants) < 2 {
		return errors.New("at least two participants are required for vertical federated learning")
	}
	if len(req.Datasets) != len(req.Participants) {
		return errors.New("datasets count must equal participants count")
	}
	if req.Epochs <= 0 {
		return errors.New("epochs must be greater than zero")
	}
	if req.LearningRate <= 0 || req.LearningRate > 1 {
		return errors.New("learning_rate must be in (0, 1]")
	}
	return nil
}

func mergeVerticalDatasets(datasets []PartyDataset) ([][]int64, []int64, []int, error) {
	sampleCount := -1
	labelOwner := -1
	dims := make([]int, len(datasets))
	for i, dataset := range datasets {
		if len(dataset.Features) == 0 {
			return nil, nil, nil, fmt.Errorf("dataset %s has no features", dataset.PartyID)
		}
		if sampleCount == -1 {
			sampleCount = len(dataset.Features)
		}
		if len(dataset.Features) != sampleCount {
			return nil, nil, nil, fmt.Errorf("dataset %s sample count mismatch", dataset.PartyID)
		}
		dim := len(dataset.Features[0])
		if dim == 0 {
			return nil, nil, nil, fmt.Errorf("dataset %s has empty feature rows", dataset.PartyID)
		}
		for row := range dataset.Features {
			if len(dataset.Features[row]) != dim {
				return nil, nil, nil, fmt.Errorf("dataset %s feature dimension mismatch at row %d", dataset.PartyID, row)
			}
		}
		dims[i] = dim
		if len(dataset.Labels) > 0 {
			if len(dataset.Labels) != sampleCount {
				return nil, nil, nil, fmt.Errorf("dataset %s labels count mismatch", dataset.PartyID)
			}
			if labelOwner != -1 {
				return nil, nil, nil, errors.New("only one label owner is allowed")
			}
			labelOwner = i
		}
	}
	if labelOwner == -1 {
		return nil, nil, nil, errors.New("one party must provide labels")
	}

	featureCount := 0
	for _, dim := range dims {
		featureCount += dim
	}
	x := make([][]int64, sampleCount)
	for row := 0; row < sampleCount; row++ {
		merged := make([]int64, 0, featureCount)
		for _, dataset := range datasets {
			for _, value := range dataset.Features[row] {
				merged = append(merged, scaleFloat(value))
			}
		}
		x[row] = merged
	}
	y := scaleSlice(datasets[labelOwner].Labels)
	for i, label := range y {
		if label != 0 && label != Scale {
			return nil, nil, nil, fmt.Errorf("label at row %d must be 0 or 1", i)
		}
	}
	return x, y, dims, nil
}

func gradientAndLoss(x [][]int64, y []int64, weights []int64) ([]int64, int64) {
	gradient := make([]int64, len(weights))
	var loss float64
	for i, row := range x {
		z := dot(row, weights)
		p := sigmoid(unscaleFloat(z))
		label := unscaleFloat(y[i])
		p = math.Max(1e-12, math.Min(1-1e-12, p))
		loss += -(label*math.Log(p) + (1-label)*math.Log(1-p))
		errScaled := scaleFloat(p - label)
		for j, feature := range row {
			gradient[j] += (errScaled * feature) / Scale
		}
	}
	n := int64(len(x))
	for j := range gradient {
		gradient[j] /= n
	}
	return gradient, scaleFloat(loss / float64(len(x)))
}

func accuracy(x [][]int64, y []int64, weights []int64) float64 {
	correct := 0
	for i, row := range x {
		pred := int64(0)
		if sigmoid(unscaleFloat(dot(row, weights))) >= 0.5 {
			pred = Scale
		}
		if pred == y[i] {
			correct++
		}
	}
	return float64(correct) / float64(len(x))
}

func dot(a, b []int64) int64 {
	var sum int64
	for i := range a {
		sum += (a[i] * b[i]) / Scale
	}
	return sum
}

func sigmoid(x float64) float64 {
	if x >= 0 {
		z := math.Exp(-x)
		return 1 / (1 + z)
	}
	z := math.Exp(x)
	return z / (1 + z)
}

func hashCanonical(v interface{}) (string, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func scaleFloat(v float64) int64 {
	return int64(math.Round(v * Scale))
}

func unscaleFloat(v int64) float64 {
	return float64(v) / Scale
}

func scaleSlice(values []float64) []int64 {
	scaled := make([]int64, len(values))
	for i, value := range values {
		scaled[i] = scaleFloat(value)
	}
	return scaled
}

func scaleMatrix(values [][]float64) [][]int64 {
	scaled := make([][]int64, len(values))
	for i, row := range values {
		scaled[i] = scaleSlice(row)
	}
	return scaled
}

func unscaleSlice(values []int64) []float64 {
	unscaled := make([]float64, len(values))
	for i, value := range values {
		unscaled[i] = unscaleFloat(value)
	}
	return unscaled
}

func cloneInt64s(values []int64) []int64 {
	cloned := make([]int64, len(values))
	copy(cloned, values)
	return cloned
}

func cloneStrings(values []string) []string {
	cloned := make([]string, len(values))
	copy(cloned, values)
	return cloned
}

func equalInt64s(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func equalBytes(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
