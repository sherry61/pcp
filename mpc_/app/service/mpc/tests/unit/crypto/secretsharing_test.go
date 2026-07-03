package crypto

import (
	"math/big"
	"testing"

	"blockchain_data_auth/crypto/secretsharing"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestShamirSplitAndRecover(t *testing.T) {
	ss, err := secretsharing.NewDefaultShamirSecretSharing()
	require.NoError(t, err)

	secret := big.NewInt(123456789)
	shares, err := ss.Split(secret, 3, 5)
	require.NoError(t, err)
	require.Len(t, shares, 5)

	recovered, err := ss.Recover(shares[:3])
	require.NoError(t, err)
	assert.Equal(t, 0, secret.Cmp(recovered))
}

func TestShamirEncodeDecode(t *testing.T) {
	ss, err := secretsharing.NewDefaultShamirSecretSharing()
	require.NoError(t, err)

	shares, err := ss.Split(big.NewInt(42), 2, 3)
	require.NoError(t, err)

	encoded, err := ss.EncodeShares(shares)
	require.NoError(t, err)

	decoded, err := ss.DecodeShares(encoded)
	require.NoError(t, err)
	assert.Len(t, decoded, len(shares))
	assert.Equal(t, shares[0].ID, decoded[0].ID)
}
