# HE Integration Design

**Date:** 2026-05-30

## Goal

在现有交易与数字合约体系上接入 PCP 的 HE 能力，保持当前业务语义不变：

- 卖家页面作为最终“交付”触发入口
- 买家页面负责上传 HE 公钥、保存本地私钥、下载并在前端解密结果
- 后端代替买家身份调用 PCP 的 HE 接口

## Scope

本次只覆盖 HE 交付链路，前端暂时移除 PRE / FL / 其他旧交付方式的页面逻辑与交互入口。

包括：

- 卖家交付页面 HE 流程改造
- 买家交付页面 HE 流程改造
- 前端生成 Paillier / ElGamal 两套密钥
- 后端 HE 专用数据表与 PCP 调用封装
- PCP `contract_id` 持久化
- HE 结果下载与浏览器内解密 CSV

不包括：

- PCP 通知服务端的完整异步 webhook 体系重构
- PRE / FL 的本次重新接入实现
- 私钥服务端托管

## Core Constraints

### 1. 业务流程优先于 PCP 原始权限语义

虽然 PCP 文档规定 `POST /he/contract` 与 `POST /he/calculate_csv` 由 buyer 调用，但当前业务要求“卖家页面最终触发交付”。因此：

- 前端交互仍由卖家发起
- 后端内部使用交易中的买方身份组装 PCP Header 与 Body
- 对用户暴露的业务动作仍然是“卖家交付”

### 2. 私钥不能回传后端

买方点击“上传公钥”时：

- 浏览器内一次生成两套密钥对：Paillier、ElGamal
- 公钥上传后端持久化
- 私钥只在浏览器本地下载保存
- 后端永远不保存、也不接收 HE 私钥

### 3. PCP `contract_id` 必须持久化

`POST /he/contract` 返回的 `contract_id` 是 PCP 内部合同 ID，后续至少用于：

- `GET /he/{contract_id}/status`
- 避免同一交易重复创建 PCP HE 合同
- 将业务合同 ID 与 PCP 合同 ID 建立稳定映射

## Data Mapping

### transactions 表与 `/he/contract` 的映射

当前确认的映射如下：

- `transactions.buyer_address` -> `/he/contract.buyer_id`
- `transactions.seller_address` -> `/he/contract.seller_ids[0]`
- `transactions.transaction_id` -> 业务内部关联键，不直接作为 PCP 固定字段

### source_contract_id 的来源

`source_contract_id` 应使用业务合同 ID，而不是交易流水号。推荐：

- `digital_contracts.contract_id` -> `/he/contract.source_contract_id`

这样三层标识分别清晰：

- `transaction_id`：平台交易 ID
- `business_contract_id`：平台数字合约 ID，同时作为 PCP `source_contract_id`
- `pcp_contract_id`：PCP 返回的内部 HE 合同 ID

### 其余字段来源

- `operation_type` -> 卖家交付弹窗中的操作符选择，取值 `ADD` / `MUL`
- `enc_type` -> 卖家交付弹窗中的算法选择，取值 `Paillier` / `ElGamal`
- `data_type_1` -> 固定 `ciphertext`
- `data_type_2` -> 固定 `ciphertext`

## Data Model

新增一张 HE 专用表，建议命名为 `he_delivery_contracts`。

建议字段：

- `id`
- `transaction_id`
- `business_contract_id`
- `pcp_contract_id`
- `buyer_id`
- `seller_id`
- `selected_enc_type`
- `selected_operation`
- `paillier_public_key_json`
- `elgamal_public_key_json`
- `pcp_status`
- `download_token`
- `result_filename`
- `result_storage_path`
- `last_error`
- `created_at`
- `updated_at`

职责：

- 一条记录对应一笔交易的 HE 交付上下文
- 持久化买方上传的双公钥
- 持久化 PCP 合同 ID
- 保存最近一次任务状态与结果定位信息

如果后续希望区分“公钥登记”和“任务执行历史”，可以再拆表；本次先保持单表实现，降低改动量。

## Frontend Design

### 前端收口原则

本次前端以“只保留 HE”为准，但不能写成一次性死逻辑。要求：

- 卖家页面当前只显示 HE 交付入口
- 买家页面当前只显示 HE 相关操作
- 旧的 PRE / FL / 其他交付方式前端分支逻辑可以删除
- 代码结构上保留 `deliveryMethod` 的统一抽象，当前仅注册 `he`
- 后续接 PRE / FL 时，应能在不推翻页面骨架的前提下扩展

推荐方式：

- 页面层只渲染当前启用的交付方式配置
- HE 的状态映射、表单配置、按钮行为、结果处理集中封装
- 不再在页面中保留大量已停用方式的 `if/else` 分支

### 卖家页面

目标页面：`frontend/src/views/DeliverySeller2.vue`

HE 相关列调整为：

- 交易ID
- 交付状态
- 交付方法（当前固定显示 HE）
- 数字合约查看按钮
- 交付按钮

HE 交付流程：

1. 卖家选择交付方法为 HE
2. 卖家第一次点击交付
3. 前端请求后端检查该交易是否已有 HE 公钥
4. 若没有公钥，提示“需要买方先上传 HE 公钥”
5. 买方上传公钥后，卖家再次点击交付
6. 弹出 HE 交付弹窗
7. 卖家上传两个 CSV 文件
8. 卖家选择加密算法 `Paillier` / `ElGamal`
9. 卖家选择操作符 `ADD` / `MUL`
10. 前端提交到后端 HE 提交接口

交付弹窗约束：

- 两个文件都必须是 CSV
- ElGamal 时提示 CSV 必须含 `c1,c2`
- Paillier 时提示后端按第一列读取密文
- ElGamal 不允许选择 `ADD`，因为 PCP 文档说明当前只支持 `MUL`

### 买家页面

目标页面：`frontend/src/views/DeliveryBuyer2.vue`

HE 相关列调整为：

- 交易ID
- 交付状态
- 交付方法（当前固定显示 HE）
- 查看合约按钮
- 上传公钥按钮
- 下载结果按钮

买家 HE 流程：

1. 当卖家发起过 HE 交付检查后，该交易在买家侧显示为待公钥上传
2. 买家点击“上传公钥”
3. 浏览器同时生成两套密钥对
4. 前端上传两套公钥到后端
5. 前端自动下载两份私钥文件到本地
6. 当任务完成后，买家点击“下载结果”
7. 前端先从后端下载 PCP 结果文件
8. 用户选择本地私钥文件
9. 浏览器内解密结果并导出明文 CSV

私钥文件建议：

- `he-paillier-private-<transaction_id>.json`
- `he-elgamal-private-<transaction_id>.json`

建议额外抽离的前端职责：

- `deliveryMethod` 常量与展示配置
- HE 状态文案映射
- HE 公钥/私钥序列化工具
- HE 结果解密与 CSV 导出工具

如果当前仓库没有合适目录，可先在现有 `views` 同级新增轻量工具文件，避免把全部逻辑继续堆进单个 Vue 文件。

## Backend Design

### 模块拆分

按 AGENTS 指引，将 HE 逻辑放入 `backend/pcp` 目录，建议拆分：

- `backend/pcp/index.js`
- `backend/pcp/he.js`
- `backend/pcp/client.js`
- `backend/pcp/signature.js`

职责：

- `client.js`：统一发起 PCP 请求、组装 Header
- `signature.js`：处理 timestamp / nonce / signature
- `he.js`：HE 合同创建、状态查询、CSV 提交、结果下载
- `index.js`：统一导出

### 后端新增接口

建议增加以下业务接口：

- `GET /api/privacy/he/public-key-status`
  - 输入：`transactionId`
  - 输出：当前交易是否已上传 HE 公钥、是否已有 `pcp_contract_id`

- `POST /api/privacy/he/public-keys`
  - 输入：`transactionId`、两套公钥
  - 行为：保存 Paillier / ElGamal 公钥

- `POST /api/privacy/he/submit`
  - 输入：`transactionId`、`encType`、`operation`、`file1`、`file2`
  - 行为：
    1. 查交易与数字合约
    2. 确保已存在公钥
    3. 若无 `pcp_contract_id`，先调用 `/he/contract`
    4. 持久化返回的 `pcp_contract_id`
    5. 调用 `/he/calculate_csv`
    6. 更新状态为 `QUEUED`

- `GET /api/privacy/he/status`
  - 输入：`transactionId`
  - 行为：根据 `pcp_contract_id` 查询 PCP 状态并落库

- `GET /api/privacy/he/result`
  - 输入：`transactionId`
  - 行为：从本地记录或下载 token 定位 PCP 结果文件并回传给前端

### PCP `/he/contract` 组装逻辑

请求头：

- `x-entity-id = buyer_id`
- 其他鉴权头由 PCP 配置决定

请求体：

```json
{
  "buyer_id": "<transactions.buyer_address>",
  "source_contract_id": "<digital_contracts.contract_id>",
  "seller_ids": ["<transactions.seller_address>"],
  "operation_type": "<ADD|MUL>",
  "enc_type": "<Paillier|ElGamal>",
  "data_type_1": "ciphertext",
  "data_type_2": "ciphertext"
}
```

注意：

- `operation_type` 与 `enc_type` 由本次卖家交付选择决定
- 若已存在 `pcp_contract_id`，默认不重复创建
- 若已存在但算法或操作与已有合同定义冲突，应直接报错，而不是静默覆盖

### PCP `/he/calculate_csv` 组装逻辑

后端行为：

1. 根据 `transaction_id` 找到 `pcp_contract_id`
2. 根据 `enc_type` 读取已保存的对应公钥
3. 构造 multipart 请求：
   - `file1`
   - `file2`
   - `data`
4. `data` 为：

```json
{
  "contract_id": "<pcp_contract_id>",
  "operation": "<ADD|MUL>",
  "enc_type": "<Paillier|ElGamal>",
  "public_keys": { "...": "..." }
}
```

## Result Handling

### 状态映射

页面统一映射 PCP 状态：

- `CREATED` -> 已创建
- `WAITING_INPUT` -> 等待输入
- `QUEUED` -> 排队中
- `RUNNING` -> 计算中
- `COMPLETED` -> 已完成
- `FAILED` -> 失败
- `AUDIT_FAILED` -> 审计失败
- `NOT_EXIST` -> 合同不存在

### 下载与解密

PCP 不返回 HE 私钥，也不在状态接口返回下载 token，因此后端需要把结果可用信息持久化。

本次实现要求：

- 买家点击下载结果时，后端返回 HE 结果文件原始内容
- 前端根据本次任务 `enc_type` 让用户上传匹配的私钥文件
- 浏览器内完成解密
- 解密后导出明文 CSV

如果当前项目中还没有 PCP 通知回调落库能力，本次可以先采用“状态已完成 + 后端已有结果文件定位信息”这一最小实现；若缺少结果入口，则需在实现阶段补一个 PCP 结果接收/保存接口。

## Error Handling

必须显式处理以下场景：

- 交易不存在
- 数字合约不存在
- 买家未上传 HE 公钥
- 已有 `pcp_contract_id` 但所选算法与已创建合同不一致
- ElGamal 选择 `ADD`
- PCP 返回 `403`、`404`、`409`
- 前端未提供私钥文件
- 私钥算法与结果算法不匹配
- CSV 内容不符合算法要求

## Testing Strategy

至少覆盖：

- 后端 PCP 请求体字段映射测试
- `pcp_contract_id` 首次创建并持久化测试
- 已有 `pcp_contract_id` 时避免重复创建测试
- 买家公钥保存接口测试
- 卖家提交前缺失公钥的失败测试
- ElGamal + `ADD` 拦截测试
- 前端 HE 状态展示测试
- 前端买家本地解密流程测试

## Open Implementation Note

当前仓库中的 MySQL 结构尚未通过本地运行确认，原因是当前执行环境未直接连通数据库 socket。实现前需要实际检查：

- `transactions`
- `digital_contracts`
- 买家结果落库相关表

并据此确定新表字段类型与是否可复用现有结果表。
