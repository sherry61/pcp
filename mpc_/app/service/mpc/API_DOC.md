# MPC 与 VFL 接口文档

Base URL: `http://<host>:8091/api/v1`

统一响应：

```json
{"code":0,"message":"ok","data":{}}
```

## MPC 审计接口

### POST `/bank/gc/generate-task`

银行生成混淆电路任务。

请求：

```json
{"task_id":"gc_task_001","bank_id":"BANK001","threshold":100000,"risk_factor":50}
```

返回 `garbled_circuit`、`circuit_hash`、`num_gates`。

### POST `/datacenter/gc/evaluate`

数据中心评估混淆电路。

请求字段：`task_id`、`datacenter_id`、`user_id`、`income`、`credit_score`、`garbled_circuit`、`auth_ciphertext`、`auth_hash`。

返回 `input_commitment_hash`、`output_value`。

### POST `/audit/gc/verify-execution`

链上记录混淆电路执行验证结果。

请求：

```json
{"task_id":"gc_task_001","num_gates":128}
```

返回 `audit_id`、`verified`、`transaction_id`。

### GET `/audit/gc/query-log?audit_id=<id>`

查询混淆电路审计结果。

## VFL 接口

### POST `/vfl/train`

执行纵向联邦学习训练，生成隐私保护的可验证证明并写入 `vfl_audit` 合约。

默认启用 SGX simulation 梯度保护：训练证明不会公开 `gradient` 明文，而是公开 `gradient_commitment` 和 `enclave_report`。服务启动环境必须存在 Intel SGX SDK simulation runtime。需要兼容旧明文证明时，可设置 `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true`。

请求：

```json
{
  "task_id": "vfl_task_001",
  "model_id": "risk_lr_v1",
  "participants": ["BANK001", "DC001"],
  "epochs": 4,
  "learning_rate": 0.05,
  "datasets": [
    {"party_id":"BANK001","features":[[0.2,0.1],[0.8,0.7]],"labels":[0,1]},
    {"party_id":"DC001","features":[[0.3],[0.9]]}
  ]
}
```

返回：`weights`、`accuracy`、`final_loss`、`dataset_root`、`model_hash`、`proof_root`、`training_proof`、`transaction_id`。

`training_proof.rounds[]` 默认包含：

- `weights_before`
- `gradient_commitment`
- `weights_after`
- `loss_scaled`
- `round_hash`
- `enclave_report`

默认不包含 `gradient` 明文。`enclave_report` 绑定任务、模型、轮次、权重更新、梯度承诺、损失和学习率，用于本地和链上审计验证。

### POST `/vfl/verify`

验证训练证明。本地会验证 proof root、模型哈希、轮次连续性、损失单调性和 SGX simulation report；本地通过后调用链上 `VerifyVFLProof`，由 `vfl_audit` 合约再次复算验证。

请求：

```json
{"training_proof": { "...": "使用 /vfl/train 返回的 training_proof" }}
```

也可请求：

```json
{"task_id":"vfl_task_001"}
```

返回：`audit_id`、`verified`、`dataset_root`、`model_hash`、`proof_root`、`transaction_id`。

### GET `/vfl/audit/query?audit_id=<id>`

查询 VFL 链上验证结果。

### GET `/vfl/audit/query?task_id=<id>`

查询 VFL 链上训练证明记录。
