# PRE 审计失败问题报告：PAM Enclave 私钥缺失

## 1. 问题概述

交易系统对交易 `406` 执行代理重加密（PRE）交付时，PCC 计算任务已成功完成，但 PAM 自动审计最终返回 `PAM_FAILED`。该问题不在交易系统前端、后端请求链路或卖方上传文件校验，而在 PAM 审计运行环境的 Enclave 私钥与已登记密钥标识不一致。

## 2. 复现信息

| 项目 | 值 |
| --- | --- |
| 交易号 | `406` |
| 数字合约 | `CONTRACT-406` |
| PCC PRE 合约 | `PCC_PRE_20260726035642_8LK8W9E1` |
| PCC attempt | `ATT_20260726035644_RZT262HG` |
| PAM 审计任务 | `AUD_PRE_20260726035647_81ce1455` |
| PCC 最终状态 | `PAM_FAILED` |
| PAM 审计状态 | `INVALID_EVIDENCE` |
| 审计报告错误 | `ENCLAVE_KEY_NOT_FOUND` |

## 3. 已确认事实

1. 交易系统通过 `POST /api/privacy/pre/buyer-public-key` 成功提交买方公钥，PCC 成功创建 PRE 合约。
2. 交易系统通过 `POST /api/privacy/pre/publish` 成功提交卖方原始压缩包，PCC 成功创建 attempt，初始状态为 `QUEUED`。
3. PCC worker 日志表明 PRE 计算任务成功完成，并成功向 PAM 提交审计任务：`POST /pam/jobs/pre` 返回 HTTP 200。
4. PAM worker 已执行审计任务，但审计报告为：

```json
{
  "schema_version": "pre-report-v1",
  "status": "INVALID_EVIDENCE",
  "validation_error": "ENCLAVE_KEY_NOT_FOUND"
}
```

5. PAM 审计任务引用的 `enclave_key_id` 是 `PAM-enclave-key-local-005`。
6. PAM 数据库 `enclave_materials` 中存在该 ID，状态为 `ACTIVE`，并登记了对应公钥。
7. PAM 运行时的私钥目录 `/opt/pam/enclave-keys` 映射自宿主机 `/home/super/tr/pam/var/enclave-keys`；当前宿主机目录为空，缺少 `PAM-enclave-key-local-005.pem`。

## 4. 根因

PAM 的 PRE 审计代码会按证据中的 `enclave_key_id` 加载私钥文件：

```text
/opt/pam/enclave-keys/<enclave_key_id>.pem
```

对于本次任务，实际查找路径为：

```text
/opt/pam/enclave-keys/PAM-enclave-key-local-005.pem
```

该私钥文件不存在，因此 PAM 无法解开 PCC 提交的 `wrapped_reencryption_key`，不能执行 PRE 抽样复核，任务被判定为 `INVALID_EVIDENCE`，并回传为 `PAM_FAILED`。

这是密钥物料部署/配置同步问题，不是 PRE 计算逻辑、交易系统接口参数或审计比对算法本身的错误。

## 5. 影响

- 所有引用 `PAM-enclave-key-local-005` 的 PRE 审计任务都会失败。
- 若联邦学习审计也使用相同的 Enclave 私钥标识，对应联邦学习审计同样会受影响。
- 即使 PCC 已正确产出结果包，PAM 未通过前 PCC 仍会将 attempt 标记为失败，交易系统无法发放下载结果。

## 6. 需要对方处理的改动

建议由 PAM/PCC 维护方按以下两种方案之一修复。

### 方案 A：恢复既有私钥

1. 找回与 PAM 数据库中 `PAM-enclave-key-local-005` 公钥严格匹配的私钥。
2. 将私钥以 PEM 格式部署到宿主机：

```text
/home/super/tr/pam/var/enclave-keys/PAM-enclave-key-local-005.pem
```

3. 确保 PAM worker 容器内可读取：

```text
/opt/pam/enclave-keys/PAM-enclave-key-local-005.pem
```

4. 重启 PAM worker 后新建一笔 PRE attempt 验证审计状态可进入 `PAM_PASSED`。

### 方案 B：完整轮换 Enclave 密钥

1. 生成新的 RSA 密钥对。
2. 将新公钥登记到 PAM 的 `enclave_materials`，设置为 `ACTIVE`，并记录新的 `enclave_key_id`。
3. 将相应私钥按 `<新的 enclave_key_id>.pem` 放入 PAM 的 Enclave 私钥挂载目录。
4. 将 PCC 生成 PRE 审计证据时使用的 `enclave_key_id` 和用于封装 `wrapped_reencryption_key` 的公钥同时切换到新密钥。
5. 重启 PCC worker 与 PAM worker，并以新建 attempt 验证。

> 注意：只修改 PAM 数据库、只修改 PCC 配置、或仅生成一个同名但不匹配的新私钥都无法修复。PCC 使用的公钥、PAM 数据库记录的公钥、PAM worker 实际加载的私钥必须属于同一密钥对。

## 7. 建议补强

1. PAM 服务启动时校验所有 `ACTIVE` 的 `enclave_materials` 是否存在对应私钥文件，并在缺失时拒绝启动或输出明确告警。
2. PCC 在创建 PRE attempt 前校验当前 PAM Enclave 密钥可用性，避免计算完成后才暴露审计失败。
3. PAM 在 API/审计状态中透出 `validation_error`，例如 `ENCLAVE_KEY_NOT_FOUND`；当前交易系统只能看到通用的 `PAM_FAILED`，排障成本较高。

