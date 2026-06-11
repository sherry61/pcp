#!/usr/bin/env python3
import base64
import io
import json
import os
from pathlib import Path

import torch
import torch.nn as nn
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


OUT = Path("/home/super/fqh/testdata/fl/generated200")
TEE_PUBLIC = Path("/home/super/tr/pcp/secrets/pre/tee_public.pem")


class TopModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(4, 1)

    def forward(self, x):
        return self.fc(x)


def encrypt_for_tee(public_key, content: bytes, content_type: str, task_id: str):
    aes_key = AESGCM.generate_key(bit_length=256)
    iv = os.urandom(12)
    cipher = AESGCM(aes_key).encrypt(iv, content, None)
    wrapped_key = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    meta = {
        "version": 1,
        "payload_alg": "AES-256-GCM",
        "wrapped_key_alg": "RSA-OAEP-SHA256",
        "iv": base64.b64encode(iv).decode("ascii"),
        "content_type": content_type,
        "recipient_type": "TEE",
        "recipient_key_id": "tee-key-current",
        "producer_id": "backend-self-test",
        "task_id": task_id,
        "batch_index": None,
    }
    return cipher, wrapped_key, json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")


def write_triplet(prefix: str, content: bytes, content_type: str):
    public_key = serialization.load_pem_public_key(TEE_PUBLIC.read_bytes())
    cipher, wrapped_key, meta = encrypt_for_tee(public_key, content, content_type, "CONTRACT-200")
    (OUT / f"{prefix}.cipher.bin").write_bytes(cipher)
    (OUT / f"{prefix}.wrapped_key.bin").write_bytes(wrapped_key)
    (OUT / f"{prefix}.meta.json").write_bytes(meta)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    buffer = io.BytesIO()
    torch.jit.save(torch.jit.script(TopModel()), buffer)
    write_triplet("top_model", buffer.getvalue(), "torchscript")
    write_triplet("bottom_model", b"bottom-model-bytes\n", "model-bytes")

    for role in ("buyer", "seller"):
      key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
      public_key = key.public_key().public_bytes(
          encoding=serialization.Encoding.PEM,
          format=serialization.PublicFormat.SubjectPublicKeyInfo,
      )
      (OUT / f"{role}_public.hex").write_text(public_key.hex(), encoding="utf-8")

    print(OUT)


if __name__ == "__main__":
    main()
