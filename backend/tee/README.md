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

- `POST /api/privacy/tee/request`
- `POST /api/privacy/tee/confirm`
- `GET /api/privacy/tee/status?transactionId=...`
- `POST /api/privacy/tee/receive-key`
- `POST /api/privacy/tee/verify-contract`
- `POST /api/privacy/tee/receive-file`
- `POST /api/privacy/tee/get-result`

`receive-key` 的请求体会原样保留源码支持的 `fileType`、`role`、`kind`、`name` 字段；源码要求先上传 `data`，再申请 `weight` 密钥，路由不绕过该约束。
