#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
UNIT_TARGET="/etc/systemd/system/receive-key.service"
SERVICE_NAME="receive-key.service"

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    if ! command -v sudo >/dev/null 2>&1; then
      echo "错误：管理 systemd 服务需要 root 权限或 sudo。" >&2
      exit 1
    fi
    sudo "$@"
  fi
}

if [ ! -f "$UNIT_TARGET" ]; then
  echo "receive-key systemd 服务尚未安装，请先运行 ./start-receive-key.sh。"
  exit 0
fi

if run_as_root /usr/bin/systemctl is-active --quiet "$SERVICE_NAME"; then
  run_as_root /usr/bin/systemctl stop "$SERVICE_NAME"
  echo "receive-key 已停止。"
else
  echo "receive-key 当前未运行。"
fi
