#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import os
import sys
import zipfile


def _fail(message: str) -> None:
    json.dump({"success": False, "message": message}, sys.stdout, ensure_ascii=False)
    raise SystemExit(1)


def _normalize_entries(archive_bytes: bytes, field_name: str) -> dict[str, bytes]:
    result: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as archive:
            for info in archive.infolist():
                name = str(info.filename or "")
                if not name or name.endswith("/"):
                    continue
                if name.startswith("/") or ".." in name.split("/"):
                    _fail(f"{field_name} 包含非法路径 {name}")
                result[name] = archive.read(name)
    except zipfile.BadZipFile as exc:
        _fail(f"{field_name} 不是有效的 ZIP 压缩包: {exc}")

    if not result:
        _fail(f"{field_name} 不能为空")
    return result


def _build_zip(entries: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, payload in entries.items():
            archive.writestr(name, payload)
    return buffer.getvalue()


def main() -> None:
    pcc_root = os.environ.get("PCC_PRE_ROOT", "/home/super/tr/pcc")
    if pcc_root not in sys.path:
        sys.path.insert(0, pcc_root)

    try:
        from app.crypto.afgh_pre import derive_public_key, encrypt_second_level, generate_rekey
    except Exception as exc:  # noqa: BLE001
        _fail(f"无法加载 PCC PRE 同源实现: {exc}")

    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        _fail(f"请求载荷不是合法 JSON: {exc}")

    transaction_id = str(payload.get("transactionId") or "").strip()
    if not transaction_id:
        _fail("缺少 transactionId")

    buyer_public_key = payload.get("buyerPublicKey")
    if not isinstance(buyer_public_key, dict):
        _fail("缺少 buyerPublicKey")

    source_archive_b64 = str(payload.get("sourceArchiveBase64") or "").strip()
    if not source_archive_b64:
        _fail("缺少 sourceArchiveBase64")

    try:
        source_archive = base64.b64decode(source_archive_b64, validate=True)
    except Exception as exc:  # noqa: BLE001
        _fail(f"sourceArchiveBase64 非法: {exc}")

    source_key_id = f"pre-seller-{transaction_id}"
    source_private_scalar = None
    source_public_key = None
    reencryption_key = None

    try:
        # generate_keypair in afgh_pre returns (private_scalar, public_key), but derive_public_key and generate_rekey are enough.
        import secrets
        from py_ecc import optimized_bn128 as bn

        source_private_scalar = secrets.randbelow(bn.curve_order - 1) + 1
        source_public_key = derive_public_key(source_private_scalar, key_id=source_key_id)
        reencryption_key = generate_rekey(source_private_scalar, buyer_public_key, source_key_id=source_key_id)
    except Exception as exc:  # noqa: BLE001
        _fail(f"PRE 密钥材料生成失败: {exc}")

    plain_entries = _normalize_entries(source_archive, "原始压缩包")
    cipher_entries: dict[str, bytes] = {}
    try:
        for name, payload_bytes in plain_entries.items():
            cipher_entries[name] = encrypt_second_level(payload_bytes, source_public_key)
    except Exception as exc:  # noqa: BLE001
        _fail(f"PRE 源密文构造失败: {exc}")

    source_cipher_zip = _build_zip(cipher_entries)
    json.dump(
        {
            "success": True,
            "sourcePublicKey": source_public_key,
            "reencryptionKey": reencryption_key,
            "sourceCipherZipBase64": base64.b64encode(source_cipher_zip).decode("ascii"),
            "entryCount": len(cipher_entries),
        },
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
