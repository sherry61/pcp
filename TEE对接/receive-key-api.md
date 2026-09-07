# Receive Key 接口对接文档

> 面向前端联调｜依据 `service.tar.gz` 中的 `receive-key.c` 源码整理｜更新日期：2026-08-27

## 1. 接口一览

| 项目 | 值 |
| --- | --- |
| 接口用途 | 获取经过 ECDH + AES-256-GCM 加密的 16 字节 SM4 密钥 |
| Method | `POST` |
| Path | `/api/receive-key` |
| 服务原始地址 | `http://<服务器IP>:28080` |
| Content-Type | `application/json` |
| 认证 | 当前源码未实现 Token/Cookie 鉴权 |
| 请求字段 | `ecPublicKey`：前端生成的 P-256 公钥，PEM 字符串 |
| 成功 HTTP 状态 | `200` |
| 成功业务码 | `200` |

调用流程：

1. 前端临时生成一对 P-256 ECDH 密钥。
2. 将公钥导出为 PEM，通过 `ecPublicKey` 发送给服务端。
3. 服务端返回临时公钥和 AES-GCM 加密参数，所有二进制字段均为标准 Base64。
4. 前端使用自己的临时私钥和服务端临时公钥计算 ECDH 共享秘密。
5. 前端按照本文算法派生 AES-256 密钥并解密 `ciphertext`，得到 16 字节 SM4 密钥。

## 2. 浏览器接入前置条件（重要）

服务当前直接监听 `0.0.0.0:28080`，源码中没有返回 CORS 响应头，也不处理浏览器的 `OPTIONS` 预检请求；同时服务只提供 HTTP。

因此不要让线上浏览器直接请求：

```text
http://<服务器IP>:28080/api/receive-key
```

推荐由 Nginx/API Gateway 将接口代理到前端同一域名，例如：

```text
浏览器请求：https://example.com/key-service/api/receive-key
网关转发：http://127.0.0.1:28080/api/receive-key
```

前端环境变量示例：

```dotenv
VITE_KEY_SERVICE_BASE_URL=/key-service
```

Nginx 参考配置：

```nginx
location /key-service/ {
    proxy_pass http://127.0.0.1:28080/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

> 该接口会返回可被前端解密的密钥材料，且当前没有鉴权。上线前应由网关增加身份认证、访问控制、限流和 HTTPS，不要将 `28080` 端口直接暴露到公网。

## 3. 请求说明

### 3.1 请求地址

```http
POST {BASE_URL}/api/receive-key
Content-Type: application/json
```

推荐的 `BASE_URL`：

- 开发环境：由 Vite/Webpack 代理提供，例如 `/key-service`
- 生产环境：同源网关路径，例如 `https://example.com/key-service`
- 仅限服务器内部调试：`http://127.0.0.1:28080`

### 3.2 请求体

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ecPublicKey` | `string` | 是 | P-256（又名 `prime256v1`、`secp256r1`）EC 公钥；必须是 PEM 格式的 SubjectPublicKeyInfo |

示例：

```json
{
  "ecPublicKey": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----"
}
```

注意：

- 必须使用 `P-256` 曲线，否则无法正常完成 ECDH。
- PEM 的换行应交给 `JSON.stringify()` 转义，不要手工拼 JSON。
- 浏览器通过 `fetch()` 发送时会自动设置 `Content-Length`；服务端要求该请求头存在。
- URL 必须精确匹配 `/api/receive-key`，尾部不要增加 `/`。

## 4. 成功响应

### 4.1 响应体

```json
{
  "code": 200,
  "ephPub": "<Base64 DER 公钥>",
  "salt": "<Base64 16字节随机盐>",
  "nonce": "<Base64 12字节随机数>",
  "tag": "<Base64 16字节认证标签>",
  "ciphertext": "<Base64 密文>"
}
```

| 字段 | 类型 | 解码后格式 | 用途 |
| --- | --- | --- | --- |
| `code` | `number` | `200` | 业务成功码 |
| `ephPub` | `string` | DER SubjectPublicKeyInfo | 服务端临时 P-256 公钥，用于 ECDH |
| `salt` | `string` | 16 字节 | AES 密钥派生参数 |
| `nonce` | `string` | 12 字节 | AES-GCM IV |
| `tag` | `string` | 16 字节 | AES-GCM 认证标签 |
| `ciphertext` | `string` | 当前为 16 字节 | 加密后的 SM4 密钥 |

所有字符串字段均使用标准 Base64，不是 Base64URL。

### 4.2 加解密协议

| 步骤 | 算法/规则 |
| --- | --- |
| 曲线 | P-256 / `prime256v1` / `secp256r1` |
| 共享秘密 | `ECDH(前端临时私钥, 服务端 ephPub)` |
| 固定 info | UTF-8 字符串 `HENC2-P256-AES256GCM` |
| AES 密钥 | `SHA-256(sharedSecret || salt || info)`，结果 32 字节 |
| 对称加密 | AES-256-GCM |
| IV | 响应中的 `nonce`，12 字节 |
| Tag | 响应中的 `tag`，16 字节（128 bit） |
| AAD | 无 |
| 明文结果 | 16 字节 SM4 密钥 |

> 注意：源码实现的是直接 SHA-256 拼接派生，不是 HKDF。前端必须严格使用 `SHA-256(sharedSecret || salt || info)`。

## 5. 前端可直接使用的 TypeScript 实现

以下代码使用浏览器原生 Web Crypto API，无需额外加密依赖。

```ts
export interface ReceiveKeySuccess {
  code: 200;
  ephPub: string;
  salt: string;
  nonce: string;
  tag: string;
  ciphertext: string;
}

export interface ReceiveKeyError {
  code: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function spkiToPem(spki: ArrayBuffer): string {
  const base64 = bytesToBase64(new Uint8Array(spki));
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

/**
 * 请求并解密 SM4 密钥。
 * @param baseUrl 示例：/key-service；末尾有无 / 均可。
 * @returns 16 字节 SM4 原始密钥。请勿记录到日志或持久化到 localStorage。
 */
export async function receiveSm4Key(baseUrl: string): Promise<Uint8Array> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;

  const publicSpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const ecPublicKey = spkiToPem(publicSpki);
  const url = `${baseUrl.replace(/\/$/, "")}/api/receive-key`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ecPublicKey }),
  });

  let payload: ReceiveKeySuccess | ReceiveKeyError;
  try {
    payload = (await response.json()) as ReceiveKeySuccess | ReceiveKeyError;
  } catch {
    throw new Error(`receive-key 返回了非 JSON 响应（HTTP ${response.status}）`);
  }

  if (!response.ok || payload.code !== 200) {
    throw new Error(
      `receive-key 调用失败（HTTP ${response.status}, code ${payload.code}）`,
    );
  }

  const result = payload as ReceiveKeySuccess;
  const serverPublicKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(result.ephPub),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: serverPublicKey },
      keyPair.privateKey,
      256,
    ),
  );

  const salt = base64ToBytes(result.salt);
  const nonce = base64ToBytes(result.nonce);
  const tag = base64ToBytes(result.tag);
  const ciphertext = base64ToBytes(result.ciphertext);
  const info = new TextEncoder().encode("HENC2-P256-AES256GCM");

  const aesKeyBytes = await crypto.subtle.digest(
    "SHA-256",
    concatBytes(sharedSecret, salt, info),
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    aesKeyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Web Crypto 要求密文和 GCM tag 拼接，tag 放在末尾。
  const encrypted = concatBytes(ciphertext, tag);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      encrypted,
    ),
  );

  if (plaintext.length !== 16) {
    throw new Error(`SM4 密钥长度异常：期望 16 字节，实际 ${plaintext.length} 字节`);
  }

  // 尽量减少共享秘密和派生密钥在内存中的存留时间。
  sharedSecret.fill(0);
  new Uint8Array(aesKeyBytes).fill(0);

  return plaintext;
}
```

调用示例：

```ts
try {
  const sm4Key = await receiveSm4Key(
    import.meta.env.VITE_KEY_SERVICE_BASE_URL ?? "/key-service",
  );

  // 在这里立即使用 sm4Key；不要打印密钥，不要存入 localStorage。
  // await decryptBusinessData(sm4Key);

  // 使用完毕后主动清零。
  sm4Key.fill(0);
} catch (error) {
  console.error("密钥获取失败", error);
}
```

## 6. curl 联调示例

先生成一对临时 P-256 密钥：

```bash
openssl ecparam -name prime256v1 -genkey -noout -out client-private.pem
openssl ec -in client-private.pem -pubout -out client-public.pem
```

使用 `jq` 安全构造 JSON 并请求：

```bash
jq -Rs '{ecPublicKey: .}' client-public.pem |
  curl --request POST 'http://127.0.0.1:28080/api/receive-key' \
    --header 'Content-Type: application/json' \
    --data-binary @-
```

预期返回 HTTP 200，且响应中包含 `code`、`ephPub`、`salt`、`nonce`、`tag`、`ciphertext`。

> curl 示例只验证接口调用成功；要验证解密结果，请使用第 5 节的前端代码或实现相同的 ECDH/派生/AES-GCM 流程。

## 7. 错误码

失败响应只有一个字段：

```json
{
  "code": 50001
}
```

| HTTP 状态 | code | 含义 | 前端处理建议 |
| --- | ---: | --- | --- |
| `400` | `50001` | 缺少 `ecPublicKey`，或字段不是可读取的字符串 | 检查字段名和 JSON 序列化 |
| `400` | `50002` | PEM 公钥无法解析 | 重新生成并导出 SPKI PEM 公钥 |
| `400` | `50003` | 提交的不是 EC 公钥 | 必须使用 P-256 EC 公钥 |
| `500` | `50004` | 服务端 TKM 密钥生成、提取或保存失败 | 不要盲目重试；记录 code 并联系后端 |
| `500` | `50005` | 服务端无法读取生成的 SM4 密钥文件 | 联系后端检查文件权限和运行目录 |
| `500` | `50006` | 服务端临时 P-256 密钥生成失败 | 可有限重试一次，持续失败则联系后端 |
| `500` | `50007` | ECDH 共享秘密计算失败 | 确认前端使用 P-256；重新生成密钥对后重试 |
| `500` | `50008` | 随机数、密钥派生或 AES-GCM 加密失败 | 可有限重试一次，持续失败则联系后端 |
| `500` | `50009` | 服务端公钥序列化或 Base64 编码失败 | 联系后端 |
| `400` | `50010` | HTTP 请求格式错误，或缺少 `Content-Length` | 使用标准 `fetch`/Axios；检查代理是否改写请求 |
| `404` | `50011` | Method 或 Path 不匹配 | 必须使用 `POST /api/receive-key` |
| `400` | `50012` | 请求体为空或不是以 `{` 开头的 JSON 对象 | 设置 JSON 请求体和 `Content-Type` |

建议前端交互策略：

- `400/404`：属于请求问题，不自动重试。
- `500`：最多自动重试 1 次，并增加短暂随机延时；仍失败则提示“密钥服务暂不可用”。
- 日志只记录 HTTP 状态、业务 code 和请求追踪信息，绝不能记录公私钥、共享秘密、SM4 密钥或完整响应。

## 8. Axios 调用注意事项

如果项目使用 Axios，请仍然保留“生成密钥对 + 解密响应”的完整流程。单独的请求形式如下：

```ts
const { data } = await axios.post<ReceiveKeySuccess>(
  "/key-service/api/receive-key",
  { ecPublicKey },
  { headers: { "Content-Type": "application/json" } },
);
```

Axios 只负责 HTTP 调用，`data.ciphertext` 不能直接作为 SM4 密钥使用，必须按第 4.2 节协议解密。

## 9. 联调验收清单

- [ ] 网关已将同源 `/key-service/` 转发到 `127.0.0.1:28080/`。
- [ ] 浏览器页面使用 HTTPS 时，接口也通过同一 HTTPS 域名访问。
- [ ] 前端每次请求都新建临时 P-256 ECDH 密钥对。
- [ ] 请求字段名严格为 `ecPublicKey`。
- [ ] 成功时同时检查 HTTP 200 和 `code === 200`。
- [ ] `ephPub` 按 DER SPKI 导入，而不是 PEM 文本导入。
- [ ] 派生公式严格为 `SHA-256(sharedSecret || salt || info)`。
- [ ] Web Crypto 解密前按 `ciphertext || tag` 顺序拼接。
- [ ] 解密结果长度严格为 16 字节。
- [ ] 密钥不写日志、不落 localStorage/IndexedDB，使用后尽快清零。
- [ ] `28080` 未直接暴露到公网，网关已经启用鉴权、限流和访问控制。

## 10. 当前服务限制

根据当前源码，联调时还需要了解：

- 只有这一个接口，没有健康检查接口。
- 不支持 CORS，也不处理 `OPTIONS`。
- 不支持 HTTPS，需要放在反向代理之后。
- 没有身份认证和业务权限判断。
- 服务按连接串行处理请求，不适合高并发直接访问。
- 错误响应只有数字 code，没有 message 或 requestId。
- URL 查询参数和尾斜杠都不会被当作正确路径。

建议后端后续补充：`GET /health`、统一错误结构、requestId、网关鉴权、限流，以及明确的密钥使用和销毁策略。
