# TEE v2 买方结果公钥接口约定

## 1. 文档目的

本文只约定一个问题：买方在申请交付时生成结果密钥对，平台把结果公钥交给 TEE；卖方随后上传 `data.csv` 和 `weight.csv`，TEE 计算完成后使用买方结果公钥加密结果，买方用下载保存的私钥解密。

目标流程：

```text
买方生成结果密钥对
→ 买方下载保存 resultPrivateKey
→ 平台申请交付时提交 resultPublicKey
→ 创建/启动 VM
→ 服务就绪后注册 resultPublicKey
→ 卖方 receive-key(data) / receive-file(data)
→ 卖方 receive-key(weight) / receive-file(weight)
→ TEE 使用买方 resultPublicKey 加密结果
→ 买方 get-result 并本地解密
```

## 2. 密钥生成方和时机

### 2.1 谁生成

结果密钥对由平台买方侧生成，推荐在浏览器中生成：

```text
resultPublicKey  → 可以发送到平台后端和 TEE
resultPrivateKey → 只提供给买方下载保存，禁止上传
```

推荐算法和格式：

- 算法：ECDH；
- 曲线：P-256 / `prime256v1`；
- 公钥编码：X.509 SubjectPublicKeyInfo DER，再 PEM 编码；
- 私钥编码：PKCS#8 PEM；
- 文件名：`tee-result-key-{transactionId}.pem`。

### 2.2 什么时候生成

必须在买方点击“申请交付”之前或申请交付动作开始时生成，并在创建 VM 之前提交公钥。不能等 VM 服务部署完成后才生成，否则买方关闭页面后，后续卖方无法让 TEE 知道结果应该加密给谁。

平台后端需要在申请接口中持久化公钥，例如保存到 `delivery_secure_jobs.result_public_key`，并与 `transaction_id` 绑定。私钥不进入后端数据库。

## 3. 申请交付接口改造

建议扩展平台到后端的申请接口：

```http
POST /api/privacy/tee/request
Content-Type: application/json
```

请求增加字段：

```json
{
  "transactionId": "476",
  "buyerAddress": "...",
  "sellerAddress": "...",
  "assetId": "...",
  "vmCpu": 8,
  "vmMemoryMb": 4096,
  "resultPublicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

后端校验要求：

1. `resultPublicKey` 必填；
2. 必须能被 OpenSSL 解析为 EC 公钥；
3. 曲线必须为 P-256；
4. 公钥必须与交易号绑定，不能被其他交易复用；
5. 重复申请同一交易时，公钥不能被无条件覆盖；如需更换，必须显式重置任务和 VM。

申请接口返回：

```json
{
  "success": true,
  "transactionId": "476",
  "resultKeyStatus": "PENDING_VM"
}
```

## 4. TEE 侧新增接口

现有 `receive-key` 是文件密钥接口，不能把它当作结果公钥注册接口。建议在虚机网关（当前为 `18080`）新增：

```http
POST /api/result-key
Content-Type: application/json
```

请求：

```json
{
  "vmId": "a5264d004c2ef46c",
  "transactionId": "476",
  "resultPublicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

返回：

```json
{
  "code": 200,
  "vmId": "a5264d004c2ef46c",
  "transactionId": "476",
  "resultKeyStatus": "READY",
  "resultKeyFingerprint": "sha256:..."
}
```

### 4.1 接口行为要求

1. 必须校验 PEM、EC 类型和 P-256 曲线；
2. 必须同时绑定 `transactionId` 和 `vmId`；
3. 同一交易重复提交完全相同公钥时返回幂等成功；
4. 已经开始计算后禁止无提示更换公钥；
5. 私钥永远不由 TEE 请求，也不由平台上传；
6. 公钥应保存在该 VM 的独立任务上下文中，不能使用跨 VM 全局变量或固定文件；
7. VM 重启后如果结果尚未生成，应能恢复该公钥或返回 `resultKeyStatus=NOT_READY`，不能静默丢失。

### 4.2 VM 尚未就绪时的处理

由于对方接口在 VM 启动后才能访问，平台申请阶段先在后端持久化公钥；VM 进入服务就绪后，平台自动调用 `/api/result-key` 注册。

也可以让 VM 创建接口直接接收 `resultPublicKey`，但必须保证创建、启动、服务部署过程中该字段不会丢失。

## 5. 与文件密钥接口的关系

结果公钥注册和文件密钥申请是两个不同用途：

```text
/api/result-key
    → 注册买方结果公钥

/api/receive-key
    → 为 data/weight 文件生成临时 SM4 文件密钥
```

卖方上传两个文件时，仍按对方现有约束执行：

```text
receive-key(data)
→ receive-file(data)
→ receive-key(weight)
→ receive-file(weight)
```

`receive-key(data)` 和 `receive-key(weight)` 返回的密钥只用于对应文件，不得作为结果解密密钥。

## 6. 计算结果加密约定

当 `receive-file(weight)` 完成且计算成功时，TEE 必须使用已注册的买方 `resultPublicKey` 加密结果。

建议复用现有 HENC2 信封格式：

```text
TEE 生成随机结果对称密钥
→ 使用该密钥加密结果明文（AES-256-GCM）
→ 使用 ECDH(resultPublicKey, TEE ephemeralPrivateKey)
  派生包装密钥
→ 加密结果对称密钥
→ 返回 ephPub、salt、nonce、tag、ciphertext
```

`get-result` 建议返回：

```http
POST /api/get-result
Content-Type: application/json
```

```json
{
  "vmId": "a5264d004c2ef46c",
  "transactionId": "476"
}
```

响应：

```json
{
  "code": 200,
  "vmId": "a5264d004c2ef46c",
  "transactionId": "476",
  "resultKeyType": "buyer-result-public-key",
  "ephPub": "Base64(DER SubjectPublicKeyInfo)",
  "salt": "Base64",
  "nonce": "Base64",
  "tag": "Base64",
  "ciphertext": "Base64"
}
```

买方浏览器使用本地 `resultPrivateKey` 完成 ECDH 派生和 AES-GCM 解密，后端不得代替买方解密，也不得返回明文结果。

## 7. 状态接口约定

建议在 VM 服务中提供：

```http
GET /api/status?vmId=...
```

至少返回：

```json
{
  "vmId": "a5264d004c2ef46c",
  "resultKeyStatus": "READY",
  "dataReady": true,
  "weightReady": true,
  "computed": true,
  "resultReady": true
}
```

平台只有在远端返回 `dataReady=true` 后，才应将 data 标记为已接收；不能只根据 HTTP 200 或本地数据库更新判断。

## 8. 错误码建议

| 场景 | HTTP | code | 含义 |
|---|---:|---:|---|
| 公钥缺失 | 400 | 70001 | 必须提交 resultPublicKey |
| 公钥格式错误 | 400 | 70002 | PEM/DER 无法解析 |
| 曲线不支持 | 400 | 70003 | 只支持 P-256 |
| 交易或 VM 不匹配 | 409 | 70004 | 公钥不能跨任务使用 |
| 结果公钥未注册 | 409 | 70005 | 计算前必须完成注册 |
| 结果密钥已锁定 | 409 | 70006 | 计算开始后不能更换 |
| 结果尚未生成 | 404 | 70007 | 继续等待或轮询 |

## 9. 必须验收的场景

1. 买方生成公钥后立即关闭浏览器，卖方仍能完成 data/weight 上传和计算；
2. 买方重新打开页面并选择已下载私钥，可以解密结果；
3. 重复注册相同公钥不会产生新任务或破坏结果；
4. 两个 VM 同时存在时，结果不会串到另一台 VM；
5. VM 重启或删除后，旧结果公钥、文件和结果不会泄漏给新 VM；
6. data 未确认接收时，weight 请求返回可重试错误，不产生不可恢复状态。

## 10. 最小实现结论

## 11. 源码核对补充（重要）

对 `service_new.tar.gz` 中的 `recv-file/receive-file.c` 和 `get-result/get-result.c` 源码核对后，当前实现的实际行为如下：

1. `receive-key` 生成/解封 SM4 文件密钥，并写入 `recv-key/sm4_key.bin`；
2. `receive-file` 从环境变量 `SM4_KEY_FILE` 指向的文件读取当前 SM4 密钥；
3. data、weight 和结果处理使用的是同一 VM 内的当前 SM4 密钥文件；
4. `receive-file(weight)` 完成计算后，结果缓存在内存中；
5. `get-result` 使用当前 `SM4_KEY_FILE` 通过 SM4-CBC 加密结果，并只返回 `iv` 和 `ciphertext`；
6. 当前源码没有 `resultPublicKey`、结果 ECDH 信封或独立结果密钥接口。

因此，在不修改对方源码的前提下，可以采用以下流程：

```text
卖方 receive-key(data) / receive-file(data)
→ 买方 receive-key(weight) / receive-file(weight)
→ 买方保存 receive-key(weight) 解出的 SM4 密钥
→ 买方 get-result
→ 买方用该 SM4 密钥和 get-result 返回的 iv 解密 ciphertext
```

该方案的前提是 `receive-key(weight)` 和 `receive-file(weight)` 必须连续执行，期间不能再次调用 `receive-key` 覆盖 `SM4_KEY_FILE`。这也解释了为什么接口顺序必须严格保持，以及为什么买方应该持有 weight 阶段的密钥。

如果未来需要让结果使用独立的公钥加密，再实施本文前面规划的 `/api/result-key`；但对当前源码和你的目标流程而言，独立结果公钥不是必需项。

对接方至少需要实现：

```text
1. 申请交付阶段接收并保存 resultPublicKey
2. VM 就绪后按 transactionId + vmId 注册该公钥
3. 计算完成后使用该公钥加密结果
4. get-result 返回买方可以用私钥解密的 HENC2 密文信封
5. 提供 resultKey/data/weight/result 状态和幂等重试
```

仅仅给现有 `receive-key` 增加一个 `role=buyer` 字段，不能解决结果归属问题；必须明确结果公钥注册和结果加密规则。
