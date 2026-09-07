#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE="$SCRIPT_DIR/receive-key.c"
BINARY="$SCRIPT_DIR/receive-key"
UNIT_SOURCE="$SCRIPT_DIR/receive-key.service"
UNIT_TARGET="/etc/systemd/system/receive-key.service"
SERVICE_NAME="receive-key.service"
LEGACY_PID_FILE="$SCRIPT_DIR/receive-key.pid"

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    if ! command -v sudo >/dev/null 2>&1; then
      echo "错误：安装和管理 systemd 服务需要 root 权限或 sudo。" >&2
      exit 1
    fi
    sudo "$@"
  fi
}

stop_legacy_process() {
  [ -f "$LEGACY_PID_FILE" ] || return 0

  old_pid=$(sed -n '1p' "$LEGACY_PID_FILE")
  case "$old_pid" in
    ''|*[!0-9]*) old_pid='' ;;
  esac

  if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null; then
    old_exe=$(readlink "/proc/$old_pid/exe" 2>/dev/null || true)
    case "$old_exe" in
      "$BINARY"|"$BINARY (deleted)")
        echo "正在停止旧版 nohup 进程（PID: $old_pid）..."
        kill -TERM "$old_pid"
        attempt=0
        while kill -0 "$old_pid" 2>/dev/null && [ "$attempt" -lt 100 ]; do
          attempt=$((attempt + 1))
          sleep 0.1
        done
        if kill -0 "$old_pid" 2>/dev/null; then
          echo "错误：旧版进程未能正常停止，请先手动处理 PID $old_pid。" >&2
          exit 1
        fi
        ;;
      *)
        echo "旧 PID 文件已失效，不会停止 PID $old_pid。"
        ;;
    esac
  fi

  rm -f -- "$LEGACY_PID_FILE"
}

if [ ! -f "$SOURCE" ]; then
  echo "错误：找不到源文件 $SOURCE" >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/intl.auth" ]; then
  echo "错误：找不到运行所需的 $SCRIPT_DIR/intl.auth" >&2
  exit 1
fi

if [ ! -f "$UNIT_SOURCE" ]; then
  echo "错误：找不到 systemd 单元文件 $UNIT_SOURCE" >&2
  exit 1
fi

binary_changed=0
if [ ! -x "$BINARY" ] || [ "$SOURCE" -nt "$BINARY" ]; then
  echo "正在编译 receive-key..."
  BUILD_FILE="$BINARY.build.$$"
  trap 'rm -f -- "$BUILD_FILE"' EXIT HUP INT TERM
  gcc -Wall -Wextra -O2 "$SOURCE" -o "$BUILD_FILE" -lssl -lcrypto
  chmod 755 "$BUILD_FILE"
  mv -f -- "$BUILD_FILE" "$BINARY"
  trap - EXIT HUP INT TERM
  binary_changed=1
fi

stop_legacy_process

unit_changed=0
if ! cmp -s "$UNIT_SOURCE" "$UNIT_TARGET" 2>/dev/null; then
  echo "正在安装 systemd 服务单元..."
  run_as_root /usr/bin/install -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
  run_as_root /usr/bin/systemctl daemon-reload
  unit_changed=1
fi

# Enable once so the service starts automatically after future reboots.
run_as_root /usr/bin/systemctl enable "$SERVICE_NAME" >/dev/null

if run_as_root /usr/bin/systemctl is-active --quiet "$SERVICE_NAME"; then
  if [ "$binary_changed" -eq 1 ] || [ "$unit_changed" -eq 1 ]; then
    echo "检测到程序或配置更新，正在重启服务..."
    run_as_root /usr/bin/systemctl restart "$SERVICE_NAME"
  else
    echo "receive-key 已在运行。"
  fi
else
  run_as_root /usr/bin/systemctl start "$SERVICE_NAME"
fi

attempt=0
ready=0
while [ "$attempt" -lt 30 ]; do
  if run_as_root /usr/bin/systemctl is-failed --quiet "$SERVICE_NAME"; then
    break
  fi

  if command -v curl >/dev/null 2>&1; then
    http_code=$(curl --noproxy '*' --silent --output /dev/null \
      --write-out '%{http_code}' --max-time 1 \
      -H 'Content-Length: 0' 'http://127.0.0.1:28080/' 2>/dev/null || true)
    if [ "$http_code" = "404" ]; then
      ready=1
      break
    fi
  elif run_as_root /usr/bin/systemctl is-active --quiet "$SERVICE_NAME"; then
    ready=1
    break
  fi

  attempt=$((attempt + 1))
  sleep 0.2
done

if [ "$ready" -ne 1 ]; then
  echo "错误：receive-key 未能通过 28080 端口检查。" >&2
  run_as_root /usr/bin/systemctl --no-pager --full status "$SERVICE_NAME" || true
  exit 1
fi

echo "receive-key 已由 systemd 启动（监听: 0.0.0.0:28080，已设置开机自启）"
echo "查看状态：sudo systemctl status $SERVICE_NAME"
echo "查看日志：sudo journalctl -u $SERVICE_NAME -f"
