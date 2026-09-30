# TEE 后端适配层

本目录按 `TEE对接/vm-api/measure-files/service_new.tar.gz` 和 `TEE对接/receive-key-api/receive-key.c` 的源码实现，平台后端通过它访问海光主机，不让浏览器直连 TEE 服务。

默认远端地址为 `http://10.112.14.6`：

- `8000`：`POST /api/v2/vms`、`POST /api/v2/vms/{vmId}/start`
- `28080`：宿主机独立 `receive-key` 服务（源码仅接收 `ecPublicKey`，生成并封装 SM4 密钥）
- `8080`：`POST /api/receive-key`
- `8081`：`POST /api/receive-json`
- `8082`：`POST /api/receive-file`
- `8083`：`POST /api/get-result`
- `18080`：虚机 nginx 网关；根路径返回 404 代表服务已就绪

可通过以下环境变量覆盖：`TEE_HOST`、`TEE_VM_API_PORT`、`TEE_HOST_KEY_PORT`、`TEE_KEY_PORT`、`TEE_JSON_PORT`、`TEE_FILE_PORT`、`TEE_RESULT_PORT`、`TEE_GATEWAY_PORT`、`TEE_VM_API_TOKEN`、`TEE_REQUEST_TIMEOUT_MS`、`TEE_READY_TIMEOUT_MS`、`TEE_READY_POLL_MS`。

平台路由：

- `POST /api/privacy/tee/request`（multipart，买方请求交付；可带 `weightFile` 覆盖默认权重，不创建 VM）
- `POST /api/privacy/tee/deliver`（卖方执行交付；清理对面虚机后创建 VM 并后台运行链路）
- `POST /api/privacy/tee/confirm`（兼容入口，等价于 `deliver`）
- `GET /api/privacy/tee/status?transactionId=...`
- `GET /api/privacy/tee/attempts?transactionId=...`（交付详情，打开弹窗拉一次，不轮询）
- `GET /api/privacy/tee/request-info?transactionId=...`（卖方执行交付前的请求信息）
- `POST /api/privacy/tee/receive-key`
- `POST /api/privacy/tee/verify-contract`
- `POST /api/privacy/tee/receive-file`
- `POST /api/privacy/tee/get-result`

可重复交付：每笔订单可多次交付，每次交付产生一条 `tee_delivery_attempts` 记录，终态只有成功/失败。落盘目录按轮次编号：

- 买方权重：`backend/storage/tee-requests/<交易号>/attempt-<n>/weight.csv`
- 加密结果：`backend/storage/tee-results/<交易号>/attempt-<n>/encrypted-result.json`

卖方“执行交付”前会通过 SSH 登录海光主机调用清理脚本，相关环境变量：

- `TEE_HOST_SSH_ENABLED`（默认 `true`）
- `TEE_HOST_SSH_HOST`（默认 `10.112.14.6`）
- `TEE_HOST_SSH_USER`（默认 `super`）
- `TEE_HOST_SSH_PASSWORD`（优先；也可写入 `backend/.tee-host-ssh-secret`，该文件已 gitignore，缺失则交付直接判失败）
- `TEE_HOST_SCRIPTS_DIR`（默认 `/opt/vm-api-service/stable_scripts/v2`）
- `TEE_HOST_SSH_TIMEOUT_MS`（默认 `120000`）

`receive-key` 的请求体会原样保留源码支持的 `fileType`、`role`、`kind`、`name` 字段；源码要求先上传 `data`，再申请 `weight` 密钥，路由不绕过该约束。
