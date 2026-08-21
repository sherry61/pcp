# 交易 433：HE 审计提交失败问题报告

## 1. 摘要

交易系统处理交易 `433` 的同态加密（HE）交付时，PCC 已完成 Paillier 密文聚合，但在向外部审计服务提交 HE 证据时失败：

```text
POST http://10.112.47.214:8020/prov/jobs/he
HTTP 400 Bad Request
```

根因是 PCC 输出的真实 Paillier 密文编码及聚合语义，与 8020 服务当前的 HE 证据解析和审计电路不兼容。

## 2. 影响范围

- 受影响交易：`433`
- 来源合同：`CONTRACT-433`
- PCC 合同：`PCC_HE_20260821064701_0IKECU60`
- PCC attempt：`ATT_20260821064701_YRF1059B`
- 计算模式：`PAILLIER_ADD`
- 最终状态：`FAILED`
- 结果：PCC 未创建 PAM job，买方不会获得 HE 结果下载 token。

PRE、FL 链路在同一环境中可完成 PAM 提交；该问题集中在 HE 通过 `8020` 外部审计服务的路径。

## 3. 复现与观测结果

PCC worker 日志显示：

```text
POST http://10.112.47.214:8020/prov/events  -> 200
POST http://10.112.47.214:8020/prov/jobs/he -> 400
```

PCC 查询到的合同信息：

```json
{
  "method": "HE",
  "contract_params": {
    "he_compute_mode": "PAILLIER_ADD",
    "csv_format": "SINGLE_CIPHER_COLUMN"
  },
  "seller_ids": [
    "<seller-address>#file1",
    "<seller-address>#file2"
  ]
}
```

本次证据文件的非敏感结构检查结果：

```json
{
  "schema_version": "he-evidence-v1",
  "method": "HE",
  "he_compute_mode": "PAILLIER_ADD",
  "seller_input_count_per_sample": 2,
  "sample_count": 4,
  "cipher_prefix": "pai1",
  "cipher_payload_length": 683,
  "cipher_payload_is_decimal": false,
  "cipher_payload_is_base64url": true
}
```

因此，本问题不是卖方输入数量不足、证据 schema 缺失或交易文件未上传导致的。

## 4. 根因一：密文编码解析不兼容（本次 HTTP 400 的直接原因）

8020 当前代码将密文中 `pai1.` 后的内容按十进制大整数解析：

```js
const payload = str.includes('.') ? str.split('.').pop() : str;
return String(BigInt(payload.trim()));
```

该实现仅适用于类似以下的玩具样例：

```text
pai1.100
```

但 PCC 的真实 Paillier 密文格式为：

```text
pai1.<base64url-no-padding-fixed-width-ciphertext>
```

交易 433 的每个密文负载均为 683 字符的 Base64URL 字符串，不是十进制数字。8020 在执行 `BigInt(payload)` 时会抛出异常，随后接口返回：

```text
HTTP 400
message: invalid he evidence: Cannot convert ... to a BigInt
```

PCC 当前的 HTTP client 对非 2xx 响应直接调用 `raise_for_status()`，未将响应体 `message` 写入日志，因此上层只得到泛化的 `400 Bad Request`。

## 5. 根因二：HE 审计计算语义不兼容（解析修复后的后续阻塞）

8020 当前 `cipher_add_audit` 的验证关系是普通整数加法：

```text
y = a + b
```

真实 Paillier 的“明文加法”在密文域中的聚合关系是：

```text
C_out = (C_1 × C_2 × ... × C_n) mod n²
```

因此，仅将 Base64URL 密文解码为整数不足以恢复链路。若继续用 `y = a + b` 验证真实 Paillier 密文，审计结果仍会失败。

## 6. 建议修改

### 6.1 8020：支持 PCC 的 Paillier 密文格式

将 `pai1.<base64url>` 负载进行 Base64URL 解码，并按无符号大端整数转换；不能使用 `BigInt(字符串)` 直接解析。

同时应校验：

- 密文前缀为 `pai1`；
- Base64URL 无填充格式合法；
- 解码长度与 PCC 公钥参数匹配；
- 密文值满足 Paillier 密文域范围。

### 6.2 8020：替换普通整数加法审计电路

`PAILLIER_ADD` 的审计电路/验证器应按 Paillier 密文聚合规则验证：

```text
C_out == Π(C_i) mod n²
```

其中 `n` 应从 PCC evidence 中的 `public_key.params.n` 取得并校验。不得以 `C_out == C_1 + C_2` 替代。

多卖方输入时，应验证所有输入密文的连乘结果，而不仅是前两个输入。

### 6.3 PCC：保留下游错误响应体

PCC 调用 8020 失败时，应记录/返回受控的下游错误码和 message，例如：

```text
HE_EXTERNAL_AUDIT_REJECTED: invalid he evidence: <reason>
```

这样交易系统可以区分证据格式错误、摘要不匹配、事件不存在和审计计算失败，而不只看到 `400 Bad Request`。

## 7. 修复验收标准

使用交易 433 同等格式的数据，满足以下标准即视为修复完成：

1. `POST /prov/jobs/he` 对 `he-evidence-v1` + `pai1.<base64url>` 返回 HTTP 200；
2. 返回有效的 `PAM_job_id`，PCC attempt 进入 `PAMING`，不再是 `FAILED`；
3. 审计器使用 `C_out = Π(C_i) mod n²` 验证 Paillier 聚合，而不是普通整数相加；
4. 2 个和 3 个卖方输入的 HE 样例均能通过；
5. 非法 Base64URL、错误前缀、错误模数和伪造输出均被拒绝，并返回明确错误码；
6. PCC 日志能保留下游 8020 的受控错误详情，但不记录原始密文或密钥材料。

## 8. 责任边界

- PCC 当前已正确生成 `he-evidence-v1`，并将证据作为 multipart 的 `he_sample_evidence` 附件提交；
- 8020 当前服务实现接受了旧式十进制玩具密文样例，但无法解析 PCC 真实 Paillier Base64URL 密文；
- 双方需共同确认最终的 HE evidence 编码与 Paillier 聚合验证契约，并将其固化为端到端回归测试。
