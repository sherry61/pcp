# MPC 与可验证纵向联邦学习技术说明

## 1. 运行逻辑

服务入口为 `server/main.go`。启动时完成：

1. 读取配置并初始化 ChainMaker 客户端。
2. 初始化 CP-ABE、ZKP、IT-MAC、审计客户端。
3. 注册用户授权、数据中心、银行、审计和隐私计算路由。
4. 当启用混淆电路时，银行侧生成任务，数据中心侧执行评估。
5. 纵向联邦学习训练生成可复算证明，验证结果写入 `vfl_audit` 合约。
6. MPC 审计结果统一写入 `gc_audit` 合约。

## 2. 审计系统如何工作

审计由两层组成：

1. 外部审计服务：用于事件创建和日志追加，主要记录流程态。
2. 链上审计合约：用于保存可复核摘要，保证结果可追溯且不可篡改。

统一的链上审计记录使用 `StoreComputationAudit`：

- `record_id`
- `task_id`
- `method`
- `artifact_root`
- `input_root`
- `output_root`
- `status`
- `verifier`
- `details`

## 3. 审计结果如何上链

当前代码将三类隐私计算结果上链：

1. 混淆电路：写入电路摘要、输入承诺摘要、输出审计摘要。
2. 秘密共享：写入分享集合摘要、原始秘密摘要、编码结果摘要。
3. 纵向联邦学习：写入数据集指纹、每轮训练证明根、模型哈希和链上验证结果。

对应合约方法：

- `StoreCircuitCommitment`
- `StoreComputationAudit`
- `QueryCircuitCommitment`
- `QueryComputationAudit`

## 4. 长安链合约编写与调用

### 编写

合约基于 ChainMaker `contract-sdk-go/v2`，入口为：

- `InitContract`
- `UpgradeContract`
- `InvokeContract`

状态读写使用：

- `sdk.Instance.GetArgs()`
- `sdk.Instance.PutStateByte(...)`
- `sdk.Instance.GetStateByte(...)`

### 调用

服务端通过 SDK 客户端调用：

- `InvokeContract(contractName, method, ...)`
- `QueryContract(contractName, method, ...)`

当前项目中主要合约名为 `gc_audit`、`authorization`、`verification`。
纵向联邦学习新增合约名为 `vfl_audit`。

## 5. 混淆电路审计逻辑

银行侧：

1. 生成贷款评估电路。
2. 混淆电路并序列化。
3. 计算电路哈希，作为链上承诺。
4. 写入审计事件。

数据中心侧：

1. 取回混淆电路。
2. 结合银行输入标签和本地输入标签执行评估。
3. 生成输入承诺哈希和输出审计摘要。
4. 写入统一计算审计记录。

## 6. 秘密共享审计逻辑

新增 `ShamirSecretSharing`：

1. 对秘密进行 `(t,n)` 门限切分。
2. 生成 share 列表。
3. 用编码后的 share 集合作为链下工件。
4. 将 share 集合摘要写入 `StoreComputationAudit`。

恢复时用任意 `t` 个 share 重构秘密。

## 7. 测试状态

核心 VFL 训练、SGX simulation 隐私证明验证、链上合约编译和服务编译已通过：

```bash
cd app/service/mpc
GOMODCACHE=$PWD/.gomodcache GOCACHE=$PWD/.gocache go test ./crypto/vfl ./tests/unit/crypto ./contracts/vfl_audit ./server -count=1
```

## 8. 可验证纵向联邦学习

纵向联邦学习采用确定性纵向逻辑回归作为最小完整实现：

1. 多个参与方按样本顺序纵向拼接特征。
2. 仅一个参与方提供标签。
3. 训练端以固定精度整数执行每轮梯度更新，默认不把梯度明文写入证明。
4. `proof_root` 由所有轮次哈希、`dataset_root` 和 `model_hash` 组成。
5. 验证端重新计算每轮哈希、SGX simulation report、损失单调性、最终模型哈希和证明根。
6. 链上 `vfl_audit` 合约再次执行同样的证明校验，校验失败则拒绝写入审计记录。

验证不是硬判定：任一轮次哈希、权重更新、最终权重、模型哈希或 proof root 被篡改都会失败。

### 8.1 SGX simulation 下的隐私保护审计

本机使用 Intel SGX SDK simulation 模式作为可模拟启动环境。VFL 默认启用梯度保护：

1. 每轮梯度只在 `protectedGradientStep` 内部生成并参与权重更新。
2. 训练证明不再公开 `gradient` 明文。
3. 每轮证明公开 `gradient_commitment`、`weights_before`、`weights_after`、`loss_scaled` 和 `enclave_report`。
4. `enclave_report` 绑定任务、模型、轮次、权重更新、梯度承诺、损失和学习率，并由 SGX simulation attestation key 签名。
5. 本地验证和链上合约都重新验证 report 签名、payload hash、轮次连续性、模型哈希和 `proof_root`。

这个方案的审计含义是：审计方可以确认权重更新由受保护梯度步骤确认，且证明未被篡改；但审计方不能从链上证明直接读取梯度明文。

兼容旧证明：设置环境变量 `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true` 时，训练证明会回退到公开梯度明文的旧格式。

## 9. VFL 合约方法

- `StoreVFLProof`：保存训练证明摘要和完整证明 JSON，保存前先链上复算证明。
- `VerifyVFLProof`：链上复算证明并写入审计结果。
- `QueryVFLAudit`：按 `audit_id` 查询链上验证记录。
- `QueryVFLProof`：按 `task_id` 查询训练证明记录。
