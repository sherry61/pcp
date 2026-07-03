import os
import struct
import io
from typing import Tuple, List

from .core import AES, RSA


# 获取项目根目录（根据实际结构调整，这里假设util.py在app目录下）
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
# 密钥目录路径
KEYS_DIR = os.path.join(PROJECT_ROOT, "keys")
# 确保目录存在
os.makedirs(KEYS_DIR, exist_ok=True)


def package(*b: bytes) -> bytes:
    """将多个二进制数据打包为一个字节流"""
    bio = io.BytesIO()
    # 写入数据块数量
    bio.write(struct.pack('<Q', len(b)))
    # 写入每个数据块的长度
    for e in b:
        bio.write(struct.pack('<Q', len(e)))
    # 写入实际数据
    for e in b:
        bio.write(e)
    ret = bio.getvalue()
    bio.close()
    return ret


def unpackage(pkg: bytes) -> List[bytes]:
    """将打包的字节流解包为多个二进制数据块"""
    if len(pkg) < 8:
        raise ValueError("无效的数据包格式：长度不足")
    
    # 解析数据块数量
    sz = struct.unpack('<Q', pkg[:8])[0]
    p_len = 8  # 长度信息起始位置
    p_data = 8 * (sz + 1)  # 实际数据起始位置
    
    if p_data > len(pkg):
        raise ValueError("无效的数据包格式：数据不完整")
    
    ret = []
    for _ in range(sz):
        # 解析单个数据块长度
        if p_len + 8 > len(pkg):
            raise ValueError("无效的数据包格式：长度信息不完整")
        bytes_len = struct.unpack('<Q', pkg[p_len: p_len + 8])[0]
        p_len += 8
        
        # 提取数据块
        if p_data + bytes_len > len(pkg):
            raise ValueError("无效的数据包格式：数据块不完整")
        ret.append(pkg[p_data: p_data + bytes_len])
        p_data += bytes_len
    
    return ret


def publish(pkey: bytes, msg: bytes) -> Tuple[bytes, bytes, bytes, bytes, bytes]:
    """
    生成加密发布包
    :param pkey: 接收方公钥（二进制）
    :param msg: 待加密的原始数据（二进制）
    :return: 发布包、AES密钥、HMAC密钥、密文、哈希值
    """
    # 生成AES和HMAC密钥
    aes_key, hmac_key = AES.generate_key()
    
    # 加密数据
    cipher_text = AES.encrypt(aes_key, msg)
    
    # 计算数据哈希
    hash_val = AES.digest(hmac_key, msg)
    
    # 用RSA公钥加密密钥
    enc_aes_key = RSA.encrypt(pkey, aes_key)
    enc_hmac_key = RSA.encrypt(pkey, hmac_key)
    
    # 打包发布包
    publish_pkg = package(enc_aes_key, enc_hmac_key, hash_val, cipher_text)
    
    return publish_pkg, aes_key, hmac_key, cipher_text, hash_val


def subscribe(key: bytes, pkg: bytes) -> bytes:
    """
    解密发布包获取原始数据
    :param key: 接收方私钥（二进制）
    :param pkg: 发布包（二进制）
    :return: 解密后的原始数据
    """
    # 解包
    try:
        enc_aes_key, enc_hmac_key, hash_val, cipher_text = tuple(unpackage(pkg))
    except ValueError as e:
        raise ValueError(f"解包失败：{str(e)}")
    
    # 解密密钥
    try:
        aes_key = RSA.decrypt(key, enc_aes_key)
        hmac_key = RSA.decrypt(key, enc_hmac_key)
    except Exception as e:
        raise ValueError(f"密钥解密失败：{str(e)}")
    
    # 解密数据
    msg = AES.decrypt(aes_key, cipher_text)
    
    # 验证哈希
    try:
        AES.verify(hmac_key, hash_val, msg)
    except Exception as e:
        raise ValueError(f"数据验证失败：{str(e)}")
    
    return msg


def re_encrypt(key_tee: bytes, key_user: bytes, pkg: bytes) -> bytes:
    """
    重加密发布包
    :param key_tee: TEE私钥（二进制）
    :param key_user: 用户公钥（二进制）
    :param pkg: 原始发布包（二进制）
    :return: 重加密后的发布包
    """
    # 解包原始发布包
    enc_aes_key, enc_hmac_key, hash_val, cipher_text = tuple(unpackage(pkg))
    
    # TEE解密 -> 用用户公钥重新加密
    try:
        decrypted_aes_key = RSA.decrypt(key_tee, enc_aes_key)
        decrypted_hmac_key = RSA.decrypt(key_tee, enc_hmac_key)
    except Exception as e:
        raise ValueError(f"TEE解密失败：{str(e)}")
    
    reenc_aes_key = RSA.encrypt(key_user, decrypted_aes_key)
    reenc_hmac_key = RSA.encrypt(key_user, decrypted_hmac_key)
    
    # 重新打包
    return package(reenc_aes_key, reenc_hmac_key, hash_val, cipher_text)