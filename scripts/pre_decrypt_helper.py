#!/usr/bin/env python3
from __future__ import annotations

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

    encrypted_zip_path = str(payload.get("encryptedZipPath") or "").strip()
    plain_zip_path = str(payload.get("plainZipPath") or "").strip()
    if not encrypted_zip_path or not plain_zip_path:
        _fail("缺少 PRE 临时文件路径")

    try:
        private_scalar = int(private_scalar_hex, 16)
    except ValueError as exc:
        _fail(f"privateScalarHex 非法: {exc}")

    try:
        with open(encrypted_zip_path, "rb") as encrypted_file:
            encrypted_zip = encrypted_file.read()
    except Exception as exc:  # noqa: BLE001
        _fail(f"无法读取 PRE 加密压缩包: {exc}")

    encrypted_entries = _normalize_entries(encrypted_zip)
    plain_entries: dict[str, bytes] = {}
    try:
        for name, ciphertext in encrypted_entries.items():
            plain_entries[name] = decrypt_first_level(ciphertext, private_scalar)
    except Exception as exc:  # noqa: BLE001
        _fail(f"PRE 同源解密失败: {exc}")

    plain_zip = _build_plain_zip(plain_entries)
    try:
        with open(plain_zip_path, "wb") as output_file:
            output_file.write(plain_zip)
    except Exception as exc:  # noqa: BLE001
        _fail(f"无法写入 PRE 解密压缩包: {exc}")

    json.dump(
        {
            "success": True,
            "entryCount": len(plain_entries),
        },
        sys.stdout,
        ensure_ascii=False,
    )


if __name__ == "__main__":
    main()
