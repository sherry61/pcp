# TEE v2 `receive-key` 返回 50004 问题报告

## 1. 问题概述

在平台后端进行 TEE v2 纯后端联调时，虚机可以正常创建、启动，虚机内服务也可以部署完成；但是调用虚机网关的 `receive-key(data)` 接口时，始终返回错误码 `50004`，导致数据无法上传，后续权重上传和计算流程无法继续。

## 2. 复现交易

- 交易号：`463`
- 虚机 ID：`766a412827394a92`
- 虚机配置：8 vCPU / 4096 MB
- 测试时间：2026-08-28
- 调用方：平台后端（非浏览器、非前端页面）

## 3. 已完成且正常的步骤

```text
request                  成功
confirm                  成功，返回 202
虚机创建                  成功
虚机启动                  成功
虚机服务部署              成功
状态进入 WAITING_DATA     成功
```

后端状态接口返回：

```json
{
  "transactionId": "463",
  "vmId": "766a412827394a92",
  "status": "VM_RUNNING",
  "step": "WAITING_DATA",
  "vmStatus": "running",
  "lastError": null
}
```

## 4. 失败接口及请求

平台后端调用：

```http
POST http://10.112.14.6:18080/api/receive-key
Content-Type: application/json
```

实际通过平台后端调用的业务参数为：

```json
{
  "vmId": "766a412827394a92",
  "ecPublicKey": "有效的 P-256 ECDH 公钥 PEM",
  "fileType": "data",
  "role": "buyer",
  "name": "data.csv"
}
```

返回结果：

```http
HTTP/1.1 500
```

```json
{
  "code": 50004
}
```

平台后端记录为：

```text
TEE receive-key failed: {"code":50004}
```

当前平台状态已正确更新为：

```text
DATA_KEY_FAILED
```

## 5. 已排除的问题

1. 虚机未启动：已排除，虚机状态为 `running`。
2. 服务未部署：已排除，服务等待流程已完成并进入 `WAITING_DATA`。
3. 网关不可访问：已排除，`18080` 可以返回正常的参数校验响应。
4. URL 或 HTTP 方法错误：已排除，使用 `POST /api/receive-key`。
5. 公钥格式错误：已排除，使用浏览器同等格式的有效 P-256 ECDH 公钥时仍返回 50004。
6. 前端加密问题：已排除，本次是纯后端直接调用，尚未进入文件加密和上传阶段。

空参数探测也能得到正常的参数错误，例如：

```json
{"code":50001}
```

这说明 HTTP 网关和接口路由本身是存活的；错误发生在带有效参数后执行实际密钥操作的阶段。

## 6. 主机侧检查结果

海光主机上的 `receive-key` 服务正常监听 `10.112.14.6:28080`，日志中可以看到主机侧 TKM 命令曾成功执行并生成密钥文件。

但这不能证明虚机内部 TEE 密钥操作正常。平台实际调用的 `18080` 是转发到目标虚机内部服务的入口，目前失败发生在虚机内部密钥协商阶段。

## 7. 请对接方重点排查

请重点检查虚机 `766a412827394a92` 内部：

1. `receive-key` 服务是否已启动并加载正确版本；
2. 虚机内 TKM/PSP/CSV 设备是否可用，是否能执行密钥生成或解封操作；
3. 虚机启动后是否需要额外初始化密钥、共享内存或设备权限；
4. `50004` 对应的完整错误含义和服务端日志；
5. `receive-key(data)` 是否要求额外字段（例如 `kind`、`role`、固定 `name` 或其他 v2 字段）；
6. 虚机网关转发到 `receive-key` 服务时是否丢失了 `vmId` 或其他请求头；
7. 是否存在“服务端口已监听，但 TEE/TKM 尚未 ready”的状态，需要提供正式健康检查接口。

## 8. 期望结果

在虚机进入服务就绪状态后，调用 `receive-key(data)` 应返回包含密钥信封的 JSON，例如包含：

```json
{
  "ephPub": "...",
  "salt": "...",
  "nonce": "...",
  "ciphertext": "...",
  "tag": "..."
}
```

拿到该密钥后，平台才能继续调用 `receive-file(data)`，再按顺序执行：

```text
receive-key(data)
→ receive-file(data)
→ receive-key(weight)
→ receive-file(weight)
→ get-result
```

## 9. 补充说明

交易 461 在相同阶段也出现过同样的 `50004`，因此该问题可以稳定复现，不是单笔交易偶发故障。
