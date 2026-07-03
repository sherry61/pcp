import os
import yaml
import requests
import json
import threading
from flask import request, jsonify
from . import task_bp
from .store import create_task, get_task, update_task, list_tasks

def _mpc_base():
    config_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'config.yml')
    with open(config_path) as f:
        cfg = yaml.safe_load(f)
    return cfg.get('mpc', {}).get('base_url', 'http://localhost:28091/api/v1')

def _ok(data):
    return jsonify({"code": 0, "message": "ok", "data": data})

def _err(code, msg):
    return jsonify({"code": code, "message": msg, "data": None}), 400

def _post_json(url, payload, action, timeout=30):
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        body = resp.json()
    except Exception as e:
        raise RuntimeError(f"{action}请求失败: {e}")

    if resp.status_code >= 400:
        raise RuntimeError(f"{action}HTTP失败: status={resp.status_code}, body={body}")

    if isinstance(body, dict) and body.get("code", 0) != 0:
        raise RuntimeError(f"{action}业务失败: {body.get('message') or body}")

    return body

def _response_data(body):
    if isinstance(body, dict) and isinstance(body.get("data"), dict):
        return body["data"]
    return body if isinstance(body, dict) else {}


def _run_task_async(task_id, task_type, task_snapshot, base, params):
    try:
        if task_type == 'gc':
            _run_gc(task_id, task_snapshot, base, params)
        else:
            _run_vfl(task_id, task_snapshot, base, params)
    except Exception as e:
        update_task(task_id, status='failed', result={"error": str(e)})

def _build_gc_authorization(base, task_id, buyer_id, seller_fields, params):
    user_id = seller_fields.get("user_id")
    if not user_id:
        raise ValueError("GC卖方数据必须包含 user_id")

    data_tags = (
        params.get("data_tags")
        or params.get("requested_tags")
        or seller_fields.get("requested_tags")
        or ["income", "credit_score"]
    )
    if not isinstance(data_tags, list) or not data_tags:
        raise ValueError("GC授权 data_tags/requested_tags 必须是非空数组")

    payload = {
        "request_id": f"auth_{task_id}",
        "user_id": user_id,
        "data_tags": data_tags,
        "purpose": params.get("purpose", "gc_task_evaluation"),
        "validity_period": int(params.get("validity_period", 86400)),
        "authorized_party": params.get("authorized_party", buyer_id),
    }
    auth_resp = _post_json(f"{base}/users/request-authorization", payload, "GC授权生成")
    auth_data = _response_data(auth_resp)

    auth_ciphertext = auth_data.get("auth_ciphertext")
    auth_hash = auth_data.get("auth_hash")
    if not auth_ciphertext or not auth_hash:
        raise RuntimeError("GC授权生成成功但未返回 auth_ciphertext/auth_hash")

    return auth_ciphertext, auth_hash, auth_data


@task_bp.route('/task/create', methods=['POST'])
def task_create():
    body = request.get_json() or {}
    task_name = body.get('task_name', '')
    task_type = body.get('task_type')
    buyer_id = body.get('buyer_id')
    compute_params = body.get('compute_params', {})
    has_buyer_data = bool(body.get('has_buyer_data', False))

    if task_type not in ('gc', 'vfl'):
        return _err(1001, 'task_type must be gc or vfl')
    if not buyer_id:
        return _err(1001, 'buyer_id required')

    task_id = create_task(task_name, task_type, buyer_id, compute_params, has_buyer_data)
    return _ok({"task_id": task_id, "status": "pending"})


@task_bp.route('/task/<task_id>/data', methods=['POST'])
def task_upload_data(task_id):
    task = get_task(task_id)
    if not task:
        return _err(1002, 'task not found')

    role = request.form.get('role')
    party_id = request.form.get('party_id')
    if role not in ('buyer', 'seller'):
        return _err(1001, 'role must be buyer or seller')

    file = request.files.get('file')
    file_bytes = file.read() if file else None

    if role == 'buyer':
        update_task(task_id, buyer_data=file_bytes, buyer_data_ready=True)
    else:
        update_task(task_id, seller_data=file_bytes, seller_data_ready=True)

    # 更新状态
    t = get_task(task_id)
    if t['buyer_data_ready'] and t['seller_data_ready']:
        update_task(task_id, status='ready')
    elif t['buyer_data_ready']:
        update_task(task_id, status='waiting_seller_data')
    else:
        update_task(task_id, status='waiting_buyer_data')

    return _ok({"status": "data_received"})


@task_bp.route('/task/<task_id>/start', methods=['POST'])
def task_start(task_id):
    task = get_task(task_id)
    if not task:
        return _err(1002, 'task not found')
    if not (task['buyer_data_ready'] and task['seller_data_ready']):
        return _err(1004, 'data not ready')
    if task['status'] not in ('pending', 'ready', 'waiting_seller_data'):
        return _err(1004, f"cannot start task in status {task['status']}")

    update_task(task_id, status='computing')
    base = _mpc_base()
    params = task['compute_params']
    task_snapshot = dict(get_task(task_id) or task)
    worker = threading.Thread(
        target=_run_task_async,
        args=(task_id, task['task_type'], task_snapshot, base, params),
        daemon=True,
    )
    worker.start()

    return _ok({"status": "computing"})


def _run_gc(task_id, task, base, params):
    buyer_id = task['buyer_id']

    # 1. 生成混淆电路
    gc_resp = _post_json(f"{base}/bank/gc/generate-task", {
        "task_id": task_id,
        "bank_id": buyer_id,
        "threshold": params.get('threshold', 0),
        "risk_factor": params.get('risk_factor', 0),
    }, "GC任务生成")

    gc_data = _response_data(gc_resp)
    garbled_circuit = gc_data.get('garbled_circuit')
    num_gates = gc_data.get('num_gates', 0)
    if not garbled_circuit:
        raise RuntimeError("GC任务生成成功但未返回 garbled_circuit")
    update_task(task_id, gc_context={"garbled_circuit": garbled_circuit, "num_gates": num_gates})

    # 2. 评估混淆电路（卖方数据）
    seller_data = task.get('seller_data') or b''
    # seller_data 期望是 JSON bytes：{"user_id":..,"income":..,"credit_score":..}
    try:
        seller_fields = json.loads(seller_data)
    except Exception:
        seller_fields = {}

    for field in ("user_id", "income", "credit_score"):
        if field not in seller_fields:
            raise ValueError(f"GC卖方数据必须包含 {field}")

    auth_ciphertext, auth_hash, auth_data = _build_gc_authorization(
        base, task_id, buyer_id, seller_fields, params
    )

    eval_payload = {
        "task_id": task_id,
        "datacenter_id": seller_fields.get("datacenter_id", params.get("datacenter_id", "DC001")),
        "garbled_circuit": garbled_circuit,
        "auth_ciphertext": auth_ciphertext,
        "auth_hash": auth_hash,
    }
    eval_payload.update(seller_fields)
    eval_resp = _post_json(f"{base}/datacenter/gc/evaluate", eval_payload, "GC电路评估")
    eval_data = _response_data(eval_resp)
    output_value = eval_data.get('output_value')
    commitment = eval_data.get('input_commitment_hash')

    # 3. 链上审计
    audit_resp = _post_json(f"{base}/audit/gc/verify-execution", {
        "task_id": task_id,
        "num_gates": num_gates,
    }, "GC执行验证")
    audit_data = _response_data(audit_resp)

    update_task(task_id, status='done', result={
        "task_type": "gc",
        "output_value": output_value,
        "input_commitment_hash": commitment,
        "auth_hash": auth_hash,
        "auth_transaction_id": auth_data.get("transaction_id"),
        "audit_id": audit_data.get('audit_id'),
        "transaction_id": audit_data.get('transaction_id'),
        "verified": audit_data.get('verified', False),
    })


def _run_vfl(task_id, task, base, params):
    import json
    buyer_id = task['buyer_id']

    buyer_raw = task.get('buyer_data') or b''
    seller_raw = task.get('seller_data') or b''
    try:
        buyer_dataset = json.loads(buyer_raw)
    except Exception:
        buyer_dataset = {"party_id": buyer_id, "features": [], "labels": []}
    try:
        seller_dataset = json.loads(seller_raw)
    except Exception:
        seller_dataset = {"party_id": "DC001", "features": []}

    train_resp = requests.post(f"{base}/vfl/train", json={
        "task_id": task_id,
        "model_id": params.get('model_id', 'risk_lr_v1'),
        "participants": [buyer_id, seller_dataset.get('party_id', 'DC001')],
        "epochs": params.get('epochs', 4),
        "learning_rate": params.get('learning_rate', 0.05),
        "datasets": [buyer_dataset, seller_dataset],
    }, timeout=120).json()
    train_data = train_resp.get('data', train_resp)

    verify_resp = requests.post(f"{base}/vfl/verify", json={
        "task_id": task_id,
    }, timeout=30).json()
    verify_data = verify_resp.get('data', verify_resp)

    update_task(task_id, status='done', result={
        "task_type": "vfl",
        "accuracy": train_data.get('accuracy'),
        "final_loss": train_data.get('final_loss'),
        "model_hash": train_data.get('model_hash'),
        "proof_root": train_data.get('proof_root'),
        "transaction_id": verify_data.get('transaction_id'),
        "verified": verify_data.get('verified', False),
        "weights": train_data.get('weights'),
    })


@task_bp.route('/task/<task_id>/status', methods=['GET'])
def task_status(task_id):
    task = get_task(task_id)
    if not task:
        return _err(1002, 'task not found')
    return _ok({
        "task_id": task_id,
        "task_type": task['task_type'],
        "status": task['status'],
        "buyer_data_ready": task['buyer_data_ready'],
        "seller_data_ready": task['seller_data_ready'],
        "created_at": task['created_at'],
    })


@task_bp.route('/task/<task_id>/result', methods=['GET'])
def task_result(task_id):
    task = get_task(task_id)
    if not task:
        return _err(1002, 'task not found')
    if task['status'] != 'done':
        return _err(1004, f"task not done, current status: {task['status']}")
    return _ok(task['result'])


@task_bp.route('/task/list', methods=['GET'])
def task_list():
    role = request.args.get('role')
    party_id = request.args.get('party_id')
    status = request.args.get('status')
    tasks = list_tasks(role=role, party_id=party_id, status=status)
    return _ok({"tasks": [{
        "task_id": t['task_id'],
        "task_name": t['task_name'],
        "task_type": t['task_type'],
        "buyer_id": t['buyer_id'],
        "status": t['status'],
        "created_at": t['created_at'],
    } for t in tasks]})
