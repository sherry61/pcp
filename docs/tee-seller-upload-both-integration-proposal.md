# TEE v2“卖方上传 data 和 weight”改造建议

## 1. 目标流程

业务目标：买方只申请交付并获取结果，卖方负责向 TEE 提交两个输入文件。

```text
买方申请交付
  → 买方生成结果密钥对并下载私钥
  → 提交结果公钥并绑定交易
  → 创建 VM
  → 启动 VM
  → 等待服务部署完成
  → 卖方上传 data.csv
  → 卖方上传 weight.csv
  → TEE 执行计算
  → 买方获取并本地解密结果
```

其中 data 和 weight 的业务含义可以是：

- `data.csv`：待计算的数据集；
- `weight.csv`：模型权重或评分公式参数。

## 2. 当前源码和接口的限制

根据当前对接源码：

- `receive-key` 服务从请求中读取 `ecPublicKey`，返回使用该公钥加密的密钥信封；
- `receive-file` 接收 `iv` 和 `ciphertext`，在 VM 内解密并缓存 data/weight；
- 当两个文件都收到后，TEE 自动计算并把加密结果缓存在内存；
- `get-result` 只按 `vmId` 获取结果密文；
- 当前结果加密使用的是 weight 上传流程关联的密钥。

因此，如果卖方同时调用 `receive-key(data)` 和 `receive-key(weight)`，结果密钥将由卖方持有，买方无法用自己的私钥解密结果。

## 3. 必须新增的结果密钥机制

结果密钥必须在买方点击“申请交付”时生成，而不是等 VM 服务部署完成后再生成。这样买方即使关闭浏览器，结果公钥也已绑定交易；后续卖方可以独立完成上传和计算，买方最后用已下载的私钥文件解密结果。

### 3.1 买方在申请交付时生成密钥对

买方浏览器在请求交付之前生成 P-256 ECDH 密钥对：

```text
resultPublicKey  → 提交给后端/TEE
resultPrivateKey → 只导出给买方保存，不上传
```

建议文件名：

```text
tee-result-key-{transactionId}.pem
```

### 3.2 在申请交付接口中提交公钥

建议直接扩展现有申请接口：

```http
POST /api/privacy/tee/request
```

请求增加：

```json
{
  "transactionId": "465",
  "resultPublicKey": "-----BEGIN PUBLIC KEY-----..."
}
```

后端在创建 VM 之前持久化该公钥，并绑定到 `transactionId`。申请成功后，前端立即下载私钥文件；之后 VM 创建、服务部署及卖方上传均不应依赖买方页面保持打开。

### 3.3 可选的独立接口

如果无法扩展申请接口，也可以提供独立接口，但必须在创建 VM 前调用：

```http
POST /api/prepare-result-key
```

请求：

```json
{
  "vmId": "a5264d004c2ef46c",
  "resultPublicKey": "-----BEGIN PUBLIC KEY-----..."
}
```

返回：

```json
{
  "code": 200,
  "vmId": "a5264d004c2ef46c",
  "resultKeyStatus": "READY"
}
```

TEE 必须按 `transactionId` 保存该公钥，并在 VM 创建完成后绑定到对应 `vmId`；计算完成时使用它加密结果。

如果不希望新增接口，也可以在 `receive-file` 或 `get-result` 增加字段，但必须明确结果公钥属于买方，并在计算开始前保存：

```json
{
  "resultPublicKey": "..."
}
```

不建议等 `get-result` 时才提交公钥，因为结果可能已经按错误密钥生成。

## 4. 卖方上传两个文件的接口约定

卖方按以下顺序调用：

```text
receive-key(data)
→ receive-file(data)
→ receive-key(weight)
→ receive-file(weight)
```

两个请求都应允许：

```json
{
  "vmId": "...",
  "ecPublicKey": "卖方公钥",
  "fileType": "data 或 weight",
  "role": "seller",
  "name": "data.csv 或 weight.csv"
}
```

对方服务需要明确：

1. `role=seller` 可以连续上传 data 和 weight；
2. `receive-key(weight)` 只要求 data 已被 TEE 成功接收；
3. 两个文件必须按 `vmId` 隔离，不能使用全局缓存；
4. `receive-file` 成功响应必须代表文件已经完成解密、校验并写入 TEE 内部状态。

### 4.1 顺序约束与容错要求

当前源码会在 `receive-key(weight)` 时检查 TEE 内部是否已经存在 data，因此以下顺序仍是服务内部的必要前置条件：

```text
receive-key(data)
→ receive-file(data)
→ receive-key(weight)
→ receive-file(weight)
```

这不意味着前端必须因为一次时序竞争直接失败。建议对方服务和平台后端增加以下容错能力：

1. `receive-key(data)` 重复调用时返回幂等成功，或返回同一文件阶段的有效密钥信封；
2. `receive-file(data)` 重复调用时返回当前 data 状态，不应破坏已接收文件；
3. 在 data 尚未完成时调用 `receive-key(weight)`，返回明确的可重试状态和预计等待信息，而不是让前端永久失败；
4. 平台后端可以暂存 weight 请求，待 data 返回 `data_ready=true` 后自动重试；
5. data 上传失败时，状态回退为 `DATA_UPLOAD_FAILED`，允许重新上传；
6. weight 上传失败时，状态回退为 `WEIGHT_UPLOAD_FAILED`，允许重新上传；
7. 只有远端确认 `data_ready=true` 后，才允许进入 weight 密钥协商；
8. 同一 `vmId` 和 `fileType` 必须有请求互斥锁，避免轮询与按钮点击并发提交。

因此建议将“严格的内部顺序”和“宽容的外部交互”分开：前端可以连续提交两个文件，但服务端负责排队、等待、幂等和重试；不能直接允许 weight 在 data 尚未进入 TEE 时执行，因为现有虚机源码不支持真正的乱序处理。

## 5. 结果加密和返回格式

计算完成后，TEE 使用买方提交的 `resultPublicKey` 加密结果。

建议 `get-result` 返回：

```json
{
  "code": 200,
  "vmId": "...",
  "seq": 1,
  "resultKeyType": "buyer-result-key",
  "ephPub": "...",
  "salt": "...",
  "nonce": "...",
  "tag": "...",
  "ciphertext": "..."
}
```

推荐采用现有密钥信封格式：

```text
ECDH(resultPrivateKey, ephPub)
→ HKDF/SHA-256 派生 AES 密钥
→ AES-GCM 解密结果密文
```

平台前端使用买方本地保存的私钥解密，不能把结果明文发送回后端。

## 6. 服务端状态要求

建议提供：

```http
GET /api/status?vmId=...
```

返回至少包含：

```json
{
  "vmId": "...",
  "serviceReady": true,
  "dataReady": true,
  "weightReady": true,
  "computed": true,
  "resultReady": true,
  "lastError": null
}
```

平台数据库状态不能替代 TEE 内部状态。只有远端明确返回 `dataReady=true` 后，平台才能把 data 标记为 `RECEIVED`。

## 7. 幂等、重试和错误语义

建议所有接口支持重复请求和明确错误码：

| 场景 | 建议错误码 | 平台处理 |
|---|---:|---|
| VM 未就绪 | 40902 | 等待后重试 |
| data 尚未接收 | 40901 | 禁止 weight，要求重传 data |
| 文件已存在 | 40903 | 返回当前文件状态，不重复计算 |
| VM 不匹配 | 40904 | 拒绝请求并记录错误 |
| 计算失败 | 50020 | 状态置为计算失败，可重新上传 |

`receive-file` 必须做到：

```text
远端处理成功 → 返回成功 → 平台更新 RECEIVED
远端处理失败 → 返回失败 → 平台更新 *_UPLOAD_FAILED
```

不能出现“平台显示 RECEIVED，但 TEE 内部没有文件”的情况。

## 8. VM 和资源隔离要求

结合现有 v2 脚本的固定 QMP、VNC 和端口配置，对方主机还需要：

1. 同一时间只运行允许数量的 VM；
2. 创建新 VM 前检查旧 VM 是否已 stop/delete；
3. `stop_vm.sh` 后释放 QEMU、HugePages、VTKM/TKM 资源和端口；
4. `delete_vm.sh` 后清理 VM 内部 data、weight、result 状态；
5. 网关必须按 `vmId` 将请求转发到正确 VM；
6. 禁止旧 VM 的缓存被新 VM 读取；
7. 服务重启后应返回明确的 `serviceReady=false`，而不是继续接受业务请求。

## 9. 前端需要配合的改动

对接方完成上述接口后，平台前端流程为：

1. 买方请求交付；
2. VM 服务就绪后，买方生成并下载结果私钥文件；
3. 买方结果公钥提交到后端；
4. 卖方点击“执行交付”，依次选择并上传 data.csv、weight.csv；
5. 前端轮询 TEE 状态；
6. 结果就绪后，买方选择私钥文件；
7. 浏览器本地解密并下载明文结果。

前端必须避免：

- 轮询与按钮并发上传同一个文件；
- 在 `dataReady` 之前调用 `receive-key(weight)`；
- 只依据本地 row 状态判断文件是否已上传；
- 私钥未找到时直接下载不可解密的密文 JSON。

## 10. 对接方需要确认的问题

请对方确认以下事项：

1. 是否可以新增 `prepare-result-key` 接口？
2. TEE 是否支持使用买方 `resultPublicKey` 加密结果？
3. 是否允许同一卖方连续上传 data 和 weight？
4. `receive-file` 返回成功是否代表文件已写入 TEE 内部？
5. 是否可以提供按 `vmId` 查询 data/weight/result 的状态接口？
6. VM 重启后 data、weight、result 是否会丢失？
7. 多 VM 同时存在时，网关如何保证请求路由隔离？
8. `50004`、`40901` 等错误码的完整含义和恢复方式是什么？

## 11. 结论

“卖方上传 data 和 weight、买方最终下载明文结果”在业务上可行，但不能只修改前端角色字段。必须由 TEE 服务增加独立的买方结果公钥机制，并保证 VM 状态隔离、文件确认、幂等重试和资源清理。

最小改造集合是：

```text
买方结果公钥接口
→ 卖方允许上传两个文件
→ TEE 使用买方结果公钥加密结果
→ get-result 返回可由买方私钥解密的密文
```
