import os
import yaml
import requests
from requests import RequestException

def _load_config():
    """加载并返回config.yml配置"""
    config_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..", "..",
        "config.yml"
    )
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}
    except yaml.YAMLError:
        return {}

_CONFIG = _load_config()

_CREATE_EVENT_URL = f"{_CONFIG.get('server', {}).get('base_url')}{_CONFIG.get('api', {}).get('create_event')}"
_ADD_LOG_URL = f"{_CONFIG.get('server', {}).get('base_url')}{_CONFIG.get('api', {}).get('add_log')}"
_GET_TOKEN_URL = f"{_CONFIG.get('server', {}).get('base_url')}{_CONFIG.get('api', {}).get('get_token')}"

def get_token():
    data = {
        "username": "SampleUser5",
        "address": "123456",
        "privateKey": "password"
    }
    response = requests.post(_GET_TOKEN_URL, json=data)
    response.raise_for_status()
    res = response.json()
    os.environ["flask_app_token"] = str(res['token'])

def create_event(type_id, name, participants_id):
    """调用创建事件接口"""
    data = {
        "typeId": type_id,
        "name": name,
        "participantsId": participants_id
    }
    headers = {
        "token": os.environ.get("flask_app_token")
    }
    try:
        response = requests.post(_CREATE_EVENT_URL, json=data, headers=headers)
        response.raise_for_status()
        return response.json()
    except RequestException as e:
        return {"success": False, "error": str(e)}


def add_audit_log(event_id, cur_status, content, status_name):
    """调用添加审计日志接口"""
    data = {
        "eventId": event_id,
        "curStatus": cur_status,
        "status_name": status_name,
        "content": content
    }
    headers = {
        "token": os.environ.get("flask_app_token"),
    }
    try:
        response = requests.post(_ADD_LOG_URL, json=data, headers=headers)
        response.raise_for_status()
        return response.json()
    except RequestException as e:
        return {"success": False, "error": str(e)}