"""同态加密API路由"""
import base64
import pickle
import time
import uuid
from typing import Dict, Tuple

from flask import request, jsonify, current_app, g
from pydantic import ValidationError

from app.service.homomorphic.he_crypto import PaillierCrypto, ElGamalCrypto
from . import he_bp
from .schemas import (
    CryptoSystemRequest, KeyPairResponse, EncryptRequest, EncryptResponse,
    DecryptRequest, DecryptResponse, HomomorphicAddRequest, HomomorphicAddResponse,
    HomomorphicMultiplyRequest, HomomorphicMultiplyResponse
)
from ..util import create_event, add_audit_log

# {instance_id: (crypto_instance, call_count, event_id, last_used_time)}
crypto_instances: Dict[str, Tuple[PaillierCrypto | ElGamalCrypto, int, str, float]] = {}
INSTANCE_EXPIRE_SECONDS = 3600  # 实例过期时间
MAX_INSTANCE_COUNT = 1000  # 实例总数限制


@he_bp.route("/generate_keys", methods=["POST"])
def generate_keys():
    """生成新的密钥对并返回实例ID"""
    try:
        clean_expired_instances_once()
        # 新增：实例数上限判断（防内存溢出）
        if len(crypto_instances) >= MAX_INSTANCE_COUNT:
            return jsonify({"detail": "加密实例已达上限，请稍后再试"}), 429

        # 验证请求数据
        req_data = CryptoSystemRequest(**request.get_json())

        # 创建加密实例
        if req_data.system_type.lower() == "paillier":
            crypto = PaillierCrypto(key_size=req_data.key_size)
        elif req_data.system_type.lower() == "elgamal":
            crypto = ElGamalCrypto(key_size=req_data.key_size)
        else:
            return jsonify({"detail": f"不支持的加密系统类型: {req_data.system_type}"}), 400

        # 生成密钥
        public_key, private_key = crypto.generate_keys()

        # 修复：创建事件
        event_data = {
            "type_id": 0,
            "name": f"HE Instance: {req_data.system_type} 初始化",
            "participants_id": [5, 6]
        }
        event_result = create_event(**event_data)
        if not event_result.get("success", True) or event_result.get("errcode", 0) != 0:
            error_msg = event_result.get("error") or event_result.get("msg", "事件创建失败")
            return jsonify({"detail": f"事件创建失败：{error_msg}"}), 500
        event_id = event_result.get("eventId")

        instance_id = str(uuid.uuid4())
        crypto_instances[instance_id] = (crypto, 0, event_id, time.time())
        
        g.instance_id = instance_id
        g.event_id = event_id
        g.current_call_count = 0

        # 序列化密钥
        serialized_public_key = serialize_dict(public_key)
        serialized_private_key = serialize_dict(private_key)

        return jsonify(KeyPairResponse(
            instance_id=instance_id,
            public_key=serialized_public_key,
            private_key=serialized_private_key
        ).model_dump())

    except ValidationError as e:
        return jsonify({"detail": e.errors()}), 400
    except Exception as e:
        return jsonify({"detail": str(e)}), 400


def get_crypto_instance(instance_id: str):
    """获取加密实例，并刷新最后使用时间"""
    if instance_id not in crypto_instances:
        return None

    crypto, call_count, event_id, _ = crypto_instances[instance_id]
    # 刷新最后使用时间
    crypto_instances[instance_id] = (crypto, call_count, event_id, time.time())
    return crypto, call_count, event_id


@he_bp.route("/encrypt", methods=["POST"])
def encrypt():
    """加密明文"""
    try:
        req_data = EncryptRequest(**request.get_json())
        # 调用新的get_crypto_instance，获取实例+计数+事件ID
        instance_info = get_crypto_instance(req_data.instance_id)
        if not instance_info:
            return jsonify({"detail": f"实例ID '{req_data.instance_id}' 不存在"}), 404
        crypto, call_count, event_id = instance_info

        # 存储到g，供after_request使用
        g.instance_id = req_data.instance_id
        g.event_id = event_id
        g.current_call_count = call_count

        # 原有加密逻辑不变
        public_key = deserialize_dict(req_data.use_public_key) if req_data.use_public_key else None
        ciphertext = crypto.encrypt(req_data.plaintext, public_key)

        return jsonify(EncryptResponse(
            ciphertext=serialize_value(ciphertext)
        ).model_dump())

    except ValidationError as e:
        return jsonify({"detail": e.errors()}), 400
    except Exception as e:
        return jsonify({"detail": str(e)}), 400


@he_bp.route("/decrypt", methods=["POST"])
def decrypt():
    """解密密文"""
    try:
        req_data = DecryptRequest(**request.get_json())
        instance_info = get_crypto_instance(req_data.instance_id)
        if not instance_info:
            return jsonify({"detail": f"实例ID '{req_data.instance_id}' 不存在"}), 404
        crypto, call_count, event_id = instance_info

        g.instance_id = req_data.instance_id
        g.event_id = event_id
        g.current_call_count = call_count

        # 原有解密逻辑不变
        ciphertext = deserialize_value(req_data.ciphertext)
        private_key = deserialize_dict(req_data.use_private_key) if req_data.use_private_key else None
        plaintext = crypto.decrypt(ciphertext, private_key)

        return jsonify(DecryptResponse(plaintext=plaintext).model_dump())

    except ValidationError as e:
        return jsonify({"detail": e.errors()}), 400
    except Exception as e:
        return jsonify({"detail": str(e)}), 400


@he_bp.route("/add", methods=["POST"])
def homomorphic_add():
    """执行同态加法"""
    try:
        req_data = HomomorphicAddRequest(**request.get_json())
        instance_info = get_crypto_instance(req_data.instance_id)
        if not instance_info:
            return jsonify({"detail": f"实例ID '{req_data.instance_id}' 不存在"}), 404
        crypto, call_count, event_id = instance_info

        g.instance_id = req_data.instance_id
        g.event_id = event_id
        g.current_call_count = call_count

        # 原有加法逻辑不变
        if not isinstance(crypto, PaillierCrypto):
            return jsonify({"detail": "同态加法仅支持Paillier加密系统"}), 400
        ciphertext1 = deserialize_value(req_data.ciphertext1)
        ciphertext2 = deserialize_value(req_data.ciphertext2)
        result = crypto.homomorphic_add(ciphertext1, ciphertext2)

        return jsonify(HomomorphicAddResponse(result_ciphertext=serialize_value(result)).model_dump())

    except ValidationError as e:
        return jsonify({"detail": e.errors()}), 400
    except Exception as e:
        return jsonify({"detail": str(e)}), 400


@he_bp.route("/multiply", methods=["POST"])
def homomorphic_multiply():
    """执行同态乘法"""
    try:
        req_data = HomomorphicMultiplyRequest(**request.get_json())
        instance_info = get_crypto_instance(req_data.instance_id)
        if not instance_info:
            return jsonify({"detail": f"实例ID '{req_data.instance_id}' 不存在"}), 404
        crypto, call_count, event_id = instance_info

        g.instance_id = req_data.instance_id
        g.event_id = event_id
        g.current_call_count = call_count

        # 原有乘法逻辑不变
        ciphertext = deserialize_value(req_data.ciphertext)
        if isinstance(crypto, PaillierCrypto):
            if req_data.scalar is None:
                return jsonify({"detail": "Paillier同态乘法需要提供标量"}), 400
            result = crypto.homomorphic_multiply(ciphertext, req_data.scalar)
        elif isinstance(crypto, ElGamalCrypto):
            if req_data.ciphertext2 is None:
                return jsonify({"detail": "ElGamal同态乘法需要提供第二个密文"}), 400
            ciphertext2 = deserialize_value(req_data.ciphertext2)
            result = crypto.homomorphic_multiply(ciphertext, ciphertext2)
        else:
            return jsonify({"detail": "不支持的加密系统类型"}), 400

        return jsonify(HomomorphicMultiplyResponse(result_ciphertext=serialize_value(result)).model_dump())

    except ValidationError as e:
        return jsonify({"detail": e.errors()}), 400
    except Exception as e:
        return jsonify({"detail": str(e)}), 400


@he_bp.route("/health", methods=["GET"])
def health_check():
    """健康检查接口"""
    return jsonify({
        "status": "healthy",
        "instances_count": len(crypto_instances)
    })


@he_bp.after_request
def after_he_requests(response):
    """HE蓝图所有请求后：计数+1，调用日志接口"""
    if not (hasattr(g, "instance_id") and hasattr(g, "event_id") and hasattr(g, "current_call_count")):
        return response

    new_call_count = g.current_call_count + 1
    log_data = {
        "event_id": g.event_id,
        "cur_status": new_call_count,
        "content": f"HE Instance: {g.instance_id} 调用完成，计数：{new_call_count}，响应状态：{response.status_code}"
    }
    log_result = add_audit_log(**log_data)

    if not log_result.get("success", True) or log_result.get("errcode", 0) != 0:
        error_msg = log_result.get("error") or log_result.get("msg", "日志添加失败")
        current_app.logger.error(f"instance_id={g.instance_id} 日志添加失败：{error_msg}")
        response_json = response.get_json() or {}
        response_json["log_error"] = error_msg
        response.data = jsonify(response_json).data

    if g.instance_id in crypto_instances:
        crypto, _, event_id, last_used = crypto_instances[g.instance_id]
        crypto_instances[g.instance_id] = (crypto, new_call_count, event_id, last_used)

    return response


def clean_expired_instances_once():
    """单次清理过期实例（供generate_keys调用）"""
    current_time = time.time()
    expired_ids = [
        instance_id
        for instance_id, (_, _, _, last_used) in crypto_instances.items()
        if current_time - last_used > INSTANCE_EXPIRE_SECONDS
    ]
    for instance_id in expired_ids:
        del crypto_instances[instance_id]


def serialize_value(value):
    return base64.b64encode(pickle.dumps(value)).decode('utf-8')


def deserialize_value(value_str):
    return pickle.loads(base64.b64decode(value_str.encode('utf-8')))


def serialize_dict(d):
    return {k: serialize_value(v) for k, v in d.items()}


def deserialize_dict(d):
    return {k: deserialize_value(v) for k, v in d.items()}
