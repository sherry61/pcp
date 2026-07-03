from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class RSAKeyGenerateRequest(BaseModel):
    filebase: str = Field('keys', description="密钥存储目录名，默认为'keys'")

class FileEncryptRequest(BaseModel):
    keyfile: bytes = Field(..., description="密钥文件二进制数据")
    filein: bytes = Field(..., description="待加密/解密文件二进制数据")

class PublishRequest(BaseModel):
    rsa_key: bytes = Field(..., description="接收方公钥二进制数据")
    data: bytes = Field(..., description="待加密的原始数据二进制数据")

class SubscribeRequest(BaseModel):
    rsa_key: bytes = Field(..., description="接收方私钥二进制数据")
    pkg: str = Field(..., description="发布包十六进制字符串")

class ReEncryptRequest(BaseModel):
    tee_key: bytes = Field(..., description="TEE私钥二进制数据")
    user_key: bytes = Field(..., description="用户公钥二进制数据")
    pkg: bytes = Field(..., description="原始发布包二进制数据")

# ------------------------------
# 响应模型定义
# ------------------------------
class APIResponse(BaseModel):
    success: bool = Field(..., description="操作是否成功")
    data: Optional[Dict[str, Any]] = Field(None, description="业务数据")
    message: str = Field("", description="提示信息")
    error_code: Optional[str] = Field(None, description="错误代码")

class RSAKeyGenerateResponse(APIResponse):
    data: Optional[Dict[str, str]] = Field(None, description="包含密钥存储路径和公钥的数据")

class FileEncryptResponse(APIResponse):
    data: Optional[Dict[str, str]] = Field(None, description="包含加密/解密后十六进制数据")

class PublishResponse(APIResponse):
    data: Optional[Dict[str, str]] = Field(None, description="包含发布包及相关密钥的十六进制数据")

class SubscribeResponse(APIResponse):
    data: Optional[Dict[str, str]] = Field(None, description="包含解密后原始数据的十六进制数据")

class ReEncryptResponse(APIResponse):
    data: Optional[Dict[str, str]] = Field(None, description="包含重加密后发布包的十六进制数据")