# TEE 后端适配层

本目录按 `TEE对接/vm-api/measure-files/service_new.tar.gz` 和 `TEE对接/receive-key-api/receive-key.c` 的源码实现，平台后端通过它访问海光主机，不让浏览器直连 TEE 服务。

默认远端地址为 `http://10.112.14.6`：

- `8000`：`POST /api/v2/vms`、`POST /api/v2/vms/{vmId}/start`
- `18080`：唯一业务入口，提供 receive-key、receive-json、receive-file、result-status、get-result；根路径 404 表示服务就绪。

新 CSV2 链路不使用 28080 或来宾内部 8080～8083 的直连端口。配置可通过 `TEE_HOST`、`TEE_VM_API_PORT`、`TEE_GATEWAY_PORT`、`TEE_VM_API_TOKEN`、`TEE_CREATE_TIMEOUT_MS`、`TEE_START_TIMEOUT_MS`、`TEE_REQUEST_TIMEOUT_MS`、`TEE_READY_TIMEOUT_MS`、`TEE_READY_POLL_MS` 覆盖。

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

新编排的 receive-key 只发送 vmId、ecPublicKey、fileType，严格遵守 model → contract → data → weight 顺序。

## 当前模型和合约流程

购买阶段只保留 `.c` 文件 SHA-256，卖方确认时生成数字合约。交付依次执行：建 VM → 启动及远程证明 → WAITING_MODEL → 买方再次上传同一模型 → 协商独立合约密钥并验证合约 → data → weight → 轮询结果 → 校验及归档。不存在自动交付跳过合约校验的分支。

- `POST /api/privacy/tee/model`：内存接收模型，完成模型和合约处理后继续后台计算。
- `POST /api/privacy/tee/attempt-result`：按交易及轮次下载成功结果。
- 当前轮次首次下载安排两分钟后精确清理 VM；密文和解密归档保留，重复下载不延长倒计时。
- 合约有效期限制发起新交付，不覆盖已完成交付的成功/失败状态；已有结果仍可下载。交付列表不显示过期标签，过期时禁用请求/执行入口。

## 迁移和验证

已有基础表后按需应用 `sql/2026-10-06-tee-csv2-adaptation.sql`、`sql/2026-10-07-tee-contract-model-hash-delivery-limit.sql`，两者可重复执行；当前数据库已具备这些字段。不要为历史合约编造模型摘要或交付次数。

从 backend 目录运行：

```bash
node --test tests/tee*.test.js
```

前端回归检查从 frontend 目录运行 `node --test src/utils/tee*.test.js src/utils/deliveryUi.test.js`。真实数据库写入集成测试默认跳过。`scripts/csv2-e2e-test.js` 及 fixtures 已从副本保留，它是历史联调脚本，不能把恢复文件等同于通过当前正式下单规则的新实机验收。

迁移副本存储前先预检查，再应用：

```bash
node scripts/migrate-tee-preview-storage.js
node scripts/migrate-tee-preview-storage.js --apply
```

迁移脚本复制并核对文件 SHA-256，不覆盖不同内容；文件成功复制后，在事务内切换素材及买方权重路径，保留副本原文件。现存目录属于不同运行账号，应用迁移需要有权写入正式存储的账号。复制旧密文不会凭空恢复缺失的历史解密材料。

当前交付前仍会清理宿主全部 VM；跨订单并发互相影响的问题尚未改动。TEE 接口的身份及订单归属校验也需单独补齐。
