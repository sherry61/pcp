#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import os
import sys
import zipfile


def main() -> None:
    pcc_root = "/home/super/tr/pcc"
    if pcc_root not in sys.path:
        sys.path.insert(0, pcc_root)

    from app.crypto.afgh_pre import (  # pylint: disable=import-error
        derive_public_key,
        decrypt_first_level,
        encrypt_second_level,
        generate_rekey,
        reencrypt,
    )

    alice_private_scalar = 123456789
    bob_private_scalar = 987654321
    plaintext = b"delivery-pre-ciphertext"

    alice_public_key = derive_public_key(alice_private_scalar, key_id="alice")
    bob_public_key = derive_public_key(bob_private_scalar, key_id="bob")
    source_ciphertext = encrypt_second_level(
        plaintext,
        alice_public_key,
        scalar=456789123,
        nonce=b"\x02" * 12,
    )
    rekey = generate_rekey(alice_private_scalar, bob_public_key, source_key_id="alice")
    first_level_ciphertext = reencrypt(
        source_ciphertext,
        rekey,
        alice_public_key,
        bob_public_key,
    )

    # Assert PCC self-consistency before exporting the vector.
    decrypted = decrypt_first_level(first_level_ciphertext, bob_private_scalar)
    if decrypted != plaintext:
        raise SystemExit("PCC vector self-check failed")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as archive:
        archive.writestr("nested/cipher.bin", first_level_ciphertext)

    payload = {
        "transactionId": "PRE_INTEROP_VECTOR",
        "plaintext_utf8": plaintext.decode("utf-8"),
        "buyer_private_key_file": {
            "algorithm": "AFGH_PRE",
            "transactionId": "PRE_INTEROP_VECTOR",
            "keyType": "private",
            "scheme": "AFGH_PRE",
            "curve": "bn254",
            "keyId": "bob",
            "exportedAt": "2026-07-03T00:00:00Z",
            "privateScalarHex": format(bob_private_scalar, "x"),
            "publicKey": bob_public_key,
        },
        "first_level_zip_base64": base64.b64encode(zip_buffer.getvalue()).decode("ascii"),
        "first_level_ciphertext_base64": base64.b64encode(first_level_ciphertext).decode("ascii"),
        "source_ciphertext_base64": base64.b64encode(source_ciphertext).decode("ascii"),
        "rekey": rekey,
        "alice_public_key": alice_public_key,
        "bob_public_key": bob_public_key,
    }
    json.dump(payload, sys.stdout, ensure_ascii=False, sort_keys=True)


if __name__ == "__main__":
    main()
