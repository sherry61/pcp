#!/usr/bin/env python3
import io
import json
import os
import zipfile
from pathlib import Path

import torch
import torch.nn as nn
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from safetensors.torch import save


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "testdata" / "fl"
TEE_PUBLIC_KEY_PATH = Path("/home/super/tr/pcp/secrets/pre/tee_public.pem")


class TopModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(4, 1)

    def forward(self, x):
        return self.fc(x)


def build_top_model_bytes() -> bytes:
    model = torch.jit.script(TopModel())
    buffer = io.BytesIO()
    torch.jit.save(model, buffer)
    return buffer.getvalue()


def build_bottom_model_bytes() -> bytes:
    return b"bottom-model-bytes\n"


def load_tee_public_key_bytes() -> bytes:
    return TEE_PUBLIC_KEY_PATH.read_bytes()


def encrypt_package(public_key_bytes: bytes, content: bytes, content_type: str, producer_id: str, task_id: str, batch_index=None):
    public_key = serialization.load_pem_public_key(public_key_bytes)
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
        "iv": io.BytesIO(iv).getvalue().hex(),
        "content_type": content_type,
        "recipient_type": "TEE",
        "recipient_key_id": "tee-key-current",
        "producer_id": producer_id,
        "task_id": task_id,
        "batch_index": batch_index,
    }
    meta["iv"] = __import__("base64").b64encode(iv).decode("ascii")
    return cipher, wrapped_key, json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")


def build_seller_zip(public_key_bytes: bytes, output_path: Path):
    smashed_bytes = save(
        {
            "data": torch.tensor(
                [
                    [0.1, 0.2, 0.3, 0.4],
                    [0.5, 0.6, 0.7, 0.8],
                ],
                dtype=torch.float32,
            )
        }
    )
    label_bytes = save(
        {
            "data": torch.tensor(
                [[0.3], [0.2]],
                dtype=torch.float32,
            )
        }
    )

    smashed_cipher, smashed_wrapped, smashed_meta = encrypt_package(
        public_key_bytes,
        smashed_bytes,
        "safetensors",
        producer_id="sample-seller",
        task_id="SELLER_BATCH_SAMPLE",
        batch_index=0,
    )
    label_cipher, label_wrapped, label_meta = encrypt_package(
        public_key_bytes,
        label_bytes,
        "safetensors",
        producer_id="sample-seller",
        task_id="SELLER_BATCH_SAMPLE",
        batch_index=0,
    )

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("smashed/cipher.bin", smashed_cipher)
        zf.writestr("smashed/wrapped_key.bin", smashed_wrapped)
        zf.writestr("smashed/meta.json", smashed_meta)
        zf.writestr("label/cipher.bin", label_cipher)
        zf.writestr("label/wrapped_key.bin", label_wrapped)
        zf.writestr("label/meta.json", label_meta)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    top_path = OUTPUT_DIR / "top.pt"
    bottom_path = OUTPUT_DIR / "bottom.pt"
    seller_zip_path = OUTPUT_DIR / "seller_fl_batch.zip"
    readme_path = OUTPUT_DIR / "README.md"

    top_path.write_bytes(build_top_model_bytes())
    bottom_path.write_bytes(build_bottom_model_bytes())
    tee_public_key_bytes = load_tee_public_key_bytes()
    build_seller_zip(tee_public_key_bytes, seller_zip_path)

    readme_path.write_text(
        "\n".join(
            [
                "# FL Test Data",
                "",
                "- `top.pt`: minimal TorchScript top model for buyer upload.",
                "- `bottom.pt`: minimal bottom model bytes for buyer upload.",
                "- `seller_fl_batch.zip`: seller batch sample with encrypted `smashed/` and `label/` packages.",
                "",
                "Notes:",
                "- `seller_fl_batch.zip` was encrypted with the current PCP TEE public key from `/home/super/tr/pcp/secrets/pre/tee_public.pem`.",
                "- If the PCP TEE key changes, regenerate this file before testing.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(top_path)
    print(bottom_path)
    print(seller_zip_path)
    print(readme_path)


if __name__ == "__main__":
    main()
