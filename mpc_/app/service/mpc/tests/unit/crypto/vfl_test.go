package crypto

import (
	"encoding/json"
	"testing"

	"blockchain_data_auth/crypto/vfl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func validVFLRequest() vfl.TrainRequest {
	return vfl.TrainRequest{
		TaskID:       "vfl_task_unit",
		ModelID:      "risk_lr_v1",
		Participants: []string{"BANK001", "DC001"},
		Epochs:       4,
		LearningRate: 0.05,
		Datasets: []vfl.PartyDataset{
			{
				PartyID: "BANK001",
				Features: [][]float64{
					{0.20, 0.10},
					{0.80, 0.70},
					{0.40, 0.20},
					{0.90, 0.85},
				},
				Labels: []float64{0, 1, 0, 1},
			},
			{
				PartyID: "DC001",
				Features: [][]float64{
					{0.30},
					{0.90},
					{0.45},
					{0.95},
				},
			},
		},
	}
}

func TestVFLTrainAndVerifyProof(t *testing.T) {
	result, err := vfl.Train(validVFLRequest())
	require.NoError(t, err)
	require.NotEmpty(t, result.ProofRoot)
	require.Len(t, result.TrainingProof.Rounds, 4)
	for _, round := range result.TrainingProof.Rounds {
		assert.Empty(t, round.Gradient)
		assert.NotEmpty(t, round.GradientCommitment)
		assert.Equal(t, "SGX_SIM", round.EnclaveReport.Mode)
		assert.NotEmpty(t, round.EnclaveReport.Measurement)
		assert.NotEmpty(t, round.EnclaveReport.Signature)
	}

	proofJSON, err := json.Marshal(result.TrainingProof)
	require.NoError(t, err)
	assert.NotContains(t, string(proofJSON), `"gradient":[`)

	verifyResult := vfl.VerifyProof(result.TrainingProof)
	assert.True(t, verifyResult.Verified)
	assert.True(t, verifyResult.MonotonicLoss)
	assert.True(t, verifyResult.GradientLinked)
	assert.Empty(t, verifyResult.Reasons)
}

func TestVFLVerifyRejectsTamperedRound(t *testing.T) {
	result, err := vfl.Train(validVFLRequest())
	require.NoError(t, err)

	proof := result.TrainingProof
	proof.Rounds[1].WeightsAfter[0]++

	verifyResult := vfl.VerifyProof(proof)
	assert.False(t, verifyResult.Verified)
	assert.NotEmpty(t, verifyResult.Reasons)
}

func TestVFLVerifyRejectsTamperedSGXReport(t *testing.T) {
	result, err := vfl.Train(validVFLRequest())
	require.NoError(t, err)

	proof := result.TrainingProof
	proof.Rounds[0].EnclaveReport.Signature = "00" + proof.Rounds[0].EnclaveReport.Signature

	verifyResult := vfl.VerifyProof(proof)
	assert.False(t, verifyResult.Verified)
	assert.NotEmpty(t, verifyResult.Reasons)
}

func TestVFLTrainRequiresOneLabelOwner(t *testing.T) {
	req := validVFLRequest()
	req.Datasets[1].Labels = []float64{0, 1, 0, 1}

	_, err := vfl.Train(req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "only one label owner")
}
