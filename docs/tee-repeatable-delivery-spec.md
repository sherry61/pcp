# TEE 资产交付：可重复交付 + 交付详情 Spec（Goal）

> 状态：已确认，实现中（Q1–Q6 已定，后端待重启）
> 范围：仅 TEE 交付方式（`pc_type = 'TEE'`）
> 链路：前端（10.112.191.163:3000 API / 8085 dev）→ 后端（10.112.191.163:3000, `backend/main.js`）→ 海光主机（10.112.14.6）

---

## 1. 背景与目标

当前 TEE 交付是"买方点请求交付 → 后端立即自动建虚机跑完整链路"，卖方只能等待，且一个订单只跑一次、失败后状态机复杂、没有独立的交付历史视图。

本次目标：

1. **买方"请求交付"不再触发自动化链路**：
   - 买方点"请求交付"打开弹窗，可上传一份 `weight.csv`；
   - 该文件保存在**我们的后端**，用于覆盖服务器中该资产的默认权重文件；
   - 请求只落库（记录请求时间、买方权重文件），**不创建 VM、不调用海光主机**。
2. **卖方点"执行交付"才真正走自动化链路**：前端 → 后端 → 海光主机（建/启虚机、下发 data/weight、计算、取回结果）。
3. **每一笔订单可重复交付**：每次执行交付产生一条独立的交付记录，只有 **成功 / 失败** 两种终态；终态后可再次交付。
4. **前端可查看"交付详情"**：在操作栏新增按钮，弹窗展示该订单每次交付的记录列表（交付状态、交付时间、失败原因等），**打开时拉一次，不做轮询**。

---

## 2. 现状（关键位置）

### 2.1 后端

- `backend/main.js:917` 注册 `registerTeeRoutes({ app, upload, dbQuery, teeClient })`。
- `backend/tee/routes.js`：
  - `POST /api/privacy/tee/request`：JSON，落 `delivery_secure_jobs`（`PENDING/REQUESTED`），**不建 VM**。
  - `POST /api/privacy/tee/confirm`：启动后台链路 `startVmInBackground` → `createVm/startVm/waitForServices/autoDeliverMaterials`。
  - `autoDeliverMaterials()`：从 `tee_asset_materials` 取 `data_file_path`、`weight_file_path`，依次 `receive-key/receive-file` 上传，`get-result` 取密文并校验落库。
  - `GET /api/privacy/tee/status`、`/events`、`/key-file`、`/receive-key`、`/verify-contract`、`/receive-file`、`/get-result`。
- 表：`delivery_secure_jobs`（每 `transaction_id` 唯一，含当前 VM/step/密钥/密文结果）、`tee_asset_materials`（资产登记时的 data/weight 文件，**默认权重就在这里的后端文件系统**）、`tee_delivery_events`（阶段事件，非业务交付记录）。
- 默认资产文件目录：`backend/storage/tee-assets/<assetId>/{data.csv,weight.csv}`；结果目录 `backend/storage/tee-results/<tx>/encrypted-result.json`。

### 2.2 前端

- `frontend/src/utils/teeApi.js`：`request()`（JSON）、`confirm()`、`status()`、`receiveKey/receiveFile/getResult/keyFile` 等。
- `frontend/src/views/DeliveryBuyer2.vue`：
  - TEE 行操作按钮："请求交付"（`requestTeeDelivery`）→ 调 `request` 后**立即调 `confirm` 自动跑链路**；"下载结果"。
  - 已有 `teeDialog`（权重上传）与 `submitTeeWeight`（走 `receive-key/receive-file`，依赖 VM 已就绪）。
- `frontend/src/views/DeliverySeller2.vue`：
  - TEE 行操作栏当前只显示提示 `<span>买方请求后自动交付</span>`；有隐藏的 `teeDialog`（手动传 data.csv，调 `confirm`）。
  - 状态由 `refreshTeeStatus` 调 `/status`，页面每 5s 轮询。

### 2.3 海光主机（只读勘察结论）

- VM API `10.112.14.6:8000` 仅暴露 `POST /api/v2/vms`、`POST /api/v2/vms/{id}/start`、`GET /health`；**没有 stop/delete HTTP 接口**。
- 清理脚本：`/opt/vm-api-service/stable_scripts/v2/stop_vm.sh <vm_id>`、`delete_vm.sh <vm_id>`；需要 root（写 `/var/lib/vm-api/instances/<vm_id>`、调 `hag tkm ...`）。
- 主机账号 `super` 具备 `(ALL:ALL) ALL` sudo 权限；`sudo -S` 可从 stdin 读密码。
- 结论：重复交付前清理旧 VM，必须由后端通过 SSH + `sudo` 调这两个脚本。

---

## 3. 目标流程

```text
买方：请求交付（弹窗可传 weight.csv）
  └─ 后端 POST /request（multipart）
      ├─ 保存 weight.csv 到后端 storage/tee-requests/<tx>/weight.csv
      ├─ delivery_secure_jobs: step=REQUESTED, requested_at=now, buyer_weight_*=...
      └─ 不建 VM、不碰海光主机
                    ↓（卖方列表刷新可见：待执行交付）
卖方：执行交付
  └─ 后端 POST /deliver
      ├─ 校验买方已请求 + 资产 data/weight（或买方 weight）齐备
      ├─ 若存在上一次 vm_id：SSH+sudo 调 stop_vm.sh / delete_vm.sh 清理
      ├─ 清空本订单上一轮运行态（vm_id/step/result/密钥）
      ├─ 新增 tee_delivery_attempts 第 N 次记录（RUNNING）
      └─ 后台链路 startVmInBackground(..., attemptId)
           ├─ 成功：attempt=SUCCESS，job step=RESULT_READY
           └─ 失败：attempt=FAILED + error_message，job step=FAILED
                    ↓
买方/卖方：交付详情（弹窗，拉一次 /attempts）
  └─ 展示每次交付：序号 / 状态(成功|失败|进行中) / 权重来源 / 开始时间 / 完成时间 / 耗时 / 失败原因
```

关键点：
- 买方 weight 覆盖只影响"本次及之后"的交付；未上传则用资产登记时的默认 `weight_file_path`。
- `data.csv` 默认使用资产登记时后端保存的文件（见 Q2）。
- 结果加密仍复用现有 weight 密钥流程（买方 weight 上传后，结果密钥随该轮交付生成并落库/可下载），**对面 TEE 协议不改**。

---

## 4. 数据模型

### 4.1 新表 `tee_delivery_attempts`（交付详情数据源）

```sql
CREATE TABLE IF NOT EXISTS tee_delivery_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_id VARCHAR(64) NOT NULL,
  asset_id VARCHAR(255) NULL,
  attempt_no INT NOT NULL,                       -- 从 1 开始
  status VARCHAR(16) NOT NULL DEFAULT 'RUNNING', -- RUNNING | SUCCESS | FAILED
  step VARCHAR(64) NULL,                         -- 最后一次 step，便于排查
  vm_id VARCHAR(128) NULL,
  weight_source VARCHAR(32) NULL,                -- BUYER_UPLOADED | ASSET_DEFAULT
  weight_file_name VARCHAR(255) NULL,
  error_message TEXT NULL,
  triggered_by VARCHAR(255) NULL,                -- 卖方地址
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tee_delivery_attempts_tx_no (transaction_id, attempt_no),
  KEY idx_tee_delivery_attempts_tx (transaction_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.2 `delivery_secure_jobs` 增列（按交易保存买方请求与覆盖权重）

```sql
ALTER TABLE delivery_secure_jobs
  ADD COLUMN buyer_weight_file_path VARCHAR(1024) NULL,
  ADD COLUMN buyer_weight_file_name VARCHAR(255) NULL,
  ADD COLUMN buyer_weight_file_hash CHAR(64) NULL,
  ADD COLUMN buyer_weight_file_size BIGINT UNSIGNED NULL,
  ADD COLUMN requested_at TIMESTAMP NULL,
  ADD COLUMN current_attempt_id BIGINT UNSIGNED NULL;
```

> 买方权重文件落盘目录（按待交付轮次编号）：`backend/storage/tee-requests/<safeTransactionId>/attempt-<n>/weight.csv`
> 加密结果落盘目录（按轮次编号）：`backend/storage/tee-results/<safeTransactionId>/attempt-<n>/encrypted-result.json`
>
> 可重复交付下后一轮不会覆盖前一轮：每一轮的结果和买方权重都保留在各自的 `attempt-<n>/` 目录里，`get-result` 只读取当前 `current_attempt_id` 对应的结果。

---

## 5. 后端接口设计

### 5.1 `POST /api/privacy/tee/request`（改造为 multipart）

卖方/买方请求交付，**只落库**。

- Content-Type：`multipart/form-data`
- 字段：
  - `transactionId`（必填）
  - `buyerAddress`、`sellerAddress`、`assetId`
  - `vmCpu`、`vmMemoryMb`（可选，默认 8 / 4096）
  - `weightFile`（可选，`.csv`）— 覆盖默认权重
  - `useDefaultWeight`（可选 `'1'`）— 显式清空覆盖，恢复默认权重
- 行为：
  1. 校验资产材料存在且 data 齐备（weight 允许用买方覆盖）。
  2. 若带 `weightFile`：写入 `storage/tee-requests/<tx>/attempt-<下一轮次>/weight.csv`，更新 `buyer_weight_*`。
  3. 若 `useDefaultWeight=1`：清空 `buyer_weight_*`。
  4. `INSERT ... ON DUPLICATE KEY UPDATE`：`step='REQUESTED'`, `status='PENDING'`, `requested_at=NOW()`, `current_attempt_id=NULL`；**不启动 VM**。
- 返回：`{ success, transactionId, step:'REQUESTED', requestedAt, weightSource, weightFileName }`

### 5.2 `POST /api/privacy/tee/deliver`（新增，卖方触发）

真正启动链路。

- Body：`{ transactionId, sellerAddress }`
- 行为：
  1. 校验 job 存在且买方已请求；若上一轮交付已消耗本次请求（`current_attempt_id != null`）或链路在飞 → `409 请等待买方重新请求交付 / 正在交付中`。注：成功或失败后买方需重新“请求交付”，卖方才能再执行。
  2. **先新增 attempt**（`RUNNING`，`attempt_no = max+1`）并重置 job 运行态（`vm_id/step/result/密钥` 清空，`status=RUNNING`）。
  3. **清理旧 VM**：SSH+sudo 列出 `/var/lib/vm-api/instances/` 下所有虚机并逐个 `stop_vm.sh` + `delete_vm.sh`（含本订单历史 `vm_id`）；清理失败则本次 attempt 直接记 `FAILED`（`CLEANUP_FAILED`），不建新 VM。
  4. 后台 `startVmInBackground(transactionId, job, attemptId)`。
- 返回：`202 { success, transactionId, attemptId, attemptNo, cleanup, accepted:true }`

### 5.3 `GET /api/privacy/tee/attempts?transactionId=...`（新增，交付详情）

- 返回：
```json
{
  "success": true,
  "transactionId": "465",
  "attempts": [
    {
      "id": 12, "attemptNo": 2, "status": "FAILED", "step": "WEIGHT_UPLOAD_FAILED",
      "vmId": "a526...", "weightSource": "BUYER_UPLOADED", "weightFileName": "weight.csv",
      "errorMessage": "...", "startedAt": "2026-09-12 10:00:00", "finishedAt": "2026-09-12 10:02:03",
      "durationMs": 123000
    }
  ]
}
```

### 5.4 `GET /api/privacy/tee/request-info?transactionId=...`（新增，卖方弹窗展示）

- 返回：`{ success, requested, requestedAt, buyerWeight:{fileName,source,size}, lastAttempt:{status,attemptNo} }`

### 5.5 保留/兼容

- `POST /api/privacy/tee/confirm` 保留，但前端不再调用；可视为 `deliver` 的兼容入口（仅当已请求时）。
- `/status`、`/events`、`/receive-*`、`/get-result` 保持不变。
- `autoDeliverMaterials` 内部 weight 路径改为：`job.buyer_weight_file_path || material.weight_file_path`，并把 `weight_source` 写入 attempt。

---

## 6. 前端交互设计

### 6.1 买方 `DeliveryBuyer2.vue`

- TEE 行操作栏：
  - **请求交付**：打开 `teeDialog`（弹窗）
    - 交易ID
    - 权重文件选择（`.csv`，可选）
    - 复选/单选：`使用资产默认权重`（选中则清空覆盖）
    - 说明："不上传则使用服务器默认权重；上传后仅本次订单生效。"
    - 确定 → `teeApi.request({... , weightFile})`，成功后提示"已提交交付申请，等待卖方执行交付"。
  - **交付详情**：打开 `attemptDialog`，调 `teeApi.attempts(tx)` **一次**，表格展示。
  - **下载结果**：逻辑不变（结果就绪后可用）。
- 移除 `requestTeeDelivery` 里的 `teeApi.confirm(...)` 自动调用。
- 行状态文案调整为：`待请求 / 待卖方执行 / 交付中 / 交付成功 / 交付失败`。

### 6.2 卖方 `DeliverySeller2.vue`

- TEE 行操作栏：
  - 把提示文字替换为 **执行交付** 按钮：
    - 未收到买方请求时禁用，文案"待买方请求"；
    - 已请求且空闲 → 可点，打开确认弹窗（显示交易ID、买方权重文件名/来源、"将创建 TEE 环境并自动计算"）；
    - 确认 → `teeApi.deliver(tx)`，提示"已开始交付，可点交付详情查看"。
  - **交付详情**：同买方，调 `teeApi.attempts(tx)` 一次。
- 保留"刷新交付状态"按钮；交付详情弹窗内**不轮询**。
- 移除隐藏的手动 data.csv 上传入口（按 Q2 确认）。

### 6.3 交付详情弹窗（买卖双方共用的展示结构）

表格列：`序号 | 交付状态 | 权重来源 | 开始时间 | 完成时间 | 耗时 | 失败原因`

- 状态用 `el-tag`：成功(绿) / 失败(红) / 进行中(蓝)。
- 空态："暂无交付记录"。
- 关闭后不保留定时器（无轮询）。

### 6.4 API 客户端 `frontend/src/utils/teeApi.js`

```js
request({ transactionId, buyerAddress, sellerAddress, assetId, weightFile, useDefaultWeight })
  // FormData → POST /api/privacy/tee/request
deliver(transactionId)      // POST /api/privacy/tee/deliver
attempts(transactionId)     // GET  /api/privacy/tee/attempts
requestInfo(transactionId)  // GET  /api/privacy/tee/request-info
```

---

## 7. 海光主机虚机清理

新增 `backend/tee/hostVmCleanup.js`，职责：通过 SSH 在 10.112.14.6 上以 `super` 执行 sudo 脚本。

- 配置（环境变量，不硬编码密码到源码）：
  - `TEE_HOST_SSH_HOST`（默认 `10.112.14.6`）
  - `TEE_HOST_SSH_USER`（默认 `super`）
  - `TEE_HOST_SSH_PASSWORD`（必填，缺失则清理失败并报明确错误）
  - `TEE_HOST_SCRIPTS_DIR`（默认 `/opt/vm-api-service/stable_scripts/v2`）
  - `TEE_HOST_SSH_ENABLED`（默认 `true`）
- 执行方式（无新增 npm 依赖）：
  - `ssh`（`SSH_ASKPASS` 免交互登录，`setsid` 无 tty），远端命令 `cd <dir> && sudo -S -p "" ./stop_vm.sh <vmId> && sudo -S -p "" ./delete_vm.sh <vmId>`；
  - sudo 密码通过 stdin 传入，不出现在 argv。
- 幂等：脚本对"已停止/不存在"返回非 0 时按可接受处理（先 stop 再 delete，stop 失败不阻断 delete）。
- 失败策略：清理失败 → 本次 `deliver` 直接判 `FAILED`（不建新 VM），`error_message` 写明清理失败，便于人工处理。见 Q1。

---

## 8. 边界与异常

| 场景 | 处理 |
|---|---|
| 买方未请求，卖方点执行交付 | 409，提示"请等待买方请求交付" |
| 资产缺 data | 400/409，明确缺哪个文件 |
| 买方未传 weight 且资产无 weight | 409，提示上传权重或补齐资产默认权重 |
| 重复点执行交付（链路在飞） | 409 "正在交付中" |
| 旧 VM 清理失败 | 本次 attempt=FAILED，提示清理失败 |
| 链路中途失败 | attempt=FAILED + error_message；卖方再次执行交付产生新 attempt |
| 成功后再交付 | 允许，attempt_no +1，旧结果文件被覆盖/清理，结果密钥按新轮生成 |
| 前端页面刷新/关闭 | 链路由后端后台执行，不受影响；重新进入后调 `/status` 与 `/attempts` 展示 |

---

## 9. 兼容与回滚

- 数据库：新增表 + 新增列，均为可空/新增，**不影响现有行**；提供回滚 SQL（drop 表、drop 列）。
- 接口：`/request` 由 JSON 改 multipart，旧 JSON 调用兼容（无文件时等同原语义，但不再自动建 VM）；`/confirm` 保留。
- 前端：为纯增量；若需回滚前端，恢复 `teeApi.request` 的 JSON 调用与 `confirm` 即可。
- 结果兼容：`get-result` 优先返回缓存；每轮交付开始会清空缓存，避免串轮。

---

## 10. Goal 任务拆解

1. [ ] SQL 迁移：`backend/sql/2026-09-12-tee-repeatable-delivery.sql`（新表 + 增列 + 回滚注释）。
2. [ ] 后端 `tee/routes.js`：
   - [ ] `/request` multipart + 买方 weight 落盘 + `requested_at` + 不建 VM。
   - [ ] `/deliver` 新增：尝试记录、清旧 VM、重置运行态、后台链路。
   - [ ] `/attempts`、`/request-info` 新增。
   - [ ] `autoDeliverMaterials` 支持买方 weight 覆盖 + 记录 `weight_source`。
   - [ ] `startVmInBackground` 落 attempt 终态（SUCCESS/FAILED/耗时/错误）。
   - [ ] `confirm` 兼容处理。
3. [ ] `backend/tee/hostVmCleanup.js` + 环境变量说明（`tee/README.md`）。
4. [ ] 前端 `teeApi.js` 四个方法。
5. [ ] 买方 `DeliveryBuyer2.vue`：请求弹窗（含 weight 上传/默认权重）、交付详情、去掉自动 confirm。
6. [ ] 卖方 `DeliverySeller2.vue`：执行交付按钮+确认弹窗、交付详情、去掉自动提示/手传入口。
7. [ ] 样式：交付详情表格 / 状态 tag。
8. [ ] 联调：买方请求（带/不带 weight）→ 卖方执行 → 详情列表（成功/失败）→ 再次执行。
9. [ ] 部署：应用 SQL、配置 `TEE_HOST_SSH_PASSWORD`、重启后端（需协调窗口）。

---

## 11. 待确认问题（Q1–Q5）

- **Q1 旧 VM 清理**：✅ 已确认。后端 SSH+`sudo` 调 `stop_vm.sh`/`delete_vm.sh`；密码环境变量 `TEE_HOST_SSH_PASSWORD`；**每次交付前**都清理对面已有虚机（不只本订单的）；清理失败则本次 attempt 记 `FAILED`，不建新 VM。
- **Q2 卖方执行交付的输入**：✅ data 用资产登记时的 `data.csv`，weight 用买方本轮覆盖或资产默认；卖方不再手传 data.csv。
- **Q3 交付详情范围**：✅ 只改 TEE 行。
- **Q4 状态语义**：✅ 主列表 TEE 状态为 `待请求交付 / 待执行交付 / 交付中 / 交付成功 / 交付失败`；成功/失败后买方按钮回到“请求交付”。
- **Q5 部署**：后端由 `allserve` 拉起，改完需重启 3000 端口 node 进程；重启前告知用户。
- **Q6 持久化目录编号**：✅ 按 `订单号/attempt-<n>/` 编号（结果 + 买方权重），不再覆盖。
