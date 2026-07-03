"""请求和响应模型定义"""
from typing import Dict, Optional
from pydantic import BaseModel, Field

class CryptoSystemRequest(BaseModel):
    system_type: str = Field(..., description="加密系统类型，可选值：'paillier' 或 'elgamal'")
    key_size: int = Field(1024, description="密钥长度，默认为1024位")

class KeyPairResponse(BaseModel):
    instance_id: str = Field(..., description="加密实例ID")
    public_key: Dict[str, str] = Field(..., description="公钥（序列化为字符串）")
    private_key: Dict[str, str] = Field(..., description="私钥（序列化为字符串）")

class EncryptRequest(BaseModel):
    instance_id: str = Field(..., description="加密实例ID")
    plaintext: int = Field(..., description="要加密的明文整数")
    use_public_key: Optional[Dict[str, str]] = Field(None, description="可选的公钥，如果不提供则使用实例的公钥")

class EncryptResponse(BaseModel):
    ciphertext: str = Field(..., description="加密后的密文（序列化为字符串）")

class DecryptRequest(BaseModel):
    instance_id: str = Field(..., description="加密实例ID")
    ciphertext: str = Field(..., description="要解密的密文（序列化为字符串）")
    use_private_key: Optional[Dict[str, str]] = Field(None, description="可选的私钥，如果不提供则使用实例的私钥")

class DecryptResponse(BaseModel):
    plaintext: int = Field(..., description="解密后的明文整数")

class HomomorphicAddRequest(BaseModel):
    instance_id: str = Field(..., description="加密实例ID")
    ciphertext1: str = Field(..., description="第一个密文（序列化为字符串）")
    ciphertext2: str = Field(..., description="第二个密文（序列化为字符串）")

class HomomorphicAddResponse(BaseModel):
    result_ciphertext: str = Field(..., description="加法结果的密文（序列化为字符串）")

class HomomorphicMultiplyRequest(BaseModel):
    instance_id: str = Field(..., description="加密实例ID")
    ciphertext: str = Field(..., description="密文（序列化为字符串）")
    scalar: Optional[int] = Field(None, description="标量（用于Paillier加密）")
    ciphertext2: Optional[str] = Field(None, description="第二个密文（用于ElGamal加密，序列化为字符串）")

class HomomorphicMultiplyResponse(BaseModel):
    result_ciphertext: str = Field(..., description="乘法结果的密文（序列化为字符串）")
