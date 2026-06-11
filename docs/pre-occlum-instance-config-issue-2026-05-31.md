# PRE 运行时配置未生效排查说明

日期：2026-05-31

## 结论

PRE 失败的根因不在业务后端，也不在最新挂载的 `config.yml` 本身，而在 `sgx_runtime` 使用的 Occlum instance 仍然复用了旧的镜像内容。

当前现象是：

- 容器外挂的 `config.yml` 已经更新为新配置
- 但 Occlum instance 内部的 `/workspace/pcp/config.yml` 仍然是旧配置
- 因此 `POST /compute/pre` 实际运行时仍然访问旧的 `host.docker.internal:9000`
- 最终报错：
  `Failed to resolve 'host.docker.internal'`

## 已确认的证据

### 1. 容器外挂配置已经更新

文件：
`/home/super/tr/pcp/config.yml`

关键配置：

- `s3_endpoint: "10.112.47.214:9000"`
- `token_notify_url: "http://10.112.47.214:3000/api/privacy/result-notify"`

并且运行中的两个容器里挂载到的配置也已经是新的：

- `pcp_backend:/app/config.yml`
- `pcp_sgx_runtime:/workspace/pcp/config.yml`

### 2. Occlum instance 内部仍然是旧配置

实际读取到的文件：

`/home/super/tr/pcp/occlum/tee_compute/instance/image/workspace/pcp/config.yml`

其中仍然是旧值：

- `s3_endpoint: "host.docker.internal:9000"`
- `token_notify_url: "http://10.112.47.214:3000/api/privacy/he/result-notify"`

这说明 PRE 真正执行时使用的不是最新挂载配置，而是旧的 Occlum image 内容。

### 3. 直接调用 `/compute/pre` 仍返回旧地址错误

从 `pcp_backend` 容器直接调用：

`http://sgx_runtime:50051/compute/pre`

返回 500，错误正文为：

```json
{
  "detail": "HTTPConnectionPool(host='host.docker.internal', port=9000): Max retries exceeded with url: /pcp-assets?location= (Caused by NameResolutionError(\"HTTPConnection(host='host.docker.internal', port=9000): Failed to resolve 'host.docker.internal' ([Errno -2] Name or service not known)\"))"
}
```

这与当前外挂配置中的 `10.112.47.214:9000` 明显不一致。

## 根因判断

Occlum instance 被复用了，但复用逻辑没有检查 `config.yml` 是否变化。

相关脚本：

`/home/super/tr/pcp/occlum/tee_compute/init_instance.sh`

当前逻辑在以下条件满足时会直接复用旧 instance：

- `instance/build/lib/libocclum-libos.signed.so` 存在
- `instance/.pcp_occlum_image_v7` 存在
- launcher/import 检查通过

但它不会校验：

- `config.yml` 是否已经变更
- 是否需要重新把新配置复制进 `instance/image/workspace/pcp/`

所以即使外层容器配置改了，Occlum instance 里依然可能残留旧配置。

## 建议处理

最直接的处理方式：删除旧的 Occlum instance，强制重建。

```bash
cd /home/super/tr/pcp
docker compose stop sgx_runtime
rm -rf occlum/tee_compute/instance
docker compose up -d sgx_runtime
```

如果希望长期避免同类问题，建议后续补一版机制，在 `init_instance.sh` 中加入以下任一策略：

- `config.yml` 变更时强制 rebuild instance
- 对 `config.yml` 做 checksum，比对不一致则 rebuild
- 或者每次启动 `sgx_runtime` 时都重新 copy `config.yml`

## 当前业务侧状态

我们这边已确认以下内容正常：

- 统一通知路径 `/api/privacy/result-notify` 已生效
- PRE 业务后端路由正常
- `re-encrypt` 可以正常提交并进入 `QUEUED`

当前唯一阻塞点是：

- `sgx_runtime` 内部执行 `compute/pre` 时仍使用旧的 Occlum 配置

## 可复现任务

- `transactionId = 194`
- `pcp_contract_id = PRE_TASK_EE951BB3F8374395`

可用它作为重建后的回归验证样本。
