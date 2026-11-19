# MPC 审计链路（对齐 PAM Hub / Multiprover）

独立于旧的 `backend/mpc/`（GC 阈值）链路，用于把 MPC 交付接入审计方现有的
`MPC_COMPOSITE` 电路。旧链路保持不动，可并行存在。

## 业务语句

每个用户：

```text
y = (a + b) * c
qualified = y >= threshold（可选）
```

- `a`：槽位 A 的所有参与方数据按 `user_id` 求和；
- `b`：槽位 B 的所有参与方数据按 `user_id` 求和；
- `c`：折算系数，默认 `1`（即 `y = a + b`），也可整单指定或 CSV 逐行指定；
- `y`：汇总/折算结果，可再与阈值比较。

审计电路只接受 3 个输入（a、b、c），但**业务侧支持任意多个参与方**：每个参与方
按 `parties` 清单映射到 A 或 B 槽位，同一槽位内先按 `user_id` 汇总，再进入证据。

审计电路要求 `a/b/c/y` 是**非负整数**，所以 `c` 也用整数表示（如 `70` 表示 70%，
阈值按同一比例换算）。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/privacy/mpc-audit/create` | 创建任务：`transactionId`、`businessContractId`、`buyerId`、`sellerId`、`threshold?`、`coefficient?`（默认 1）、`parties?` |
| POST | `/api/privacy/mpc-audit/data` | multipart：`transactionId` + `file`（`user_id,a,b[,c]`）、`a_files`/`b_files`，或 `party_<id>` + `parties` |
| POST | `/api/privacy/mpc-audit/submit` | 生成 `MPC_COMPOSITE` 证据并提交 Hub |
| GET | `/api/privacy/mpc-audit/status?transactionId=` | 本地状态 + 刷新 Hub 共识（`&refresh=1`） |
| GET | `/api/privacy/mpc-audit/result?transactionId=` | 逐用户 `y` / 是否达标 + 审计结论 |

数据示例（单文件）：

```csv
user_id,a,b,c
u1,100,23,5
u2,200,40,5
```

分组上传时，`a_files` 与 `b_files` 各自按 `user_id` 累加，再套用订单系数。

兼容旧前端的 `files` 多文件方式，不需要改文件选择器：

```text
N 个文件：前 N-1 个 -> 槽位 A，最后 1 个 -> 槽位 B
N = 1：全部进 A，B = 0
```

例如按顺序上传 `bank.csv, bureau.csv, insurer.csv`，则 `A = bank + bureau`，
`B = insurer`。

N 方模式（推荐）：

```json
// create 或 data 的 parties 字段
[
  {"id": "bank",    "name": "银行",     "slot": "A"},
  {"id": "insurer", "name": "保险",     "slot": "B"},
  {"id": "bureau",  "name": "征信机构", "slot": "A"}
]
```

每个参与方上传 `party_<id>` 字段的 CSV（列：`user_id,value`，也兼容 `a/b/amount/...`），
平台按 slot 合并：`A = bank + bureau`，`B = insurer`，最终证据仍是 `(A+B)*c`。

## 证据

提交给 Hub 的证据是 `he-evidence-v1` + `MPC_COMPOSITE`：

```json
{
  "schema_version": "he-evidence-v1",
  "method": "MPC",
  "he_compute_mode": "MPC_COMPOSITE",
  "seller_ids": ["seller-A", "seller-B", "buyer-C"],
  "samples": [{
    "row_index": 1,
    "seller_inputs": [
      {"seller_id": "seller-A", "cipher": "mpc1.100"},
      {"seller_id": "seller-B", "cipher": "mpc1.23"},
      {"seller_id": "buyer-C", "cipher": "mpc1.5"}
    ],
    "PCC_output": "mpc1.615"
  }]
}
```

Hub 会把证据分发给具备 `MPC` 能力的 ACTIVE 节点（当前 3 个），节点各自
`mpc_composite_commit_audit` prove/verify 后回传投票，Hub 汇总多数共识。

> 每条 sample 都是一次独立 Groth16 证明。160 条样本约需 10 分钟以上，而 Hub
> 的超时检查是 300 秒，所以默认只抽样前 20 条送审；本地计算结果仍覆盖全部用户。
> 结果弹窗会显示“审计通过（3/3 节点，抽样 20/160）”。

## 配置

| 变量 | 说明 |
|---|---|
| `PCC_HUB_BASE_URL` | 默认 `http://127.0.0.1:18140` |
| `PCC_AUDIT_TOKEN` | Hub 的 PCC 服务凭据（`X-PCC-Token`） |
| `PCC_AUDIT_TOKEN_FILE` | 凭据文件，默认 `backend/.pcc-audit-token`（已 gitignore） |
| `MPC_AUDIT_MAX_SAMPLES` | 送审抽样条数，默认 `20`；`0` 表示全量。Hub 单次审计约 5 分钟超时，每条样本一个 Groth16 证明，全量大数据集容易超时 |

后端进程以 root 运行，可读取 `super:super 0600` 的凭据文件。

## 自检

```bash
# 真实提交一条 MPC 审计事件
PCC_AUDIT_TOKEN=... node backend/scripts/mpc-audit-e2e.js

# 单元测试
node --test backend/tests/mpc-audit.test.js
```

跑完后可在：

- 节点：`http://10.112.191.163:19241/auditor/web/login`（node1/node2/node3）
- 中台：`http://10.112.191.163:15140`

看到该 `pcc_contract_id` 的交易。Hub API 查询：

```bash
curl -H "X-PCC-Token: $TOKEN" \
  http://127.0.0.1:18140/hub/audit/${event_id}/status
```

## 与旧 MPC 链路的区别

| | 旧 `backend/mpc/` | 新 `backend/mpc_audit/` |
|---|---|---|
| 计算 | GC 布尔电路，逐用户 `total_assets >= threshold` | `y=(a+b)*c`，可选阈值 |
| 执行 | Node → Flask 28090 → Go 28091 | Node 本地计算（BigInt） |
| 审计 | 链上写 hash + `"verified"`（自证） | Groth16 证据 → PAM Hub → 3 节点共识 |
| 状态 | `mpc_delivery_contracts` | `mpc_audit_jobs` |
