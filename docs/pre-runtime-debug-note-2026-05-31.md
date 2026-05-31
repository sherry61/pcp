# PRE Runtime 联调说明

日期：2026-05-31

## 背景

我们在现有业务后端中对接 PCP 的 PRE 接口，已完成以下链路联调：

- `POST /pre/contract`
- `GET /pre/tee-materials`
- `POST /pre/publish`
- `POST /pre/re-encrypt`
- `GET /pre/{contract_id}/status`

其中，业务侧已实际跑通：

1. buyer 上传 `buyer_public_key`
2. seller 发布 `key_package + source_cipher_file + source_wrapped_key_file + source_meta_file`
3. buyer 发起 `re-encrypt`
4. PCP 任务状态进入 `QUEUED / RUNNING`

说明 PRE 前半段接口编排已经正常。

## 当前问题

PRE 任务在运行期失败，状态最终变为 `FAILED`。

业务侧通过 `GET /pre/{contract_id}/status` 读到的 `last_error` 为：

```text
Server error '500 Internal Server Error' for url 'http://sgx_runtime:50051/compute/pre'
```

进一步在运行中的 PCP 环境内直接调用 `compute/pre`，拿到的真实响应体为：

```json
{
  "detail": "HTTPConnectionPool(host='host.docker.internal', port=9000): Max retries exceeded with url: /pcp-assets?location= (Caused by NameResolutionError(\"HTTPConnection(host='host.docker.internal', port=9000): Failed to resolve 'host.docker.internal' ([Errno -2] Name or service not known)\"))"
}
```

## 已确认结论

1. 这不是 `/pre/publish` 或 `/pre/re-encrypt` 的业务参数校验失败
2. 这不是业务后端路由层失败
3. 失败点发生在 PCP 运行期 `compute/pre`
4. 失败原因是 `sgx_runtime` 在访问对象存储时，无法解析：

```text
host.docker.internal:9000
```

5. 因此当前问题更像是 PCP 运行环境配置问题，而不是 PRE 协议本身问题

## 当前 PCP 配置观察

在 PCP 当前 `config.yml` 中，相关配置为：

```yaml
infrastructure:
  database_uri: "mysql+aiomysql://root:123456@host.docker.internal:3306/pcp"
  redis_url: "redis://host.docker.internal:6379/0"
  s3_endpoint: "host.docker.internal:9000"
```

而 PRE 失败点明确落在：

```yaml
infrastructure.s3_endpoint
```

对应的对象存储访问。

## 建议

建议优先检查并调整 PCP 运行环境中的以下配置：

1. `infrastructure.s3_endpoint`
2. `infrastructure.database_uri`
3. `infrastructure.redis_url`

建议不要继续使用：

```text
host.docker.internal
```

而改为 PCP 运行环境中可以稳定访问的明确地址，例如：

- 宿主机真实 IP
- Docker bridge 网关 IP
- 或明确的容器服务名

例如：

```yaml
infrastructure:
  database_uri: "mysql+aiomysql://root:123456@10.112.47.214:3306/pcp"
  redis_url: "redis://10.112.47.214:6379/0"
  s3_endpoint: "10.112.47.214:9000"
```

或按实际部署网络改成其他确定可达地址。

## 额外提醒

当前 PCP 配置中的通知回调地址为：

```yaml
download:
  token_notify_url: "http://10.112.47.214:3000/api/privacy/he/result-notify"
```

如果后续需要继续联调 PRE 结果通知，建议确认该地址是否应切换为 PRE 对应回调，或统一由一个总入口分发。

## 结论

当前 PRE 对接已确认：

- PCP 前半段接口可正常工作
- 任务可进入 `QUEUED / RUNNING`
- 最终失败点位于 `sgx_runtime -> S3/MinIO`

优先建议从 PCP 运行环境配置入手排查，而不是继续修改业务侧 PRE 请求参数。
