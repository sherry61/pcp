# 数据目录 publish 问题报告

## 问题现象

资产登记前端测试时，页面返回结果为：

- 文件哈希值正常生成
- 本地数据库状态：`数据已成功保存`
- 长安链返回信息：`成功`
- 目录发布状态：未成功返回

说明：

- 资产主上链流程成功
- 数字资产目录 `publish` 流程未成功完成

## 当前接入方式

已将目录发布接入最终上链按钮流程，执行顺序为：

1. 保存数据库
2. 主链资产上链
3. 主链成功后，调用目录服务 `publish`

前端接入位置：

- `frontend/src/views/ChainRegistrationView.vue`

后端代理接口：

- `POST /api/datacatalog/publish-asset`

后端再转发到：

- `POST http://127.0.0.1:8008/contract/datacatalog/publish`

## publish 请求体方案

当前发送到目录服务的请求体核心字段为：

```json
{
  "id": "数字指纹",
  "code": "数字指纹",
  "name": "资产名称",
  "remark": "资产描述",
  "orgId": "默认上链证书所属组织",
  "orgDID": "did:web:data.web",
  "version": 1,
  "dataVersion": "1",
  "status": 1,
  "asseType": "资产类型",
  "platform_name": "数字资产交易平台",
  "platform_DID": "did:web:data.web",
  "platform_url": "http://10.112.47.214",
  "chain_type": "Chainmaker"
}
```

## 排查结论

当前问题不在前端接入代码，也不在后端代理逻辑，问题在目录服务 `8008` 的写链能力。

已确认：

- `GET /contract/version` 正常
- `GET /contract/datacatalog/list` 正常
- `POST /contract/datacatalog/publish` 超时

## 直接复现结果

执行：

```bash
curl -sS -m 70 \
  -H 'Content-Type: application/json' \
  -d '{
    "id":"Wxj9DstETcYByhsVC209DtigG_VDZaqPeK5zZU8AHH874yDEUSNZv01oOa9tthpFKgDbRl2IPRFFhSxVFy7n-w==",
    "code":"Wxj9DstETcYByhsVC209DtigG_VDZaqPeK5zZU8AHH874yDEUSNZv01oOa9tthpFKgDbRl2IPRFFhSxVFy7n-w==",
    "name":"数字指纹测试4号",
    "remark":"88888",
    "orgId":"wx-org1",
    "orgDID":"did:web:data.web",
    "version":1,
    "dataVersion":"1",
    "status":1,
    "asseType":"一般数据",
    "platform_name":"数字资产交易平台",
    "platform_DID":"did:web:data.web",
    "platform_url":"http://10.112.47.214",
    "chain_type":"Chainmaker"
  }' \
  http://127.0.0.1:8008/contract/datacatalog/publish
```

结果：

```text
curl: (28) Operation timed out after 70001 milliseconds with 0 bytes received
```

说明：

- 目录服务能够收到请求
- 但在处理 `publish` 时未正常返回

## 服务日志关键信息

目录服务路径：

- `/home/super/lihuihao/chainmaker-mpc-service`

关键日志文件：

- `/home/super/lihuihao/chainmaker-mpc-service/log/start.log`
- `/home/super/lihuihao/chainmaker-mpc-service/logs/error.log`

日志中可见：

1. 已进入目录保存逻辑

```text
===SAVE DataCatalog===
```

2. 最终返回异常状态

```text
503 SERVICE_UNAVAILABLE
```

3. 链客户端异常

```text
io.grpc.StatusRuntimeException: UNAVAILABLE: Channel shutdown invoked
IllegalThreadStateException
```

4. TLS / 证书信任链异常

```text
certificate verify failed
Path does not chain with any of the trust anchors
```

## 影响范围

当前影响：

- 数字资产目录合约 `publish`

当前不影响：

- 资产主上链登记
- 本地数据库保存
- 目录 `version` 查询
- 目录 `list` 查询

## 初步根因判断

高概率是 `chainmaker-mpc-service` 自身的链连接状态或证书信任配置异常，导致：

- 查询接口可用
- 写链接口 `publish` 不可用

需要注意：

- 目录服务使用的是它自己的链客户端
- 与当前资产主上链使用的 GoSDK 不是同一套
- 因此主上链成功，不代表目录服务写链也一定成功

## 建议处理

1. 重启 `chainmaker-mpc-service`

原因：

- 日志里已有 `Channel shutdown invoked`
- 有较大概率仍持有旧的 gRPC / TLS 状态

2. 重启后优先验证以下接口

```bash
curl -sS http://127.0.0.1:8008/contract/version
curl -sS "http://127.0.0.1:8008/contract/datacatalog/list"
curl -sS -m 70 -H 'Content-Type: application/json' -d '<payload>' http://127.0.0.1:8008/contract/datacatalog/publish
```

3. 若仍失败，重点检查：

- `chainmaker-mpc-service` 的链节点地址配置
- TLS 证书配置
- trust root 配置
- 当前连接组织与链节点是否匹配

## 结论

当前目录发布失败的根因不在前端接入代码，而在目录服务 `8008` 的内部写链能力异常。

主资产登记功能已通，目录合约 `publish` 需继续排查 `chainmaker-mpc-service` 的链连接与证书配置。
