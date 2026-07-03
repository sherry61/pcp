package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"

	"chainmaker.org/chainmaker/contract-sdk-go/v2/pb/protogo"
	"chainmaker.org/chainmaker/contract-sdk-go/v2/sandbox"
	"chainmaker.org/chainmaker/contract-sdk-go/v2/sdk"
)

const scale = int64(1000000)

const (
	sgxSimulationMode        = "SGX_SIM"
	sgxGradientMeasurementV1 = "pcp-vfl-sgx-gradient-enclave-v1"
	sgxAttestationSeedV1     = "pcp-vfl-sgx-simulation-attestation-key-v1"
)

type VFLAuditContract struct{}

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

func (c *VFLAuditContract) InitContract() protogo.Response {
	return sdk.Success([]byte("VFL audit contract initialized"))
}

func (c *VFLAuditContract) UpgradeContract() protogo.Response {
	return sdk.Success([]byte("VFL audit contract upgraded"))
}

func (c *VFLAuditContract) StoreVFLProof() protogo.Response {
	params := sdk.Instance.GetArgs()
	taskID := string(params["task_id"])
	modelID := string(params["model_id"])
	datasetRoot := string(params["dataset_root"])
	modelHash := string(params["model_hash"])
	proofRoot := string(params["proof_root"])
	proofJSON := params["proof_json"]

	if taskID == "" || modelID == "" || datasetRoot == "" || modelHash == "" || proofRoot == "" || len(proofJSON) == 0 {
		return sdk.Error("Missing required parameters")
	}

	var proof TrainingProof
	if err := json.Unmarshal(proofJSON, &proof); err != nil {
		return sdk.Error(fmt.Sprintf("Invalid proof_json: %v", err))
	}
	if proof.TaskID != taskID || proof.ModelID != modelID || proof.DatasetRoot != datasetRoot || proof.ModelHash != modelHash || proof.ProofRoot != proofRoot {
		return sdk.Error("Proof summary does not match proof_json")
	}
	result := verifyProof(proof)
	if !result["verified"].(bool) {
		reasons, _ := json.Marshal(result["reasons"])
		return sdk.Error(fmt.Sprintf("Proof verification failed: %s", string(reasons)))
	}

	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	record := map[string]interface{}{
		"task_id":              taskID,
		"model_id":             modelID,
		"dataset_root":         datasetRoot,
		"model_hash":           modelHash,
		"proof_root":           proofRoot,
		"round_count":          string(params["round_count"]),
		"sample_count":         string(params["sample_count"]),
		"learning_rate_scaled": string(params["learning_rate_scaled"]),
		"proof_json":           string(proofJSON),
		"status":               "stored",
		"timestamp":            timestamp,
	}
	data, _ := json.Marshal(record)
	if err := sdk.Instance.PutStateByte("vfl_audit", fmt.Sprintf("VFL_PROOF_%s", taskID), data); err != nil {
		return sdk.Error(fmt.Sprintf("Failed to store VFL proof: %v", err))
	}
	sdk.Instance.EmitEvent("VFLProofStored", []string{taskID, modelID, proofRoot})
	return sdk.Success([]byte("VFL proof stored successfully"))
}

func (c *VFLAuditContract) VerifyVFLProof() protogo.Response {
	params := sdk.Instance.GetArgs()
	auditID := string(params["audit_id"])
	taskID := string(params["task_id"])
	modelID := string(params["model_id"])
	proofJSON := params["proof_json"]
	if auditID == "" || taskID == "" || modelID == "" || len(proofJSON) == 0 {
		return sdk.Error("Missing required parameters")
	}

	var proof TrainingProof
	if err := json.Unmarshal(proofJSON, &proof); err != nil {
		return sdk.Error(fmt.Sprintf("Invalid proof_json: %v", err))
	}
	result := verifyProof(proof)
	if !result["verified"].(bool) {
		reasons, _ := json.Marshal(result["reasons"])
		return sdk.Error(fmt.Sprintf("Proof verification failed: %s", string(reasons)))
	}
	if proof.TaskID != taskID || proof.ModelID != modelID {
		return sdk.Error("Proof task/model does not match request")
	}
	if proof.DatasetRoot != string(params["dataset_root"]) || proof.ModelHash != string(params["model_hash"]) || proof.ProofRoot != string(params["proof_root"]) {
		return sdk.Error("Proof roots do not match request")
	}

	timestamp, err := sdk.Instance.GetTxTimeStamp()
	if err != nil {
		return sdk.Error("Failed to get timestamp")
	}

	record := map[string]interface{}{
		"audit_id":        auditID,
		"task_id":         taskID,
		"model_id":        modelID,
		"dataset_root":    proof.DatasetRoot,
		"model_hash":      proof.ModelHash,
		"proof_root":      proof.ProofRoot,
		"verified":        "true",
		"monotonic_loss":  result["monotonic_loss"],
		"gradient_linked": result["gradient_linked"],
		"round_count":     fmt.Sprintf("%d", len(proof.Rounds)),
		"sample_count":    fmt.Sprintf("%d", proof.SampleCount),
		"reasons":         "[]",
		"timestamp":       timestamp,
		"status":          "completed",
	}
	data, _ := json.Marshal(record)
	if err := sdk.Instance.PutStateByte("vfl_audit", fmt.Sprintf("VFL_AUDIT_%s", auditID), data); err != nil {
		return sdk.Error(fmt.Sprintf("Failed to store VFL audit: %v", err))
	}
	if err := sdk.Instance.PutStateByte("vfl_audit", fmt.Sprintf("VFL_AUDIT_BY_TASK_%s", taskID), data); err != nil {
		return sdk.Error(fmt.Sprintf("Failed to index VFL audit: %v", err))
	}
	sdk.Instance.EmitEvent("VFLProofVerified", []string{auditID, taskID, proof.ProofRoot})
	return sdk.Success([]byte("VFL proof verified successfully"))
}

func (c *VFLAuditContract) QueryVFLAudit() protogo.Response {
	params := sdk.Instance.GetArgs()
	auditID := string(params["audit_id"])
	if auditID == "" {
		return sdk.Error("audit_id is required")
	}
	data, err := sdk.Instance.GetStateByte("vfl_audit", fmt.Sprintf("VFL_AUDIT_%s", auditID))
	if err != nil || len(data) == 0 {
		return sdk.Error("VFL audit not found")
	}
	return sdk.Success(data)
}

func (c *VFLAuditContract) QueryVFLProof() protogo.Response {
	params := sdk.Instance.GetArgs()
	taskID := string(params["task_id"])
	if taskID == "" {
		return sdk.Error("task_id is required")
	}
	data, err := sdk.Instance.GetStateByte("vfl_audit", fmt.Sprintf("VFL_PROOF_%s", taskID))
	if err != nil || len(data) == 0 {
		return sdk.Error("VFL proof not found")
	}
	return sdk.Success(data)
}

func (c *VFLAuditContract) InvokeContract(method string) protogo.Response {
	switch method {
	case "StoreVFLProof":
		return c.StoreVFLProof()
	case "VerifyVFLProof":
		return c.VerifyVFLProof()
	case "QueryVFLAudit":
		return c.QueryVFLAudit()
	case "QueryVFLProof":
		return c.QueryVFLProof()
	default:
		return sdk.Error("invalid method")
	}
}

func verifyProof(proof TrainingProof) map[string]interface{} {
	reasons := make([]string, 0)
	addReason := func(reason string) {
		reasons = append(reasons, reason)
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
		expectedRoundHash, err := expectedRoundHash(proof.TaskID, proof.ModelID, round)
		if err != nil {
			addReason(fmt.Sprintf("round %d hash calculation failed: %v", round.Round, err))
		} else if expectedRoundHash != round.RoundHash {
			addReason(fmt.Sprintf("round %d hash mismatch", round.Round))
		}
		if len(round.Gradient) > 0 {
			if len(round.WeightsBefore) != len(round.Gradient) || len(round.WeightsAfter) != len(round.Gradient) {
				addReason(fmt.Sprintf("round %d vector length mismatch", round.Round))
			} else {
				for j := range round.Gradient {
					expectedAfter := round.WeightsBefore[j] - (proof.LearningRateScaled*round.Gradient[j])/scale
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

	if len(proof.Rounds) > 0 && !equalInt64s(proof.FinalWeights, proof.Rounds[len(proof.Rounds)-1].WeightsAfter) {
		addReason("final_weights does not match final round")
	}
	expectedModelHash, err := modelHash(proof.TaskID, proof.ModelID, proof.FinalWeights)
	if err != nil {
		addReason(fmt.Sprintf("model hash calculation failed: %v", err))
	} else if expectedModelHash != proof.ModelHash {
		addReason("model_hash mismatch")
	}
	expectedProofRoot, err := proofRoot(proof.TaskID, proof.ModelID, proof.DatasetRoot, proof.ModelHash, proof.Rounds)
	if err != nil {
		addReason(fmt.Sprintf("proof root calculation failed: %v", err))
	} else if expectedProofRoot != proof.ProofRoot {
		addReason("proof_root mismatch")
	}

	return map[string]interface{}{
		"verified":        len(reasons) == 0 && monotonicLoss && gradientLinked,
		"reasons":         reasons,
		"monotonic_loss":  monotonicLoss,
		"gradient_linked": gradientLinked,
	}
}

func modelHash(taskID, modelID string, weights []int64) (string, error) {
	return hashCanonical(map[string]interface{}{
		"task_id":  taskID,
		"model_id": modelID,
		"weights":  weights,
	})
}

func hashRound(taskID, modelID string, round int, before, gradient, after []int64, lossScaled int64) (string, error) {
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

func hashProtectedRound(taskID, modelID string, round int, before, after []int64, lossScaled int64, gradientCommitment string, report SGXEnclaveReport) (string, error) {
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

func expectedRoundHash(taskID, modelID string, round RoundProof) (string, error) {
	if len(round.Gradient) > 0 {
		return hashRound(taskID, modelID, round.Round, round.WeightsBefore, round.Gradient, round.WeightsAfter, round.LossScaled)
	}
	return hashProtectedRound(taskID, modelID, round.Round, round.WeightsBefore, round.WeightsAfter, round.LossScaled, round.GradientCommitment, round.EnclaveReport)
}

func verifySGXRoundReport(taskID, modelID string, learningRateScaled int64, round RoundProof) error {
	if round.GradientCommitment == "" {
		return fmt.Errorf("gradient_commitment is required")
	}
	if len(round.WeightsBefore) != len(round.WeightsAfter) {
		return fmt.Errorf("weight vector length mismatch")
	}
	report := round.EnclaveReport
	if report.Mode != sgxSimulationMode {
		return fmt.Errorf("unsupported enclave mode %q", report.Mode)
	}
	if report.Measurement != sgxMeasurement() {
		return fmt.Errorf("enclave measurement mismatch")
	}
	expectedPayloadHash, err := sgxRoundPayloadHash(taskID, modelID, round.Round, round.WeightsBefore, round.GradientCommitment, round.WeightsAfter, round.LossScaled, learningRateScaled)
	if err != nil {
		return err
	}
	if report.PayloadHash != expectedPayloadHash {
		return fmt.Errorf("enclave payload hash mismatch")
	}
	publicKey, err := hex.DecodeString(report.PublicKey)
	if err != nil {
		return fmt.Errorf("invalid enclave public key: %v", err)
	}
	if !equalBytes(publicKey, sgxAttestationPublicKey()) {
		return fmt.Errorf("enclave public key mismatch")
	}
	signature, err := hex.DecodeString(report.Signature)
	if err != nil {
		return fmt.Errorf("invalid enclave signature: %v", err)
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), []byte(report.PayloadHash), signature) {
		return fmt.Errorf("enclave signature verification failed")
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

func sgxAttestationPrivateKey() ed25519.PrivateKey {
	seedSum := sha256.Sum256([]byte(sgxAttestationSeedV1))
	return ed25519.NewKeyFromSeed(seedSum[:])
}

func sgxAttestationPublicKey() []byte {
	return sgxAttestationPrivateKey().Public().(ed25519.PublicKey)
}

func proofRoot(taskID, modelID, datasetRoot, modelHash string, rounds []RoundProof) (string, error) {
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

func hashCanonical(v interface{}) (string, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
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

func main() {
	if err := sandbox.Start(new(VFLAuditContract)); err != nil {
		log.Fatal(err)
	}
}
