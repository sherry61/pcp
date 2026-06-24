# HE ElGamal 审计失败问题说明

## 结论

交易 `304` 的 `HE + ElGamal + MUL` 链路已经可以从交易系统成功提交到 `PCC`，`PCC` 也已经成功完成同态计算并生成结果文件。

当前失败点不在交易系统前后端，也不在 `PCC` 的 HE 计算逻辑，而在 `PAM` 对 `ElGamal HE evidence` 的解析仍停留在旧格式，导致审计阶段返回：

- `INVALID_EVIDENCE`
- 进而在 `PCC` 侧表现为 `PAM_FAILED`

## 本次复现信息

- 交易号：`304`
- PCC 合同：`PCC_HE_20260624041726_AKOWGIII`
- PCC attempt：`ATT_20260624042031_L6T6QPNH`
- PAM job：`AUD_HE_20260624042031_43637b81`

## 现象

交易系统后端提交 `ElGamal + MUL` 后，状态从 `QUEUED` 进入：

- `PAM_FAILED`

进一步查看容器日志：

- `pcc-worker` 已成功完成 HE 计算并生成 `he-result.csv`
- `pam-worker` 将该 job 判定为 `INVALID_EVIDENCE`

对应日志关键信息：

- `pcc-worker`：
  - `Task pcc.jobs.execute ... succeeded`
  - `attempt_id = ATT_20260624042031_L6T6QPNH`
  - `he_compute_mode = ELGAMAL_MUL`
- `pam-worker`：
  - `PAM_job_id = AUD_HE_20260624042031_43637b81`
  - `status = INVALID_EVIDENCE`

## 已确认正常的部分

以下环节已经验证通过：

- 买方 HE 公钥上传成功
- 卖方加密后 CSV 上传成功
- 交易系统后端成功调用 `PCC /he/contract`
- 交易系统后端成功调用 `PCC /he/{contract_id}/attempts`
- `PCC` 成功接受新版 ElGamal 公钥格式
- `PCC` 成功接受新版 ElGamal 密文格式
- `PCC worker` 成功完成 HE 乘法聚合并生成 evidence/result

因此本问题不是交易系统提交流程失败，也不是 `PCC` 计算失败。

## 根因判断

### 1. PCC 侧已经使用新版 ElGamal 公钥/密文契约

`PCC` 当前对 `ElGamal` 的公钥和密文处理要求如下：

- 公钥 `params` 必须为：`p / q / g / y`
- 参数采用 `base64url` 编码整数
- 密文格式为字符串：
  - `eg1.<base64url(c1)>.<base64url(c2)>`

代码位置：

- [app/compute/he.py](/home/super/tr/pcc/app/compute/he.py:101)
- [app/compute/he.py](/home/super/tr/pcc/app/compute/he.py:174)

### 2. 本次 PCC 生成的 evidence 确实是新版格式

`pcc-worker` 生成的 evidence 中：

- `public_key.params.g = "Ag"`
- `public_key.params.p/q/y` 为 `base64url`
- `seller_inputs[].cipher` 为 `eg1...` 字符串
- `PCC_output` 也为 `eg1...` 字符串

也就是说，`PCC` 输出证据与当前 `PCC` 自身的 ElGamal 编解码规范一致。

### 3. PAM 侧 ElGamal verifier 仍按旧格式解析

当前 `PAM` 的 ElGamal verifier 仍然使用旧契约：

- `p` 直接按十进制字符串 `int(raw)` 解析
- 密文要求是对象格式 `{ "c1": "...", "c2": "..." }`

代码位置：

- [app/verifiers/he/elgamal_mul.py](/home/super/tr/pam/app/verifiers/he/elgamal_mul.py:39)
- [app/verifiers/he/elgamal_mul.py](/home/super/tr/pam/app/verifiers/he/elgamal_mul.py:52)

其中：

- `_modulus()` 读取 `params.p` 后直接 `int(raw)`
- `_cipher_pair()` 仅接受 `dict`，且必须包含 `c1/c2`

这与 `PCC` 当前实际产生的 evidence 格式不兼容。

## 直接不兼容点

### 公钥不兼容

`PCC` 提供：

- `params.p = "<base64url>"`
- `params.q = "<base64url>"`
- `params.g = "<base64url>"`
- `params.y = "<base64url>"`

`PAM` 当前期望：

- `p` 是可直接 `int()` 的十进制数字字符串

因此仅公钥解析这一项就已经不兼容。

### 密文不兼容

`PCC` 提供：

- `cipher = "eg1.<c1>.<c2>"`

`PAM` 当前期望：

- `cipher = { "c1": "...", "c2": "..." }`

因此样本输入和 `PCC_output` 都会被 `PAM` 视为非法 evidence。

## 辅助证据

`PAM` 自身测试也仍然体现旧格式假设：

- [tests/verifiers/test_elgamal_mul.py](/home/super/tr/pam/tests/verifiers/test_elgamal_mul.py:1)

测试里：

- 公钥只有 `p/g/y`
- 密文使用 `{c1,c2}`

这和当前 `PCC` 已上线使用的 ElGamal 证据格式不一致。

## 建议修复

建议 `PAM` 侧同步 `PCC` 当前 ElGamal 契约，至少包括以下改动。

### 1. 同步 ElGamal 公钥解析

参考 `PCC`：

- [app/compute/he.py](/home/super/tr/pcc/app/compute/he.py:101)

建议 `PAM`：

- 解析 `schema_version = pcc-he-public-key-v1`
- 要求 `params = { p, q, g, y }`
- 统一按 `base64url` 解码为整数

### 2. 同步 ElGamal 密文解析

参考 `PCC`：

- [app/compute/he.py](/home/super/tr/pcc/app/compute/he.py:174)

建议 `PAM`：

- 支持 `eg1.<c1>.<c2>` 字符串格式
- 对 `c1/c2` 按固定宽度 `base64url` 解码
- 再进行 ElGamal 同态乘法校验

### 3. 升级验证测试

建议同步修改：

- [tests/verifiers/test_elgamal_mul.py](/home/super/tr/pam/tests/verifiers/test_elgamal_mul.py:1)

避免测试继续固化旧格式。

## 当前对交易系统的影响

在 `PAM` 未同步修复前：

- `ElGamal + MUL` 可以成功提交到 `PCC`
- 但审计阶段会因 `INVALID_EVIDENCE` 转为 `PAM_FAILED`
- 因此买卖双方都无法拿到通过审计后的 HE 结果

## 备注

本问题与此前交易系统后端的 `HE_PUBLIC_KEY_INVALID` 不是同一个问题。

此前问题已经修复，修复点是交易系统后端向 `PCC` 发送 ElGamal 公钥时，不能对 `g` 做带前导零的定宽编码。该问题修复后，`PCC` 已能正常创建 attempt。本次剩余问题是 `PAM` 与 `PCC` 的 evidence 契约未同步。
