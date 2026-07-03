import uuid
from datetime import datetime

# 内存存储：task_id -> task dict
_tasks = {}

def create_task(task_name, task_type, buyer_id, compute_params, has_buyer_data):
    task_id = str(uuid.uuid4())[:12]
    _tasks[task_id] = {
        "task_id": task_id,
        "task_name": task_name,
        "task_type": task_type,
        "buyer_id": buyer_id,
        "compute_params": compute_params,
        "has_buyer_data": has_buyer_data,
        "status": "pending",
        "buyer_data_ready": not has_buyer_data,  # 无数据时视为就绪
        "seller_data_ready": False,
        "buyer_data": None,
        "seller_data": None,
        "result": None,
        "gc_context": None,  # 存储 garbled_circuit 等 GC 中间状态
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    return task_id

def get_task(task_id):
    return _tasks.get(task_id)

def update_task(task_id, **kwargs):
    if task_id in _tasks:
        _tasks[task_id].update(kwargs)

def list_tasks(role=None, party_id=None, status=None):
    tasks = list(_tasks.values())
    if role == "buyer" and party_id:
        tasks = [t for t in tasks if t["buyer_id"] == party_id]
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    return tasks
