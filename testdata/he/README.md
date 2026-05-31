Paillier test fixtures for HE submit flow.

Files:
- `paillier-file1.csv`
- `paillier-file2.csv`
- `paillier-public-key.json`

These ciphertexts were generated under the fixed Paillier public key:
- `n = 143`
- `g = 144`

Important:
- These CSV files are only compatible with this exact public key.
- If the buyer page uploads a randomly generated Paillier public key, these files will not match it.
