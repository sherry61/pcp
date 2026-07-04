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


def _normalize_entries(archive_bytes: bytes) -> dict[str, bytes]:
    result: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as archive:
            for info in archive.infolist():
                name = str(info.filename or "")
                if not name or name.endswith("/"):
                    continue
                if name.startswith("/") or ".." in name.split("/"):
                    _fail(f"PRE 结果 ZIP 包含非法路径 {name}")
                result[name] = archive.read(name)
    except zipfile.BadZipFile as exc:
        _fail(f"PRE 结果 ZIP 非法: {exc}")

    if not result:
        _fail("PRE 结果 ZIP 不能为空")
    return result


def _build_plain_zip(entries: dict[str, bytes]) -> bytes:
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
        from app.crypto.afgh_pre import decrypt_first_level  # pylint: disable=import-error
    except Exception as exc:  # noqa: BLE001
        _fail(f"无法加载 PCC PRE 同源实现: {exc}")

    try:
        payload = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        _fail(f"请求载荷不是合法 JSON: {exc}")

    private_scalar_hex = str(payload.get("privateScalarHex") or "").replace("0x", "").strip()
    if not private_scalar_hex:
        _fail("缺少 privateScalarHex")

    encrypted_zip_b64 = str(payload.get("encryptedZipBase64") or "").strip()
    if not encrypted_zip_b64:
        _fail("缺少 encryptedZipBase64")

    try:
        private_scalar = int(private_scalar_hex, 16)
    except ValueError as exc:
        _fail(f"privateScalarHex 非法: {exc}")

    try:
        encrypted_zip = base64.b64decode(encrypted_zip_b64, validate=True)
    except Exception as exc:  # noqa: BLE001
        _fail(f"encryptedZipBase64 非法: {exc}")

    encrypted_entries = _normalize_entries(encrypted_zip)
    plain_entries: dict[str, bytes] = {}
    try:
        for name, ciphertext in encrypted_entries.items():
            plain_entries[name] = decrypt_first_level(ciphertext, private_scalar)
    except Exception as exc:  # noqa: BLE001
        _fail(f"PRE 同源解密失败: {exc}")

    plain_zip = _build_plain_zip(plain_entries)
    json.dump(
        {
            "success": True,
            "zipBase64": base64.b64encode(plain_zip).decode("ascii"),
            "entryCount": len(plain_entries),
        },
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
