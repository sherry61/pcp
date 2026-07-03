from io import BytesIO
import os
import tempfile

from typing import Any, Dict, Optional
from omegaconf import ValidationError
from flask import request, jsonify, send_file

from .schemas import *
from .core import RSA

from . import pre_bp, util


@pre_bp.route('/rsa/generate', methods=['POST'])
def rsa_generate():
    """生成RSA密钥对，直接返回 key.pub 文件下载（成功返回 send_file，失败返回错误响应）"""
    try:
        # 解析并验证请求参数
        req_data = request.get_json()
        if not req_data:
            return {"success": False, "message": "请求体不能为空", "error_code": "EMPTY_BODY"}, 400
        
        req = RSAKeyGenerateRequest(**req_data)
        # 调用内部函数生成密钥对（返回 pub 字节数据，同时已保存文件）
        pub_raw = RSA.generate_keys_file(req.filebase)
        
        # 成功：返回 send_file
        return send_file(
            BytesIO(pub_raw),
            mimetype='application/pem',
            as_attachment=True,
            download_name=f"{req.filebase}_key.pub"
        )
    
    except ValidationError as e:
        # 失败：返回错误响应（有返回值）
        return {
            "success": False,
            "message": f"请求参数错误: {e.errors()}",
            "error_code": "INVALID_PARAM"
        }, 400
    except Exception as e:
        # 失败：返回错误响应（有返回值）
        return {
            "success": False,
            "message": f"生成失败: {str(e)}",
            "error_code": "RSA_GENERATE_ERROR"
        }, 500

@pre_bp.route('/rsa/encrypt', methods=['POST'])
def rsa_encrypt():
    """RSA加密文件"""
    try:
        # 解析二进制文件
        if 'keyfile' not in request.files or 'filein' not in request.files:
            return jsonify(create_response(
                success=False,
                message="缺少keyfile或filein文件",
                error_code="MISSING_FILE"
            )), 400
        
        keyfile_data = request.files['keyfile'].read()
        filein_data = request.files['filein'].read()
        
        # 验证请求数据
        req = FileEncryptRequest(keyfile=keyfile_data, filein=filein_data)
        
        # 业务逻辑（使用临时文件处理）
        with tempfile.NamedTemporaryFile(delete=False) as kf, \
             tempfile.NamedTemporaryFile(delete=False) as fi, \
             tempfile.NamedTemporaryFile(delete=False) as fo:
            
            kf.write(req.keyfile)
            fi.write(req.filein)
            kf.flush()
            fi.flush()
            
            RSA.encrypt_file(kf.name, fi.name, fo.name)
            
            with open(fo.name, 'rb') as f:
                encrypted_hex = f.read().hex()
        
        # 清理临时文件
        for f in [kf.name, fi.name, fo.name]:
            if os.path.exists(f):
                os.unlink(f)
        
        return jsonify(create_response(
            success=True,
            data={"encrypted_data": encrypted_hex},
            message="RSA加密成功"
        ))
    
    except ValidationError as e:
        return jsonify(create_response(
            success=False,
            message=f"请求参数错误: {e.errors()}",
            error_code="INVALID_PARAM"
        )), 400
    except Exception as e:
        return jsonify(create_response(
            success=False,
            message=f"加密失败: {str(e)}",
            error_code="RSA_ENCRYPT_ERROR"
        )), 500

@pre_bp.route('/rsa/decrypt', methods=['POST'])
def rsa_decrypt():
    """RSA解密文件"""
    try:
        if 'keyfile' not in request.files or 'filein' not in request.files:
            return jsonify(create_response(
                success=False,
                message="缺少keyfile或filein文件",
                error_code="MISSING_FILE"
            )), 400
        
        keyfile_data = request.files['keyfile'].read()
        filein_data = request.files['filein'].read()
        req = FileEncryptRequest(keyfile=keyfile_data, filein=filein_data)
        
        with tempfile.NamedTemporaryFile(delete=False) as kf, \
             tempfile.NamedTemporaryFile(delete=False) as fi, \
             tempfile.NamedTemporaryFile(delete=False) as fo:
            
            kf.write(req.keyfile)
            fi.write(req.filein)
            kf.flush()
            fi.flush()
            
            RSA.decrypt_file(kf.name, fi.name, fo.name)
            
            with open(fo.name, 'rb') as f:
                decrypted_hex = f.read().hex()
        
        for f in [kf.name, fi.name, fo.name]:
            if os.path.exists(f):
                os.unlink(f)
        
        return jsonify(create_response(
            success=True,
            data={"decrypted_data": decrypted_hex},
            message="RSA解密成功"
        ))
    
    except ValidationError as e:
        return jsonify(create_response(
            success=False,
            message=f"请求参数错误: {e.errors()}",
            error_code="INVALID_PARAM"
        )), 400
    except Exception as e:
        return jsonify(create_response(
            success=False,
            message=f"解密失败: {str(e)}",
            error_code="RSA_DECRYPT_ERROR"
        )), 500

@pre_bp.route('/publish', methods=['POST'])
def publish():
    """生成加密发布包"""
    try:
        if 'rsa_key' not in request.files or 'data' not in request.files:
            return jsonify(create_response(
                success=False,
                message="缺少rsa_key或data文件",
                error_code="MISSING_FILE"
            )), 400
        
        rsa_key_data = request.files['rsa_key'].read()
        data = request.files['data'].read()
        req = PublishRequest(rsa_key=rsa_key_data, data=data)
        
        publish_pkg, aes_key, hmac_key, cipher_text, hash_val = util.publish(
            req.rsa_key, req.data
        )
        
        return jsonify(create_response(
            success=True,
            data={
                "publish_pkg": publish_pkg.hex(),
                "aes_key": aes_key.hex(),
                "hmac_key": hmac_key.hex(),
                "cipher_text": cipher_text.hex(),
                "hash": hash_val.hex()
            },
            message="发布包生成成功"
        ))
    
    except ValidationError as e:
        return jsonify(create_response(
            success=False,
            message=f"请求参数错误: {e.errors()}",
            error_code="INVALID_PARAM"
        )), 400
    except Exception as e:
        return jsonify(create_response(
            success=False,
            message=f"发布失败: {str(e)}",
            error_code="PUBLISH_ERROR"
        )), 500

@pre_bp.route('/subscribe', methods=['POST'])
def subscribe():
    """解密发布包获取原始数据"""
    try:
        req_data = request.get_json()
        req = SubscribeRequest(** req_data)
        
        # 转换十六进制发布包为二进制
        try:
            pkg_bytes = bytes.fromhex(req.pkg)
        except ValueError:
            return jsonify(create_response(
                success=False,
                message="pkg不是有效的十六进制字符串",
                error_code="INVALID_HEX"
            )), 400
        
        msg = util.subscribe(req.rsa_key, pkg_bytes)
        
        return jsonify(create_response(
            success=True,
            data={"original_data": msg.hex()},
            message="发布包解密成功"
        ))
    
    except ValidationError as e:
        return jsonify(create_response(
            success=False,
            message=f"请求参数错误: {e.errors()}",
            error_code="INVALID_PARAM"
        )), 400
    except ValueError as e:
        return jsonify(create_response(
            success=False,
            message=f"验证失败: {str(e)}",
            error_code="VERIFY_ERROR"
        )), 400
    except Exception as e:
        return jsonify(create_response(
            success=False,
            message=f"订阅失败: {str(e)}",
            error_code="SUBSCRIBE_ERROR"
        )), 500

@pre_bp.route('/re-encrypt', methods=['POST'])
def re_encrypt():
    """重加密发布包"""
    try:
        if 'tee_key' not in request.files or 'user_key' not in request.files or 'pkg' not in request.files:
            return jsonify(create_response(
                success=False,
                message="缺少tee_key、user_key或pkg文件",
                error_code="MISSING_FILE"
            )), 400
        
        tee_key_data = request.files['tee_key'].read()
        user_key_data = request.files['user_key'].read()
        pkg_data = request.files['pkg'].read()
        req = ReEncryptRequest(
            tee_key=tee_key_data,
            user_key=user_key_data,
            pkg=pkg_data
        )
        
        reenc_pkg = util.re_encrypt(req.tee_key, req.user_key, req.pkg)
        
        return jsonify(create_response(
            success=True,
            data={"reenc_pkg": reenc_pkg.hex()},
            message="重加密成功"
        ))
    
    except ValidationError as e:
        return jsonify(create_response(
            success=False,
            message=f"请求参数错误: {e.errors()}",
            error_code="INVALID_PARAM"
        )), 400
    except Exception as e:
        return jsonify(create_response(
            success=False,
            message=f"重加密失败: {str(e)}",
            error_code="RE_ENCRYPT_ERROR"
        )), 500


def create_response(
    success: bool,
    data: Optional[Dict[str, Any]] = None,
    message: str = "",
    error_code: Optional[str] = None
    ) -> Dict[str, Any]:
    """创建标准化响应字典"""
    return APIResponse(
        success=success,
        data=data,
        message=message,
        error_code=error_code
    ).dict()