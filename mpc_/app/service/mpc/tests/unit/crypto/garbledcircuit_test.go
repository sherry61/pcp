package crypto

import (
	"encoding/base64"
	"testing"

	"blockchain_data_auth/crypto/garbledcircuit"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGarbledCircuitSerializeRoundTrip(t *testing.T) {
	circuit := garbledcircuit.NewLoanEvaluationCircuit()
	garbler, err := garbledcircuit.NewGarbler(circuit)
	require.NoError(t, err)

	inputs := garbledcircuit.ParseInputBits([]uint32{100000, 50}, 32)
	gc, err := garbler.Garble(inputs)
	require.NoError(t, err)

	data, err := gc.Serialize()
	require.NoError(t, err)
	assert.NotEmpty(t, data)

	decoded, err := garbledcircuit.Deserialize(data)
	require.NoError(t, err)
	require.NotNil(t, decoded)
	assert.Equal(t, gc.Circuit.NumInputsA, decoded.Circuit.NumInputsA)
	assert.Equal(t, gc.Circuit.NumInputsB, decoded.Circuit.NumInputsB)
	assert.Equal(t, len(gc.GarbledGates), len(decoded.GarbledGates))
}

func TestGarbledCircuitSerializedBase64(t *testing.T) {
	circuit := garbledcircuit.NewLoanEvaluationCircuit()
	garbler, err := garbledcircuit.NewGarbler(circuit)
	require.NoError(t, err)

	gc, err := garbler.Garble(garbledcircuit.ParseInputBits([]uint32{100000, 50}, 32))
	require.NoError(t, err)

	data, err := gc.Serialize()
	require.NoError(t, err)
	encoded := base64.StdEncoding.EncodeToString(data)
	assert.NotEmpty(t, encoded)
}
