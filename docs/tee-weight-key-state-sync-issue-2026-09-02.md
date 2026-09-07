# TEE `receive-key(weight)` 状态同步问题报告

## 1. 基本信息

- 日期：2026-09-02
- 测试环境：海光主机 `10.112.14.6`
- VM ID：`a867abce427bbe85`
- VM 规格：8 vCPU / 4096 MB
- 测试方式：后端脚本直接调用 TEE 网关，未经过前端
- 测试文件：系统中持久化的测试 `data.csv`、`weight.csv`

## 2. 测试目标

验证以下完整链路是否可以闭环：

```text
receive-key(data)
→ receive-file(data)
→ receive-key(weight)
→ receive-file(weight)
→ get-result
```

## 3. 实际测试结果

### 3.1 获取 data 密钥

接口：`POST /api/receive-key`

参数包含：

```json
{
  "vmId": "a867abce427bbe85",
  "fileType": "data",
  "kind": "data",
  "role": "seller",
  "name": "data.csv",
  "ecPublicKey": "有效的 ECDH P-256 公钥"
}
```

结果：成功。

```text
HTTP 200
code: 200
返回 ephPub、salt、nonce、tag、ciphertext
```

后端可以使用买方私钥正常解出 16 字节 SM4 密钥。

### 3.2 上传加密 data

接口：`POST /api/receive-file`

结果：成功。

```json
{
  "code": 200,
  "fileType": "data",
  "data_ready": true,
  "weight_ready": false,
  "computed": false,
  "ready": false,
  "waiting_for": "weight",
  "seq": 0,
  "rows": 0,
  "metrics": 0
}
```

该响应明确表示 TEE 已收到并识别 data 文件，且正在等待 weight 文件。

### 3.3 获取 weight 密钥

接口：`POST /api/receive-key`

参数中的 `fileType/kind/role/name` 均按 weight 传递：

```json
{
  "fileType": "weight",
  "kind": "weight",
  "role": "buyer",
  "name": "weight.csv"
}
```

结果：失败。

```json
{
  "code": 40901,
  "error": "weight_key_before_data",
  "message": "weight key request is rejected: upload encrypted data first, then request weight key"
}
```

### 3.4 获取结果

由于 weight 密钥获取失败，无法继续上传 weight，最终调用 `get-result` 返回：

```json
{
  "code": 404,
  "error": "no_result",
  "message": "no encrypted result is cached in memory for the requested vmId"
}
```

## 4. 已排除的问题

- VM 创建和启动成功。
- 18080 nginx 网关正常响应。
- `receive-key(data)` 成功。
- ECDH 密钥解包成功。
- SM4-CBC 无填充加密格式正确。
- `receive-file(data)` 成功，并返回 `data_ready=true`。
- 测试文件可以正常读取，CSV 文件非空且格式完整。
- 测试未经过前端，因此可以排除前端编排和浏览器加密逻辑影响。

## 5. 初步判断

问题出现在远端 TEE 服务的状态管理：

`receive-file` 服务已经将 data 标记为 `data_ready=true`，但 `receive-key` 服务随后仍认为 data 尚未上传。

较可能的原因：

1. `receive-key` 与 `receive-file` 是不同进程，使用了不同的内存状态，data 上传状态没有共享。
2. 两个服务使用的状态文件或状态目录不一致。
3. `receive-key(weight)` 的顺序判断使用了错误的字段，例如只检查自身进程内状态，未读取 `receive-file` 的落盘状态。
4. `vmId`、`fileType`、`kind`、`role` 的状态键组合不一致，导致 data 阶段和 weight 阶段被视为不同会话。
5. `receive-file(data)` 虽返回成功，但实际没有更新 `receive-key` 所依赖的全局状态。

## 6. 建议排查内容

请在 VM 内检查：

```text
recv-key/receive-key
recv-file/receive-file
recv-gateway/recv-error.log
recv-file/file_recv_server.log
recv-key/ec_recv_server.log
Supervisor status
```

重点确认：

- `receive-file(data)` 成功后，是否写入了供 `receive-key` 读取的 data-ready 状态。
- `receive-key` 和 `receive-file` 是否使用同一个状态目录/状态文件。
- 状态是否按 `vmId` 隔离，并且两个服务使用完全相同的 `vmId`。
- `fileType=data` 上传成功后，`fileType=weight` 是否允许继续申请密钥。
- 是否必须省略 `role/kind/name` 等扩展字段，或使用特定字段组合。
- 重启 Supervisor 后状态是否被清空，是否存在旧状态残留。

## 7. 期望修复行为

当以下请求成功：

```text
receive-key(data)
receive-file(data)
```

后续调用：

```text
receive-key(weight)
```

应返回 weight 对应的密钥信封，而不应再返回 `weight_key_before_data`。

修复后，完整链路应返回：

```text
data_ready=true
weight_ready=true
computed=true
ready=true
```
