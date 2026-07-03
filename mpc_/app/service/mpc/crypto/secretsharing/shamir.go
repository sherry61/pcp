package secretsharing

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
)

type Share struct {
	ID    int      `json:"id"`
	Value *big.Int `json:"value"`
}

type ShamirSecretSharing struct {
	Prime *big.Int
}

func NewShamirSecretSharing(prime *big.Int) (*ShamirSecretSharing, error) {
	if prime == nil || prime.Sign() <= 0 {
		return nil, fmt.Errorf("invalid prime")
	}
	return &ShamirSecretSharing{Prime: new(big.Int).Set(prime)}, nil
}

func NewDefaultShamirSecretSharing() (*ShamirSecretSharing, error) {
	prime, err := rand.Prime(rand.Reader, 256)
	if err != nil {
		return nil, err
	}
	return NewShamirSecretSharing(prime)
}

func (s *ShamirSecretSharing) Split(secret *big.Int, threshold, shares int) ([]Share, error) {
	if secret == nil {
		return nil, fmt.Errorf("secret is nil")
	}
	if threshold < 2 {
		return nil, fmt.Errorf("threshold must be at least 2")
	}
	if shares < threshold {
		return nil, fmt.Errorf("shares must be >= threshold")
	}

	coeffs := make([]*big.Int, threshold)
	coeffs[0] = new(big.Int).Mod(new(big.Int).Set(secret), s.Prime)
	for i := 1; i < threshold; i++ {
		randCoeff, err := rand.Int(rand.Reader, s.Prime)
		if err != nil {
			return nil, err
		}
		coeffs[i] = randCoeff
	}

	result := make([]Share, shares)
	for i := 1; i <= shares; i++ {
		x := big.NewInt(int64(i))
		y := evaluatePolynomial(coeffs, x, s.Prime)
		result[i-1] = Share{ID: i, Value: y}
	}

	return result, nil
}

func (s *ShamirSecretSharing) Recover(shares []Share) (*big.Int, error) {
	if len(shares) == 0 {
		return nil, fmt.Errorf("no shares provided")
	}

	secret := big.NewInt(0)
	for i, si := range shares {
		num := big.NewInt(1)
		den := big.NewInt(1)
		xi := big.NewInt(int64(si.ID))

		for j, sj := range shares {
			if i == j {
				continue
			}
			xj := big.NewInt(int64(sj.ID))
			num.Mul(num, new(big.Int).Neg(xj))
			num.Mod(num, s.Prime)

			diff := new(big.Int).Sub(xi, xj)
			den.Mul(den, diff)
			den.Mod(den, s.Prime)
		}

		inv := new(big.Int).ModInverse(den, s.Prime)
		if inv == nil {
			return nil, fmt.Errorf("failed to invert denominator")
		}

		term := new(big.Int).Mul(si.Value, num)
		term.Mul(term, inv)
		term.Mod(term, s.Prime)
		secret.Add(secret, term)
		secret.Mod(secret, s.Prime)
	}

	return secret, nil
}

func (s *ShamirSecretSharing) EncodeShares(shares []Share) ([]byte, error) {
	payload := make([]map[string]string, 0, len(shares))
	for _, sh := range shares {
		payload = append(payload, map[string]string{
			"id":    fmt.Sprintf("%d", sh.ID),
			"value": sh.Value.String(),
		})
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return []byte(base64.StdEncoding.EncodeToString(raw)), nil
}

func evaluatePolynomial(coeffs []*big.Int, x, prime *big.Int) *big.Int {
	result := big.NewInt(0)
	power := big.NewInt(1)
	for _, coeff := range coeffs {
		term := new(big.Int).Mul(coeff, power)
		result.Add(result, term)
		result.Mod(result, prime)
		power.Mul(power, x)
		power.Mod(power, prime)
	}
	return result
}

func (s *ShamirSecretSharing) DecodeShares(encoded []byte) ([]Share, error) {
	raw, err := base64.StdEncoding.DecodeString(string(encoded))
	if err != nil {
		return nil, err
	}
	var payload []map[string]string
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	shares := make([]Share, 0, len(payload))
	for _, item := range payload {
		id := new(big.Int)
		value := new(big.Int)
		if _, ok := id.SetString(item["id"], 10); !ok {
			return nil, fmt.Errorf("invalid share id")
		}
		if _, ok := value.SetString(item["value"], 10); !ok {
			return nil, fmt.Errorf("invalid share value")
		}
		shares = append(shares, Share{ID: int(id.Int64()), Value: value})
	}
	return shares, nil
}
