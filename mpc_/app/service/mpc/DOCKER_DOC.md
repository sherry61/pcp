# Docker 使用与接口说明

完整跨机器部署步骤见 `DEPLOYMENT_DOC.md`。本文只说明 Docker 构建、运行和测试方式。

注意：当前 VFL 默认启用 SGX simulation 梯度保护。现有 Dockerfile 不安装 Intel SGX SDK，因此 Docker 内直接运行 VFL 隐私训练会失败。推荐宿主机运行 SGX-protected VFL；若只做旧明文证明兼容测试，可在容器环境中设置 `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true`。

## 构建

```bash
cd app/service/mpc
docker build -t pcp-mpc-vfl:latest .
```

或：

```bash
cd app/service/mpc
docker compose up --build
```

## 运行

```bash
docker run --rm -p 8091:8091 \
  --add-host=host.docker.internal:host-gateway \
  -e CONFIG_PATH=/root/config/config.yaml \
  -e SDK_CONFIG_PATH=/root/config/sdk_config.docker.yml \
  -e ENABLE_GARBLED_CIRCUIT=true \
  -e ENABLE_ITMAC_AUDIT=true \
  -e VFL_DISABLE_SGX_GRADIENT_PROTECTION=true \
  -e flask_app_token=<审计中台token> \
  -v "$PWD/config:/root/config" \
  -v "$PWD/contracts:/root/contracts" \
  -v "/home/clay/pcp/chain1-local/config/wx-org1.chainmaker.org/certs:/root/chain1-certs:ro" \
  pcp-mpc-vfl:latest
```

容器内服务端口为 `8091`。业务配置由 `config/config.yaml` 控制；ChainMaker SDK 连接配置由 `SDK_CONFIG_PATH` 指向的文件控制。

上面的 `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true` 仅用于当前 Docker 镜像的兼容运行。需要 Docker 内也启用 SGX-protected VFL 时，必须先在镜像内安装 Intel SGX SDK simulation runtime。

容器访问宿主机上的 ChainMaker 时必须使用：

- `--add-host=host.docker.internal:host-gateway`
- `SDK_CONFIG_PATH=/root/config/sdk_config.docker.yml`
- 挂载当前运行链的证书目录到 `/root/chain1-certs`

`config/sdk_config.docker.yml` 中的节点地址为 `host.docker.internal:12301`，证书路径为 `/root/chain1-certs/...`。`trust_root_paths` 必须指向直接包含 `ca.crt` 的组织目录。不要在容器内使用 `127.0.0.1:12301` 连接宿主机链；那会指向容器自身。也不要混用不同链生成的 CA/用户证书，否则 TLS 握手会失败。

## 合约

镜像包含：

- `contracts/authorization/authorization_contract.7z`
- `contracts/verification/verification_contract.7z`
- `contracts/gc_audit/gc_audit_contract.7z`
- `contracts/vfl_audit/vfl_audit_contract.7z`

部署脚本：

```bash
cd app/service/mpc
./deploy.sh
```

## 健康检查

```bash
curl http://localhost:8091/api/v1/health
```

## Docker 内接口

接口与宿主机运行一致，Base URL 为：

```text
http://localhost:8091/api/v1
```

核心接口：

- `POST /bank/gc/generate-task`
- `POST /datacenter/gc/evaluate`
- `POST /audit/gc/verify-execution`
- `GET /audit/gc/query-log?audit_id=...`
- `POST /vfl/train`
- `POST /vfl/verify`
- `GET /vfl/audit/query?audit_id=...`
- `GET /vfl/audit/query?task_id=...`

## 功能测试

VFL HTTP 测试：

```bash
cd app/service/mpc
BASE_URL=http://localhost:8091/api/v1 ./test_vfl_flow.sh
```

该测试要求 `vfl_audit` 已部署。未部署合约时测试应失败，不能把链上验证缺失当作通过。
