# MPC 与可验证纵向联邦学习使用说明

## 1. 启动前提

1. 配置 `config/config.yaml` 中的 ChainMaker 地址、审计服务地址和合约路径。
2. 确保 `flask_app_token` 与外部审计服务一致。
3. 确保长安链合约 `authorization`、`verification`、`gc_audit`、`vfl_audit` 已经部署。
4. 默认 VFL 隐私训练要求宿主机安装 Intel SGX SDK simulation runtime，例如 `/opt/intel/sgxsdk/lib64/libsgx_urts_sim.so`。

在其他电脑部署组件和合约时，按 `DEPLOYMENT_DOC.md` 执行。不要只复制服务目录后直接启动；证书、SDK 配置、合约部署状态必须与目标链一致。

## 2. 启动服务

**注意：`server` 是目录名，必须用 `-o` 指定输出文件名，不能直接用 `go run ./server`。**

```bash
cd app/service/mpc
source /opt/intel/sgxsdk/environment
go build -o mpc_server ./server && ./mpc_server
```

启用混淆电路（GC）功能需额外设置环境变量：

```bash
cd app/service/mpc
source /opt/intel/sgxsdk/environment
ENABLE_GARBLED_CIRCUIT=true ENABLE_ITMAC_AUDIT=true go build -o mpc_server ./server && \
ENABLE_GARBLED_CIRCUIT=true ENABLE_ITMAC_AUDIT=true ./mpc_server
```

或使用 Docker：

```bash
cd app/service/mpc
docker compose up --build
```

注意：Docker 镜像默认不包含宿主机 SGX SDK。若未在镜像内安装 SGX SDK，VFL 隐私训练会失败；仅做旧明文证明兼容测试时可设置 `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true`。

## 3. 功能可用性说明

| 功能 | 无链环境 | 需要 ChainMaker 节点 | 需要额外环境变量 |
|------|----------|----------------------|------------------|
| 秘密共享 split | ✅ 完全可用 | — | — |
| VFL 训练（本地计算） | ✅ 可用 | — | — |
| VFL 训练（上链审计） | ❌ | ✅ | — |
| VFL 验证 / 审计查询 | ❌ | ✅ | — |
| 混淆电路（GC）全部接口 | ❌ 路由未注册 | ✅ | `ENABLE_GARBLED_CIRCUIT=true ENABLE_ITMAC_AUDIT=true` |

## 4. 主要接口

### 混淆电路（需启动时设置 `ENABLE_GARBLED_CIRCUIT=true ENABLE_ITMAC_AUDIT=true`）

- `POST /api/v1/bank/gc/generate-task`
- `POST /api/v1/datacenter/gc/evaluate`

### 统一审计（GC 部分需同上环境变量）

- `POST /api/v1/audit/gc/store-commitment`
- `POST /api/v1/audit/gc/verify-execution`
- `GET /api/v1/audit/gc/query-log`
- `GET /api/v1/audit/gc/query-commitment`

### 秘密共享

- `POST /api/v1/audit/secret-sharing/split`

### 纵向联邦学习

- `POST /api/v1/vfl/train`
- `POST /api/v1/vfl/verify`
- `GET /api/v1/vfl/audit/query?audit_id=...`
- `GET /api/v1/vfl/audit/query?task_id=...`

## 5. 混淆电路使用流程

1. 银行调用 `generate-task`。
2. 返回混淆电路、哈希和任务 ID。
3. 数据中心调用 `evaluate`。
4. 返回输出结果和审计摘要。
5. 审计记录自动上链。

## 6. 秘密共享使用流程

1. 调用 `secret-sharing/split`，传入秘密、门限和份额数。
2. 返回 share 列表和编码结果。
3. 服务自动写入统一审计合约。

## 7. 验证

运行：

```bash
cd app/service/mpc
GOMODCACHE=$PWD/.gomodcache GOCACHE=$PWD/.gocache go test ./crypto/vfl ./tests/unit/crypto ./contracts/vfl_audit ./server -count=1
```

## 8. 纵向联邦学习调用示例

训练：

```bash
curl -s -X POST http://localhost:8091/api/v1/vfl/train \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "vfl_task_001",
    "model_id": "risk_lr_v1",
    "participants": ["BANK001", "DC001"],
    "epochs": 4,
    "learning_rate": 0.05,
    "datasets": [
      {
        "party_id": "BANK001",
        "features": [[0.20, 0.10], [0.80, 0.70], [0.40, 0.20], [0.90, 0.85]],
        "labels": [0, 1, 0, 1]
      },
      {
        "party_id": "DC001",
        "features": [[0.30], [0.90], [0.45], [0.95]]
      }
    ]
  }'
```

注意：训练本地计算会成功，但上链审计步骤在 ChainMaker 节点不可达时会返回 500。

验证：

```bash
curl -s -X POST http://localhost:8091/api/v1/vfl/verify \
  -H "Content-Type: application/json" \
  -d '{"training_proof": { ... 使用训练响应中的 training_proof ... }}'
```

完整 HTTP 功能测试：

```bash
cd app/service/mpc
./test_vfl_flow.sh
```

该脚本要求服务可访问、`vfl_audit` 合约已部署且 ChainMaker SDK 配置有效。

## 9. 样例输入文件

可直接调用的样例输入位于：

```text
data/sample_inputs/
```

- `vfl_train_500.json`：500 条 VFL 样本，可直接作为 `/api/v1/vfl/train` 请求体。
- `mpc_secret_sharing_500.jsonl`：500 条秘密共享输入，每行一个请求体。
- `mpc_gc_generate_500.jsonl`：500 条混淆电路任务生成输入，每行一个请求体。
