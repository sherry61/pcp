# PCP API 文档

## 0. 通用约定

### 0.1 基本信息

| 项目      | 值                                     |
| ------- | ------------------------------------- |
| 服务      | PCP Backend                           |
| 默认地址    | `http://127.0.0.1:8123`               |
| OpenAPI | `GET /openapi.json`                   |
| 请求体格式   | JSON 或 `multipart/form-data`，以各接口说明为准 |

### 0.2 统一响应结构

除下载接口直接返回文件流外，业务接口统一返回：

```json
{
  "code": 0,
  "message": "OK",
  "data": {}
}
```

合同类接口的 `data` 通常包含：

```json
{
  "contract_id": "HE_TASK_1234567890ABCDEF",
  "source_contract_id": "external-contract-001",
  "status": "QUEUED",
  "result": null,
  "last_error": null
}
```

字段说明：

| 字段                   | 类型             | 说明                                                             |
| -------------------- | -------------- | -------------------------------------------------------------- |
| `contract_id`        | string         | PCP 生成的内部合同 ID。调用方不能在创建接口中指定，后续状态查询、计算提交、上传 batch 均使用该值。       |
| `source_contract_id` | string         | 外部系统合同 ID。创建 FL/HE/PRE 合同时必填，用于把 PCP 内部 `contract_id` 关联回外部合同。 |
| `status`             | string         | 当前状态。FL/HE/PRE 共同状态见下文。                                        |
| `result`             | null           | 当前对外状态接口不返回结果地址、MinIO URL 或下载 token。                           |
| `last_error`         | string \| null | 失败原因。仅失败或异常场景可能有值。                                             |

状态可选值：

| 状态              | 含义                                |
| --------------- | --------------------------------- |
| `NOT_EXIST`     | 查询的合同不存在。状态查询接口以正常响应返回该状态。        |
| `CREATED`       | 合同已创建，尚未进入计算。                     |
| `WAITING_INPUT` | 等待参与方提交材料或输入。                     |
| `QUEUED`        | 计算任务已入队。                          |
| `RUNNING`       | 计算任务执行中。                          |
| `COMPLETED`     | 任务完成。结果 token 通过通知机制下发，不通过状态接口返回。 |
| `FAILED`        | 任务失败。查看 `last_error`。             |
| `AUDIT_FAILED`  | 审计或校验失败。                          |

### 0.3 Header 与签名

状态类读接口至少需要 `x-entity-id`，当 `security.signature_required=true` 时状态类读接口也需要签名 Header。下载接口是例外，只校验 `download_token` 和 `x-entity-id`。

写接口必须携带：

| Header        | 必填    | 说明                                                                        |
| ------------- | ----- | ------------------------------------------------------------------------- |
| `x-entity-id` | 是     | 当前调用方实体 ID。创建合同时必须等于 `buyer_id`；写入 seller 资源时必须等于对应 seller ID。            |
| `x-timestamp` | 是     | Unix 秒级时间戳。允许偏差由 `security.timestamp_skew_seconds` 配置，默认 `300` 秒。         |
| `x-nonce`     | 是     | 防重放随机串。同一 `x-entity-id` 下不能在 `security.nonce_ttl_seconds` 内重复，默认 `300` 秒。 |
| `x-signature` | 视配置而定 | 当 `security.signature_required=true` 时必填；默认配置为 `false`。                   |

签名串格式：

```text
METHOD
PATH_WITH_QUERY
X_ENTITY_ID
X_TIMESTAMP
X_NONCE
```

示例：

```text
POST
/he/calculate
buyer_001
1710000000
n-001
```

签名值：

```text
hex(hmac_sha256(signature_secret, canonical_string))
```

说明：

- `PATH_WITH_QUERY` 必须包含查询字符串，例如 `/download/token?x=1`。
- `METHOD` 使用大写 HTTP 方法。
- multipart 请求不计算 body hash。
- 写接口会校验 timestamp、nonce，并在开启签名时校验 `x-signature`。

常见鉴权错误：

| HTTP 状态码 | 原因                                |
| -------- | --------------------------------- |
| `400`    | timestamp 超出允许偏差、nonce 重复、参数格式错误。 |
| `401`    | 缺少签名或签名不正确。                       |
| `403`    | 实体不是合同参与方，或无权访问该资源。               |
| `404`    | 合同或任务不存在。                         |
| `409`    | 已完成合同不允许再次计算或写入。                  |
| `429`    | 触发限流。                             |

### 0.4 下载与结果获取

计算完成后，系统通过配置的通知机制下发结果 token。调用方拿到 token 后，统一使用：

```http
GET /download/{download_token}
x-entity-id: receiver_entity_id
```

下载接口会同时校验 token 和 `x-entity-id`，只有 token 绑定的接收方可以下载。

token 配置：

| 配置项                          | 环境变量                             | 默认值                         | 说明             |
| ---------------------------- | -------------------------------- | --------------------------- | -------------- |
| `download.token_secret`      | `PCP_DOWNLOAD_TOKEN_SECRET`      | `dev-download-token-secret` | token HMAC 密钥。 |
| `download.token_ttl_seconds` | `PCP_DOWNLOAD_TOKEN_TTL_SECONDS` | `3600`                      | token 有效期，单位秒。 |
| `download.token_notify_url`  | `PCP_DOWNLOAD_TOKEN_NOTIFY_URL`  | 空                           | 结果 token 通知地址。 |

### 0.5 客户端安全边界

PCP Backend 不下发 `security.signature_secret`、`download.token_secret`、TEE 私钥、HE 私钥、PRE 原始对称密钥。调用方必须自行管理这些敏感材料。

接口层面的安全约束：

| 材料                            | PCP API 行为                                      | 调用方要求                                     |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `security.signature_secret`   | 只用于服务端验签，不通过 API 返回。                            | 调用方生成 `x-signature` 时必须使用与服务端一致的密钥。       |
| `download.token_secret`       | 只用于服务端生成和验证下载 token，不通过 API 返回。                 | 调用方只使用通知中的 `download_token`，不能自行伪造 token。 |
| TEE 公钥                        | 通过 `/fl/tee-materials`、`/pre/tee-materials` 返回。 | 调用方用该公钥封装发给 TEE 的加密包。                     |
| TEE 私钥                        | 不通过 API 返回。                                     | 调用方不能依赖 API 获取 TEE 私钥。                    |
| HE 私钥                         | 不通过 API 接收或返回。                                  | 调用方自行保存 HE 私钥，并在下载结果后自行解密。                |
| PRE 原始 `aes_key` / `hmac_key` | 不通过 API 接收明文，只接收封装后的 `key_package`。             | 调用方自行生成和保存原始密钥。                           |

### 0.6 API 能力边界

PCP Backend 当前不提供以下对外接口：

| 能力              | 当前 API 行为                                                          |
| --------------- | ------------------------------------------------------------------ |
| 合同列表查询          | 不提供列表接口。创建接口返回 `contract_id` 后，由调用方自行保存。                           |
| 主动结果查询          | 不提供 `/result` 类主动查询接口。结果 token 只通过 `download.token_notify_url` 通知。 |
| 下载 token 重发     | 不提供对外 token 重发接口。                                                  |
| 明文模型或 tensor 生成 | 不提供。FL 只接收已封装的加密包。                                                 |
| HE 解密           | 不提供。HE 结果文件中仍是同态密文结果。                                              |
| PRE 原始密钥管理      | 不提供。PRE 只接收 hex 编码的 sealed `key_package`。                          |

### 0.7 通用错误响应

业务成功响应统一为 `{code:0,message:"OK",data:{...}}`。错误响应分三类：

| 来源                    | 响应示例                                                                                                     | 调用方处理                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| 下载接口                  | `{"code":"DOWNLOAD_TOKEN_EXPIRED","message":"Download token expired","data":null}`                       | 使用 `code` 做精确提示。         |
| 显式业务错误                | `{"detail":"Only the buyer can create this HE contract"}`                                                | 展示 `detail`。             |
| Pydantic/FastAPI 参数错误 | `{"detail":[{"loc":["body","source_contract_id"],"msg":"field required","type":"value_error.missing"}]}` | 根据 `loc` 和 `msg` 定位参数错误。 |

### 0.8 加密包格式

FL 输入包、FL 结果包和 PRE 结果包采用同一套加密包格式。上传时调用方提交 3 个文件，下载时 PCP 返回 tar，tar 内包含 4 个文件。

上传文件：

| 文件                | 类型     | 内容                                          |
| ----------------- | ------ | ------------------------------------------- |
| `cipher.bin`      | binary | AES-GCM 密文。实现中 AESGCM 返回值包含密文和 16 字节认证 tag。 |
| `wrapped_key.bin` | binary | 使用接收方 RSA 公钥包装后的 32 字节 AES DEK。             |
| `meta.json`       | JSON   | 解密元数据，结构见下表。                                |

`meta.json` 结构：

```json
{
  "version": 1,
  "payload_alg": "AES-256-GCM",
  "wrapped_key_alg": "RSA-OAEP-SHA256",
  "iv": "base64-12-byte-iv",
  "content_type": "torchscript",
  "recipient_type": "TEE",
  "recipient_key_id": "tee-key-current",
  "producer_id": "buyer_001",
  "task_id": "SRC_001",
  "batch_index": null
}
```

字段说明：

| 字段                 | 必填 | 说明                                                                                                                            |
| ------------------ | -- | ----------------------------------------------------------------------------------------------------------------------------- |
| `version`          | 是  | 当前固定为 `1`。                                                                                                                    |
| `payload_alg`      | 是  | 固定为 `AES-256-GCM`。                                                                                                            |
| `wrapped_key_alg`  | 是  | 固定为 `RSA-OAEP-SHA256`。RSA 公钥是 PEM bytes；API 返回的是 PEM bytes 的 hex。                                                             |
| `iv`               | 是  | base64 编码的 12 字节 GCM nonce。                                                                                                   |
| `content_type`     | 是  | 业务内容类型。FL top model 使用 `torchscript`；bottom model 可用 `model-bytes`；smashed/label 使用 `safetensors`；PRE key package 可使用业务自定义标记。 |
| `recipient_type`   | 是  | 接收方类型。上传给 TEE 的包填 `TEE`；面向 seller 的结果包由系统生成。                                                                                  |
| `recipient_key_id` | 是  | 接收方 key 标识。TEE 材料接口返回 `key_id`，当前通常是 `tee-key-current`。                                                                       |
| `producer_id`      | 是  | 生产者 ID，通常是当前 `entity_id` 或外部合同 ID。                                                                                            |
| `task_id`          | 是  | 创建前尚无 PCP `contract_id` 时，建议填 `source_contract_id`；创建后可填 PCP `contract_id`。                                                   |
| `batch_index`      | 否  | FL batch 序号；非 batch 包填 `null`。                                                                                                |

调用方封装步骤：

1. 调用 `/fl/tee-materials` 或 `/pre/tee-materials` 获取 `public_key`。
2. 将 hex 字符串转为 PEM bytes。
3. 随机生成 32 字节 AES key 和 12 字节 IV。
4. 使用 AES-256-GCM 加密明文，得到 `cipher.bin`。
5. 使用 RSA-OAEP-SHA256 和 TEE 公钥加密 AES key，得到 `wrapped_key.bin`。
6. 按上表生成 `meta.json`。

下载 `encrypted_tar` 后，tar 内 `manifest.json` 只包含系统内部 S3 URI；解密实际使用 `cipher.bin`、`wrapped_key.bin`、`meta.json`。业务侧若需要解密结果，必须使用 token 接收方自己的私钥解开 `wrapped_key.bin`，再用 AES-GCM 解开 `cipher.bin`。

### 0.9 结果通知 payload

当 `download.token_notify_url` 配置非空时，PCP 会向该 URL 发送：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "FL_TASK_1234567890ABCDEF",
    "source_contract_id": "SRC_001",
    "status": "COMPLETED",
    "result": {
      "type": "encrypted_tar",
      "format": "tar",
      "result_uri": "s3://pcp-assets/...",
      "download_token": "...",
      "filename": "top_model.tar"
    },
    "last_error": null,
    "receiver_id": "buyer_001",
    "receiver_role": "buyer",
    "result_role": "fl_top_model",
    "batch_index": 0
  }
}
```

通知字段：

| 字段                      | 说明                                                  |
| ----------------------- | --------------------------------------------------- |
| `receiver_id`           | 该 token 绑定的下载实体。下载时必须用同一个值作为 `x-entity-id`。         |
| `receiver_role`         | `buyer` 或 `seller`。PRE 结果固定以 `buyer` 角色通知。 |
| `result_role`           | 结果类型。可见下表。                                          |
| `batch_index`           | FL batch 结果有值；HE/PRE 通常为 `null` 或缺省。                |
| `result.download_token` | 下载 token。状态查询接口不会返回该值。                              |
| `result.result_uri`     | 内部对象 URI，只用于审计或排查，调用方不要直接访问。                        |

`result_role` 可选值：

| result\_role      | 接收方           | result.type     | filename                     |
| ----------------- | ------------- | --------------- | ---------------------------- |
| `he_result`       | HE buyer      | `file`          | `result.json` 或 `result.csv` |
| `fl_bottom_model` | FL seller     | `encrypted_tar` | `bottom_model.tar`           |
| `fl_gradient`     | FL seller     | `encrypted_tar` | `gradient.tar`               |
| `fl_top_model`    | FL buyer      | `encrypted_tar` | `top_model.tar`              |
| `pre_result`      | PRE buyer     | `encrypted_tar` | `pre_result.tar`             |

## 1. 下载接口

### `GET /download/{download_token}`

根据结果 token 下载单文件或加密 tar 包。

请求参数：

| 位置     | 参数               | 类型     | 必填 | 说明                                        |
| ------ | ---------------- | ------ | -- | ----------------------------------------- |
| Path   | `download_token` | string | 是  | 系统通知给接收方的下载 token。                        |
| Header | `x-entity-id`    | string | 是  | 下载接收方实体 ID，必须等于 token 内绑定的 `receiver_id`。 |

响应：

| token 类型        | HTTP 响应                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------- |
| `file`          | 文件流，`Content-Disposition` 文件名来自存储对象名，例如 `result.json` 或 `result.csv`。                         |
| `encrypted_tar` | `application/x-tar` 文件流，tar 内固定包含 `manifest.json`、`cipher.bin`、`wrapped_key.bin`、`meta.json`。 |

错误响应格式：

```json
{
  "code": "DOWNLOAD_TOKEN_EXPIRED",
  "message": "Download token expired",
  "data": null
}
```

错误码：

| HTTP 状态码 | code                               | 说明                                |
| -------- | ---------------------------------- | --------------------------------- |
| `401`    | `DOWNLOAD_ENTITY_REQUIRED`         | 缺少 `x-entity-id`。                 |
| `403`    | `DOWNLOAD_ACCESS_DENIED`           | 当前实体不是 token 绑定的接收方。              |
| `403`    | `DOWNLOAD_TOKEN_MALFORMED`         | token 格式错误。                       |
| `403`    | `DOWNLOAD_TOKEN_SIGNATURE_INVALID` | token 签名错误。                       |
| `403`    | `DOWNLOAD_TOKEN_EXPIRED`           | token 已过期。                        |
| `403`    | `DOWNLOAD_TOKEN_PAYLOAD_INVALID`   | token payload 缺少必要字段或字段值非法。       |
| `404`    | `DOWNLOAD_OBJECT_NOT_FOUND`        | token 指向的对象不存在。                   |
| `500`    | `DOWNLOAD_MANIFEST_INVALID`        | 加密包 manifest 不是合法 JSON 或缺少对象 URI。 |
| `502`    | `DOWNLOAD_STORAGE_UNAVAILABLE`     | 存储服务不可用或读取失败。                     |

## 2. FL 接口

FL 使用纵向联邦学习 split learning 流程。buyer 创建合同并上传加密 top/bottom model；seller 加入后获取为自己重封装的 bottom model；seller 上传 batch package 后，达到合同要求的 seller 数量会触发异步聚合。

### 2.0 FL 调用流程

buyer 侧：

1. 调用 `GET /fl/tee-materials` 获取 TEE 公钥。
2. 使用 TEE 公钥封装 top model、bottom model 两个加密包。
3. 调用 `POST /fl/contract` 创建合同，保存返回的 `contract_id`。
4. 轮询 `GET /fl/{contract_id}/status` 展示状态。
5. 从业务后端接收 `result_role=fl_top_model` 的通知，用 `download_token` 下载 top model 结果包。

seller 侧：

1. 准备 seller 自己的 RSA 公钥，hex 编码后作为 `seller_public_key`。
2. 调用 `POST /fl/{contract_id}/join` 加入合同。
3. 使用响应中的 `bottom_model_package.download_token` 下载 bottom model 包，并用 seller 私钥解密。
4. seller 本地计算 smashed data 和 label，分别封装为加密包。
5. 调用 `POST /fl/{contract_id}/batch` 上传 batch。
6. 从业务后端接收 `result_role=fl_gradient` 的通知，用 token 下载 gradient 包。

FL 加密包 `content_type` 建议：

| 场景           | content\_type | 明文内容                               |
| ------------ | ------------- | ---------------------------------- |
| top model    | `torchscript` | TorchScript 模型 bytes。              |
| bottom model | `model-bytes` | bottom model bytes。                |
| smashed data | `safetensors` | safetensors bytes，内部 key 为 `data`。 |
| label        | `safetensors` | safetensors bytes，内部 key 为 `data`。 |

注意：PCP 不负责生成模型或 tensor。TorchScript、safetensors 和加密包封装由调用方完成。

### 2.1 获取 TEE 材料

#### `GET /fl/tee-materials`

获取 FL 侧用于本地封装加密包的 TEE 公钥和证明材料。

请求参数：无。

响应示例：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "mode": "SIM",
    "key_id": "tee-key-current",
    "public_key": "hex-public-key",
    "attestation": "{\"mrenclave\":\"...\"}"
  }
}
```

字段说明：

| 字段            | 类型     | 说明                        |
| ------------- | ------ | ------------------------- |
| `mode`        | string | TEE 运行模式，来自部署配置，例如 `SIM`。 |
| `key_id`      | string | TEE 当前公钥标识。               |
| `public_key`  | string | hex 编码的 TEE 公钥。           |
| `attestation` | string | TEE 证明材料，字符串形式。           |

### 2.2 创建 FL 合同

#### `POST /fl/contract`

由 buyer 创建 FL 合同并上传初始加密模型包。`x-entity-id` 必须等于表单中的 `buyer_id`。

Content-Type：`multipart/form-data`

Header：写接口公共 Header。

表单参数：

| 参数                              | 类型     | 必填 | 默认值            | 说明                                                                   |
| ------------------------------- | ------ | -- | -------------- | -------------------------------------------------------------------- |
| `buyer_id`                      | string | 是  | 无              | buyer 实体 ID，必须等于 `x-entity-id`。                                      |
| `source_contract_id`            | string | 是  | 无              | 外部系统合同 ID。任何创建场景都必须传，用于把 PCP 生成的 `contract_id` 关联回外部合同。              |
| `seller_ids`                    | string | 是  | 无              | 允许加入的 seller 列表，使用英文逗号分隔，例如 `seller_001,seller_002`。不能包含 `buyer_id`。 |
| `max_epochs`                    | int    | 否  | `10`           | 最大训练轮数元数据。当前接口保存该值，异步计算按任务实现使用。                                      |
| `learning_rate`                 | float  | 否  | `0.001`        | SGD 学习率。                                                             |
| `batch_size`                    | int    | 否  | `32`           | batch size 元数据。                                                      |
| `loss_function`                 | string | 否  | `CrossEntropy` | 损失函数。有效值：`CrossEntropy`、`MSE`、`BCE`；其他值当前会在计算端回退为 `CrossEntropy`。    |
| `dp_noise_scale`                | float  | 否  | `0.0`          | 差分隐私噪声尺度。`0` 表示不加噪声。                                                 |
| `dp_clipping_threshold`         | float  | 否  | `1.0`          | 梯度裁剪阈值，仅在 `dp_noise_scale > 0` 时参与计算。                                |
| `buyer_result_public_key`       | string | 是  | 无              | hex 编码的 buyer 结果公钥，用于加密 top model 结果。                                |
| `top_model_cipher_file`         | file   | 是  | 无              | top model 加密包的密文文件。                                                  |
| `top_model_wrapped_key_file`    | file   | 是  | 无              | top model 加密包的封装密钥文件。                                                |
| `top_model_meta_file`           | file   | 是  | 无              | top model 加密包元数据 JSON。                                               |
| `bottom_model_cipher_file`      | file   | 是  | 无              | bottom model 加密包的密文文件。                                               |
| `bottom_model_wrapped_key_file` | file   | 是  | 无              | bottom model 加密包的封装密钥文件。                                             |
| `bottom_model_meta_file`        | file   | 是  | 无              | bottom model 加密包元数据 JSON。                                            |

说明：

- `required_sellers` 不是对外请求参数。它是系统内部保存的聚合阈值，表示同一个 batch 需要多少个 seller 上传完成后才触发 FL 聚合；当前实现固定等于 `seller_ids` 解析后的数量。
- 创建接口不接受 `contract_id`，系统生成并返回。
- 只接收加密 package，不接收明文模型。

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "FL_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "WAITING_INPUT",
    "result": null,
    "last_error": null
  }
}
```

主要错误：

| HTTP 状态码 | 场景                                               |
| -------- | ------------------------------------------------ |
| `400`    | `seller_ids` 为空，或 `buyer_id` 出现在 `seller_ids` 中。 |
| `403`    | `x-entity-id` 与 `buyer_id` 不一致。                  |

### 2.3 seller 加入 FL 合同

#### `POST /fl/{contract_id}/join`

seller 加入合同，并获取为该 seller 重封装的 bottom model 下载包。`x-entity-id` 作为 seller ID。

Content-Type：`multipart/form-data`

Header：写接口公共 Header。

请求参数：

| 位置   | 参数                  | 类型     | 必填 | 说明                                    |
| ---- | ------------------- | ------ | -- | ------------------------------------- |
| Path | `contract_id`       | string | 是  | FL 合同 ID，例如 `FL_TASK_...`。            |
| Form | `seller_public_key` | string | 是  | hex 编码的 seller 公钥，用于重封装 bottom model。 |

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "FL_TASK_1234567890ABCDEF",
    "seller_id": "seller_001",
    "status": "JOINED",
    "mode": "SIM",
    "key_id": "tee-key-current",
    "attestation": "{\"mrenclave\":\"...\"}",
    "public_key": "hex-public-key",
    "bottom_model_package": {
      "download_token": "...",
      "format": "tar",
      "type": "encrypted_tar",
      "filename": "bottom_model.tar"
    }
  }
}
```

字段说明：

| 字段                                    | 类型     | 说明                                                                                                          |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `bottom_model_package.download_token` | string | seller 下载 bottom model package 的 token。下载时使用 `GET /download/{download_token}` 并携带当前 seller 的 `x-entity-id`。 |
| `bottom_model_package.format`         | string | 文件格式，当前为 `tar`。                                                                                             |
| `bottom_model_package.type`           | string | 结果类型，当前为 `encrypted_tar`。                                                                                   |
| `bottom_model_package.filename`       | string | 建议下载文件名。                                                                                                    |

主要错误：

| HTTP 状态码 | 场景                                                                                           |
| -------- | -------------------------------------------------------------------------------------------- |
| `404`    | 合同不存在，或 seller 不在创建合同时声明的 `seller_ids` 中。                                                    |
| `404`    | 当前实现会把合同不存在、seller 不在允许列表、合同已完成、`seller_public_key` 为空等 join 业务错误统一转为 404，并在 `detail` 中返回原因。 |

### 2.4 上传 seller batch package

#### `POST /fl/{contract_id}/batch`

已加入合同的 seller 上传某一 batch 的 smashed data 和 label 加密包。达到合同所需 seller 数量后，系统触发异步聚合。

Content-Type：`multipart/form-data`

Header：写接口公共 Header。`x-entity-id` 必须是已加入该合同的 seller。

请求参数：

| 位置   | 参数                         | 类型     | 必填 | 说明                                  |
| ---- | -------------------------- | ------ | -- | ----------------------------------- |
| Path | `contract_id`              | string | 是  | FL 合同 ID。                           |
| Form | `batch_index`              | int    | 是  | batch 序号，同时作为 seller 当前本地 epoch 记录。 |
| Form | `smashed_cipher_file`      | file   | 是  | smashed data 加密包密文文件。               |
| Form | `smashed_wrapped_key_file` | file   | 是  | smashed data 封装密钥文件。                |
| Form | `smashed_meta_file`        | file   | 是  | smashed data 元数据 JSON。              |
| Form | `label_cipher_file`        | file   | 是  | label 加密包密文文件。                      |
| Form | `label_wrapped_key_file`   | file   | 是  | label 封装密钥文件。                       |
| Form | `label_meta_file`          | file   | 是  | label 元数据 JSON。                     |

成功响应：HTTP `202`

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "FL_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "QUEUED",
    "result": null,
    "last_error": null,
    "batch_index": 1
  }
}
```

主要错误：

| HTTP 状态码 | 场景                    |
| -------- | --------------------- |
| `403`    | seller 未 join。        |
| `404`    | 合同不存在。                |
| `400`    | 合同已完成，或 seller 公钥未注册。 |

### 2.5 查询 FL 状态

#### `GET /fl/{contract_id}/status`

查询 FL 合同状态。buyer 或创建合同时声明的 seller 可以查询。

Header：

| Header                                    | 必填    | 说明                                        |
| ----------------------------------------- | ----- | ----------------------------------------- |
| `x-entity-id`                             | 是     | buyer ID 或允许的 seller ID。                  |
| `x-timestamp` / `x-nonce` / `x-signature` | 视配置而定 | 当 `security.signature_required=true` 时必填。 |

请求参数：

| 位置   | 参数            | 类型     | 必填 | 说明        |
| ---- | ------------- | ------ | -- | --------- |
| Path | `contract_id` | string | 是  | FL 合同 ID。 |

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "FL_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "RUNNING",
    "result": null,
    "last_error": null,
    "current_epoch": 1
  }
}
```

说明：

- `current_epoch` 表示当前全局 epoch/batch 进度。
- 不存在的合同返回 `status=NOT_EXIST`，不是 HTTP 404。
- 状态接口不返回结果下载 token。结果 token 通过通知机制发送。

## 3. HE 接口

HE 支持同态加密计算。当前算法和操作可选值来自配置：

| 配置项                     | 默认可选值                |
| ----------------------- | -------------------- |
| `he.allowed_enc_types`  | `Paillier`、`ElGamal` |
| `he.allowed_operations` | `ADD`、`MUL`          |

### 3.0 HE 调用流程与数据格式

HE 调用流程：

1. 业务后端或受控客户端生成 HE 公私钥。
2. 调用 `POST /he/contract` 创建合同，保存 `contract_id`。
3. inline 模式调用 `POST /he/calculate`；CSV 模式调用 `POST /he/calculate_csv`。
4. 轮询 `GET /he/{contract_id}/status` 展示状态。
5. 从业务后端接收 `result_role=he_result` 的通知，下载 `result.json` 或 `result.csv`。
6. 调用方使用 HE 私钥解密计算结果。PCP 不保存也不返回私钥。

Paillier 格式：

| 项                            | 格式                                                                      |
| ---------------------------- | ----------------------------------------------------------------------- |
| `public_keys`                | `{"n":"...","g":"..."}` 或 `{"n":123,"g":456}`；服务端会转为整数。                 |
| inline `cipher1` / `cipher2` | 十进制整数字符串，例如 `"123456789"`。                                              |
| CSV 输入                       | 任意表头均可，服务端读取每行第一列作为密文整数。推荐表头 `cipher`。                                  |
| CSV 输出                       | 表头为 `result`，每行是结果密文整数。                                                 |
| `ADD`                        | 两个密文相加。                                                                 |
| `MUL`                        | 第一个参数是密文，第二个参数会作为标量参与 Paillier homomorphic multiply；当前接口字段仍叫 `cipher2`。 |

ElGamal 格式：

| 项                            | 格式                                               |
| ---------------------------- | ------------------------------------------------ |
| `public_keys`                | `{"p":"...","g":"...","y":"..."}` 或整数值；服务端会转为整数。 |
| inline `cipher1` / `cipher2` | JSON 数组字符串，例如 `"[123,456]"`。                     |
| CSV 输入                       | 必须包含 `c1,c2` 两列。                                 |
| CSV 输出                       | 表头为 `c1,c2`。                                     |
| 支持操作                         | 当前只支持 `MUL`。即使配置中有 `ADD`，ElGamal 执行 `ADD` 也会失败。  |

inline HE 结果文件 `result.json` 格式：

```json
{
  "contract_id": "HE_TASK_1234567890ABCDEF",
  "status": "success",
  "result": "123456789",
  "timestamp": 1710000000
}
```

ElGamal inline 的 `result` 是 JSON 数组字符串，例如 `"[123,456]"`。CSV HE 结果直接下载 `result.csv`。

### 3.1 创建 HE 合同

#### `POST /he/contract`

由 buyer 创建 HE 合同。`x-entity-id` 必须等于 body 中的 `buyer_id`。

Content-Type：`application/json`

Header：写接口公共 Header。

Body 参数：

| 参数                   | 类型             | 必填 | 默认值    | 说明                                                      |
| -------------------- | -------------- | -- | ------ | ------------------------------------------------------- |
| `buyer_id`           | string         | 是  | 无      | buyer 实体 ID，必须等于 `x-entity-id`。                         |
| `source_contract_id` | string         | 是  | 无      | 外部系统合同 ID。任何创建场景都必须传，用于把 PCP 生成的 `contract_id` 关联回外部合同。 |
| `seller_ids`         | string\[]      | 否  | `[]`   | 参与该 HE 合同的 seller ID 列表，仅记录参与方关系。                       |
| `operation_type`     | string         | 是  | 无      | 合同声明的计算操作。默认配置有效值：`ADD`、`MUL`。服务端按大写保存。                 |
| `enc_type`           | string         | 是  | 无      | 加密算法。默认配置有效值：`Paillier`、`ElGamal`。大小写必须与配置一致。           |
| `data_type_1`        | string \| null | 否  | `null` | 第一个输入的数据类型标记，系统只保存不解析。                                  |
| `data_type_2`        | string \| null | 否  | `null` | 第二个输入的数据类型标记，系统只保存不解析。                                  |

请求示例：

```json
{
  "buyer_id": "buyer_001",
  "source_contract_id": "external-contract-001",
  "seller_ids": ["seller_001"],
  "operation_type": "ADD",
  "enc_type": "Paillier",
  "data_type_1": "ciphertext",
  "data_type_2": "ciphertext"
}
```

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "HE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "CREATED",
    "result": null,
    "last_error": null
  }
}
```

### 3.2 提交 inline HE 计算

#### `POST /he/calculate`

提交两个 inline 密文进行 HE 计算。只允许合同 buyer 调用。

Content-Type：`application/json`

Header：写接口公共 Header。

Body 参数：

| 参数            | 类型     | 必填 | 说明                                            |
| ------------- | ------ | -- | --------------------------------------------- |
| `contract_id` | string | 是  | HE 合同 ID。                                     |
| `cipher1`     | string | 是  | 第一个密文，字符串格式由对应算法实现解析。                         |
| `cipher2`     | string | 是  | 第二个密文，字符串格式由对应算法实现解析。                         |
| `operation`   | string | 是  | 计算操作。默认配置有效值：`ADD`、`MUL`。服务端按大写写入任务 manifest。 |
| `enc_type`    | string | 是  | 加密算法。默认配置有效值：`Paillier`、`ElGamal`。            |
| `public_keys` | object | 是  | 计算所需公钥集合，服务端保存为 JSON。具体结构由算法实现使用。             |

请求示例：

```json
{
  "contract_id": "HE_TASK_1234567890ABCDEF",
  "cipher1": "ciphertext-a",
  "cipher2": "ciphertext-b",
  "operation": "ADD",
  "enc_type": "Paillier",
  "public_keys": {
    "n": "..."
  }
}
```

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "HE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "QUEUED",
    "result": null,
    "last_error": null
  }
}
```

主要错误：

| HTTP 状态码 | 场景                                  |
| -------- | ----------------------------------- |
| `400`    | `enc_type` 或 `operation` 不在配置允许列表中。 |
| `403`    | 当前实体不是合同 buyer。                     |
| `404`    | HE 合同不存在。                           |
| `409`    | 已完成合同不能再次计算。                        |

### 3.3 提交 CSV HE 计算

#### `POST /he/calculate_csv`

上传两个 CSV 密文文件进行 HE 计算。只允许合同 buyer 调用。

Content-Type：`multipart/form-data`

Header：写接口公共 Header。

表单参数：

| 参数      | 类型     | 必填 | 说明              |
| ------- | ------ | -- | --------------- |
| `data`  | string | 是  | JSON 字符串，结构见下表。 |
| `file1` | file   | 是  | 第一个 CSV 密文文件。   |
| `file2` | file   | 是  | 第二个 CSV 密文文件。   |

`data` JSON 字段：

| 字段            | 类型     | 必填 | 说明                            |
| ------------- | ------ | -- | ----------------------------- |
| `contract_id` | string | 是  | HE 合同 ID。                     |
| `operation`   | string | 是  | 默认配置有效值：`ADD`、`MUL`。          |
| `enc_type`    | string | 是  | 默认配置有效值：`Paillier`、`ElGamal`。 |
| `public_keys` | object | 是  | 计算所需公钥集合。                     |

`data` 示例：

```json
{
  "contract_id": "HE_TASK_1234567890ABCDEF",
  "operation": "ADD",
  "enc_type": "Paillier",
  "public_keys": {
    "n": "..."
  }
}
```

成功响应与 `/he/calculate` 相同。

### 3.4 查询 HE 状态

#### `GET /he/{contract_id}/status`

查询 HE 合同状态。仅合同 buyer 可查询。

Header：

| Header                                    | 必填    | 说明                                        |
| ----------------------------------------- | ----- | ----------------------------------------- |
| `x-entity-id`                             | 是     | HE 合同 buyer ID。                           |
| `x-timestamp` / `x-nonce` / `x-signature` | 视配置而定 | 当 `security.signature_required=true` 时必填。 |

请求参数：

| 位置   | 参数            | 类型     | 必填 | 说明        |
| ---- | ------------- | ------ | -- | --------- |
| Path | `contract_id` | string | 是  | HE 合同 ID。 |

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "HE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "COMPLETED",
    "result": null,
    "last_error": null
  }
}
```

说明：

- 不存在的合同返回 `status=NOT_EXIST`。
- 结果下载 token 不通过状态接口返回，由通知机制下发后使用 `/download/{download_token}` 下载。

## 4. PRE 接口

PRE 使用代理重加密流程。buyer 创建合同并指定唯一 seller；seller 上传加密后的源文件三件套和 sealed `key_package`；buyer 提交自己的 `buyer_public_key` 触发重加密。结果 token 通过通知机制下发给 buyer。

### 4.0 PRE 调用流程、材料归属与 key\_package 格式

PRE 是“seller 授权 buyer 解开 seller 数据密钥”的流程。TEE 公钥只用于封装密钥，不是源文件内容加密密钥；源文件内容加密密钥由 seller 自己生成或持有。

材料归属：

| 材料 | 谁准备 | 给谁/传到哪里 | 用途 |
| --- | --- | --- | --- |
| TEE `public_key` | PCP/TEE 生成，接口返回 | seller 通过 `GET /pre/tee-materials` 获取 | seller 用它封装 `aes_key`、`hmac_key`，让 TEE 可解包。 |
| TEE 私钥 | PCP/TEE 内部持有 | 不通过 API 返回 | TEE 内部解开 seller 上传的 `key_package`。 |
| 源文件明文 | seller 持有 | 不上传 PCP | 原始数据，PCP 不接收明文。 |
| `aes_key` | seller 本地生成或持有 | 不明文上传 | 源文件内容加密密钥。 |
| `hmac_key` | seller 本地生成或持有 | 不明文上传 | 当前 PRE package 协议要求的完整性/认证材料；即使业务侧只用 AES-GCM，当前接口仍要求该 part。 |
| `source_cipher_file` | seller 生成 | `POST /pre/publish` 文件字段 | seller 已加密后的源文件密文。 |
| `source_wrapped_key_file` | seller 生成 | `POST /pre/publish` 文件字段 | 源文件加密包中的封装密钥文件，格式与通用加密包一致。 |
| `source_meta_file` | seller 生成 | `POST /pre/publish` 文件字段 | 源文件加密包元数据 JSON。 |
| `key_package` | seller 生成 | `POST /pre/publish` 表单字段 | seller 用 TEE 公钥封装后的 `aes_key`、`hmac_key` 二进制包，再 hex 编码。 |
| buyer 私钥 | buyer 本地生成并保存 | 不上传 PCP | buyer 下载结果后解开重加密后的密钥。 |
| `buyer_public_key` | buyer 从自己的密钥对导出 | `POST /pre/re-encrypt` body 字段 | TEE 用它把 `aes_key`、`hmac_key` 重封装给 buyer。 |
| `pre_result.tar` | PCP/TEE 生成 | 通过 `download_token` 给 buyer 下载 | 内含重加密后的 key package 加密包。 |

PRE 调用流程：

1. seller 调用 `POST /pre/contract` 创建 PRE 合同，`seller_ids` 必须且只能包含一个 seller，保存返回的 `contract_id`。
2. seller 调用 `GET /pre/tee-materials` 获取 TEE `public_key`。
3. seller 本地生成或持有源文件加密用的 `aes_key` 和 `hmac_key`。
4. seller 在本地加密源文件，生成 `source_cipher_file`、`source_wrapped_key_file`、`source_meta_file` 三个文件；PCP 不接收源文件明文。
5. seller 使用 TEE `public_key` 分别 RSA-OAEP-SHA256 加密 `aes_key`、`hmac_key`。
6. seller 按 `key_package` 二进制格式打包，并 hex 编码。
7. seller 调用 `POST /pre/publish` 上传 `key_package` 和源密文三件套。
8. buyer 准备自己的 RSA 密钥对，保存私钥，将公钥 PEM bytes hex 编码为 `buyer_public_key`。
9. buyer 调用 `POST /pre/re-encrypt` 提交 `buyer_public_key` 并触发重加密。
10. buyer 从业务后端接收 `result_role=pre_result` 的通知，使用 `/download/{download_token}` 下载 `pre_result.tar`。

`key_package` 二进制格式：

```text
uint64_le part_count
uint64_le part_1_length
uint64_le part_2_length
...
part_1_bytes
part_2_bytes
...
```

当前 PRE 至少需要两个 part：

| part        | 内容                                         |
| ----------- | ------------------------------------------ |
| `part_1`    | 使用 TEE 公钥 RSA-OAEP-SHA256 加密后的 `aes_key`。  |
| `part_2`    | 使用 TEE 公钥 RSA-OAEP-SHA256 加密后的 `hmac_key`。 |
| `part_3...` | 可选业务尾部数据，系统会原样保留并放入重加密后的 package。          |

`key_package` 请求字段是上述二进制 package 的 hex 字符串。`buyer_public_key` 是 buyer PEM 公钥 bytes 的 hex 字符串。

PRE 结果包下载后仍是加密包 tar。系统会把 `aes_key`、`hmac_key` 从 TEE 公钥重加密到 buyer 公钥，buyer 使用自己的私钥解开。

### 4.1 创建 PRE 合同

#### `POST /pre/contract`

由 buyer 创建 PRE 合同。`x-entity-id` 必须等于 body 中的 `buyer_id`。

Content-Type：`application/json`

Header：写接口公共 Header。

Body 参数：

| 参数                   | 类型        | 必填 | 默认值 | 说明                                                      |
| -------------------- | --------- | -- | --- | ------------------------------------------------------- |
| `buyer_id`           | string    | 是  | 无   | buyer 实体 ID，必须等于 `x-entity-id`。                         |
| `source_contract_id` | string    | 是  | 无   | 外部系统合同 ID。任何创建场景都必须传，用于把 PCP 生成的 `contract_id` 关联回外部合同。 |
| `seller_ids`         | string\[] | 是  | 无   | PRE 必须且只能有一个 seller。不能为空，不能包含 `buyer_id`。               |

请求示例：

```json
{
  "buyer_id": "buyer_001",
  "source_contract_id": "external-contract-001",
  "seller_ids": ["seller_001"]
}
```

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "PRE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "CREATED",
    "result": null,
    "last_error": null
  }
}
```

主要错误：

| HTTP 状态码  | 场景                                       |
| --------- | ---------------------------------------- |
| `400/422` | `seller_ids` 不是唯一 seller，或包含 `buyer_id`。 |
| `403`     | `x-entity-id` 与 `buyer_id` 不一致。          |

### 4.2 获取 PRE TEE 材料

#### `GET /pre/tee-materials`

获取 PRE key package 封装使用的 TEE 公钥和证明材料。

请求参数：无。

响应示例：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "mode": "SIM",
    "key_id": "tee-key-current",
    "public_key": "hex-public-key",
    "attestation": {
      "mrenclave": "..."
    }
  }
}
```

字段说明：

| 字段            | 类型            | 说明                            |
| ------------- | ------------- | ----------------------------- |
| `mode`        | string        | TEE 运行模式。                     |
| `key_id`      | string        | TEE 当前公钥标识。                   |
| `public_key`  | string        | hex 编码公钥。                     |
| `attestation` | object/string | TEE 证明材料，取决于 SGX daemon 返回内容。 |

### 4.3 发布 key package

#### `POST /pre/publish`

由合同唯一 seller 上传源文件加密包和被 TEE 公钥封装后的 `key_package`。PCP 不接收外部对象地址，调用方不能用对象地址替代文件上传。

Content-Type：`multipart/form-data`

Header：写接口公共 Header。

Form 参数：

| 参数                        | 类型     | 必填 | 说明                                                   |
| ------------------------- | ------ | -- | ---------------------------------------------------- |
| `contract_id`             | string | 是  | PRE 合同 ID。                                           |
| `key_package`             | string | 是  | hex 编码的 sealed key package。服务端会 `bytes.fromhex` 后保存。 |
| `source_cipher_file`      | file   | 是  | seller 已加密源文件的密文文件。                                  |
| `source_wrapped_key_file` | file   | 是  | 源文件加密包的封装密钥文件。                                       |
| `source_meta_file`        | file   | 是  | 源文件加密包元数据 JSON。                                      |

请求示例：

```text
contract_id=PRE_TASK_1234567890ABCDEF
key_package=A1B2C3...
source_cipher_file=@source.cipher
source_wrapped_key_file=@source.wrapped
source_meta_file=@source.meta.json
```

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "PRE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "WAITING_INPUT",
    "result": null,
    "last_error": null
  }
}
```

主要错误：

| HTTP 状态码 | 场景                       |
| -------- | ------------------------ |
| `403`    | 当前实体不是该 PRE 合同唯一 seller。 |
| `404`    | PRE 合同不存在。               |
| `409`    | 已完成合同不能再次写入。             |

### 4.4 提交重加密任务

#### `POST /pre/re-encrypt`

buyer 提交自己的公钥并触发重加密任务。必须先由 seller 完成 `/pre/publish`。

Content-Type：`application/json`

Header：写接口公共 Header。

Body 参数：

| 参数                 | 类型     | 必填 | 说明                                         |
| ------------------ | ------ | -- | ------------------------------------------ |
| `contract_id`      | string | 是  | PRE 合同 ID。                                 |
| `buyer_public_key` | string | 是  | hex 编码的 buyer 公钥。服务端会 `bytes.fromhex` 后保存。 |

请求示例：

```json
{
  "contract_id": "PRE_TASK_1234567890ABCDEF",
  "buyer_public_key": "A1B2C3..."
}
```

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "PRE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "QUEUED",
    "result": null,
    "last_error": null
  }
}
```

主要错误：

| HTTP 状态码 | 场景                               |
| -------- | -------------------------------- |
| `400`    | key package 或 seller 源文件加密包尚未发布。 |
| `403`    | 当前实体不是该 PRE 合同 buyer。            |
| `404`    | PRE 合同不存在。                       |
| `409`    | 已完成合同不能再次计算。                     |

### 4.5 查询 PRE 状态

#### `GET /pre/{contract_id}/status`

查询 PRE 合同状态。buyer 或合同唯一 seller 可查询。

Header：

| Header                                    | 必填    | 说明                                        |
| ----------------------------------------- | ----- | ----------------------------------------- |
| `x-entity-id`                             | 是     | buyer 或合同唯一 seller 的实体 ID。                |
| `x-timestamp` / `x-nonce` / `x-signature` | 视配置而定 | 当 `security.signature_required=true` 时必填。 |

请求参数：

| 位置   | 参数            | 类型     | 必填 | 说明         |
| ---- | ------------- | ------ | -- | ---------- |
| Path | `contract_id` | string | 是  | PRE 合同 ID。 |

成功响应：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "PRE_TASK_1234567890ABCDEF",
    "source_contract_id": "external-contract-001",
    "status": "COMPLETED",
    "result": null,
    "last_error": null
  }
}
```

说明：

- 不存在的合同返回 `status=NOT_EXIST`。
- 结果下载 token 不通过状态接口返回，由通知机制下发后使用 `/download/{download_token}` 下载。

## 5. 废弃/不存在的旧接口

以下旧路径或旧语义当前代码中不存在，不应再对接：

| 旧接口                                       | 当前替代                           |
| ----------------------------------------- | ------------------------------ |
| `/federate/task/tee-materials`            | `GET /fl/tee-materials`        |
| `/federate/task/init`                     | `POST /fl/contract`            |
| `/federate/task/{task_id}/join`           | `POST /fl/{contract_id}/join`  |
| `/federate/task/{task_id}/forward_upload` | `POST /fl/{contract_id}/batch` |
| `/federate/task/{task_id}/status`         | `GET /fl/{contract_id}/status` |
| `/pre/tee-pub-key`                        | `GET /pre/tee-materials`       |
| `/he/{contract_id}/result`                | 无。结果 token 通过通知机制下发。           |
| `/pre/{contract_id}/result`               | 无。结果 token 通过通知机制下发。           |
| `/fl/{contract_id}/download_gradient`     | 无。结果 token 通过通知机制下发。           |
| `/fl/{contract_id}/download_top_model`    | 无。结果 token 通过通知机制下发。           |
