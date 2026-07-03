# MPC/VFL 组件与合约部署文档

本文档用于在其他电脑上部署 `app/service/mpc` 组件及其相关长安链合约。

部署顺序必须是：先确认链和证书，再部署合约，最后启动服务。原因是服务启动时会初始化 ChainMaker SDK；证书、节点地址或合约状态不正确，后续接口一定会失败。

## 1. 确认目标部署形态

先明确目标电脑是接入已有链，还是同时运行本地链。

- 接入已有 ChainMaker 链：向链管理员获取该链的 SDK 配置、组织 CA、admin/client 证书和私钥、节点 RPC 地址。
- 在目标电脑运行本地链：先启动本地 ChainMaker 节点，并确保链配置启用了 `DOCKER_GO` 合约运行时。

不要把旧电脑的证书直接用于另一条链。证书必须和目标链、组织、节点 TLS 配置一致，否则 SDK 连接会在 TLS 或签名校验阶段失败。

## 2. 准备组件目录

将项目代码放到目标电脑后，进入组件目录：

```bash
cd app/service/mpc
```

确认至少存在以下目录和文件：

```text
config/config.yaml
config/sdk_config.yml
config/sdk_config.docker.yml
contracts/authorization/authorization_contract.7z
contracts/verification/verification_contract.7z
contracts/gc_audit/gc_audit_contract.7z
contracts/vfl_audit/vfl_audit_contract.7z
deploy.sh
```

## 3. 配置证书和 SDK

宿主机直接运行服务时，主要修改：

```text
config/sdk_config.yml
```

必须按目标链修改：

```yaml
chain_client:
  chain_id: "chain1"
  org_id: "wx-org1.chainmaker.org"
  nodes:
    - node_addr: "<目标链IP或域名>:12301"
      enable_tls: true
      trust_root_paths:
        - "./config/crypto_config/ca"
      tls_host_name: "chainmaker.org"
```

同时确认这些文件来自目标链：

```text
config/crypto_config/user/admin1/admin1.sign.key
config/crypto_config/user/admin1/admin1.sign.crt
config/crypto_config/user/admin1/admin1.tls.key
config/crypto_config/user/admin1/admin1.tls.crt
config/crypto_config/ca/ca.crt
```

Docker 运行服务时，主要修改：

```text
config/sdk_config.docker.yml
```

如果 ChainMaker 运行在 Docker 宿主机上：

```yaml
node_addr: "host.docker.internal:12301"
```

如果 ChainMaker 是远程节点：

```yaml
node_addr: "<远程链IP或域名>:12301"
```

Docker 场景下，`trust_root_paths` 和用户证书路径必须指向容器内挂载路径，默认是：

```text
/root/chain1-certs
```

## 4. 配置业务参数

修改：

```text
config/config.yaml
```

重点确认：

```yaml
server:
  addr: ":8091"
  mode: "debug"

audit:
  base_url: "http://<审计服务IP>:8080"
  enabled: true
```

注意：ChainMaker SDK 实际读取的是 `SDK_CONFIG_PATH` 指向的配置文件，默认是 `./config/sdk_config.yml`。不要只修改 `config/config.yaml` 里的 `chainmaker.node_addr` 后就认为链连接已改变。

## 5. 安装并验证 SGX simulation

VFL 默认启用 SGX simulation 梯度保护。目标机器如果没有硬件 SGX，也必须安装 Intel SGX SDK simulation runtime。

Ubuntu 20.04 可使用 Intel SGX SDK 安装包安装到 `/opt/intel/sgxsdk`。安装后验证：

```bash
source /opt/intel/sgxsdk/environment
test -f /opt/intel/sgxsdk/lib64/libsgx_urts_sim.so
test -x /opt/intel/sgxsdk/bin/x64/sgx_sign
test -x /opt/intel/sgxsdk/bin/x64/sgx_edger8r
```

可以用 SDK 自带示例验证 simulation 能启动：

```bash
cp -r /opt/intel/sgxsdk/SampleCode/SampleEnclave /tmp/sgx-sample-enclave
cd /tmp/sgx-sample-enclave
make SGX_MODE=SIM SGX_DEBUG=1
printf '\n' | ./app
```

看到 `SampleEnclave successfully returned` 说明 simulation 可用。

不安装 SGX simulation 时，默认 VFL 训练会失败。仅为兼容旧明文梯度证明，可显式设置：

```bash
export VFL_DISABLE_SGX_GRADIENT_PROTECTION=true
```

## 6. 准备或重建合约包

仓库已包含以下合约包，可直接部署：

```text
contracts/authorization/authorization_contract.7z
contracts/verification/verification_contract.7z
contracts/gc_audit/gc_audit_contract.7z
contracts/vfl_audit/vfl_audit_contract.7z
```

如果源码有修改，先安装 Go 和 `7z`，再重建：

```bash
cd contracts/authorization
./build.sh authorization_contract.7z

cd ../verification
./build.sh verification_contract.7z

cd ../gc_audit
./build.sh gc_audit_contract.7z

cd ../vfl_audit
./build.sh vfl_audit_contract.7z
```

## 7. 部署合约

先修改 `deploy.sh` 中的 `CMC_PATH`：

```bash
CMC_PATH="/path/to/chainmaker-go/tools/cmc/cmc"
```

确保 `SDK_CONFIG` 指向目标链配置：

```bash
SDK_CONFIG="./config/sdk_config.yml"
```

然后执行：

```bash
cd app/service/mpc
chmod +x deploy.sh
./deploy.sh
```

脚本会部署 4 个合约：

```text
authorization
verification
gc_audit
vfl_audit
```

如果链上已经存在同名同版本合约，创建会失败。此时应使用长安链合约升级流程，或调整版本号后重新部署，不能简单重复 `create`。

## 8. 启动服务

宿主机运行：

```bash
cd app/service/mpc
source /opt/intel/sgxsdk/environment
export CONFIG_PATH=./config/config.yaml
export SDK_CONFIG_PATH=./config/sdk_config.yml
export ENABLE_GARBLED_CIRCUIT=true
export ENABLE_ITMAC_AUDIT=true
export flask_app_token=<审计服务token>
go build -o -buildvcs=false mpc_server ./server && ./mpc_server
```

Docker Compose 运行：

```bash
cd app/service/mpc
docker compose up --build
```

运行前必须检查 `docker-compose.yml` 中的证书挂载路径：

```yaml
volumes:
  - ../../../chain1-local/config/wx-org1.chainmaker.org/certs:/root/chain1-certs:ro
```

目标电脑路径不同就必须改。容器访问宿主机链时保留：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

注意：当前推荐宿主机运行 SGX-protected VFL。Docker 镜像若未安装 Intel SGX SDK，则需要在镜像内补装 SDK，或设置 `VFL_DISABLE_SGX_GRADIENT_PROTECTION=true` 回退到旧明文证明模式。

## 9. 验证部署

健康检查：

```bash
curl http://localhost:8091/api/v1/health
```

VFL 流程测试：

```bash
cd app/service/mpc
BASE_URL=http://localhost:8091/api/v1 ./test_vfl_flow.sh
```

混淆电路和 IT-MAC 审计流程测试：

```bash
cd app/service/mpc
BASE_URL=http://localhost:8091/api/v1 ./test_gc_itmac_flow.sh
```

通过标准：

- 服务能启动，说明 SDK 配置和证书基本可用。
- `test_vfl_flow.sh` 通过，说明 `vfl_audit` 已部署且服务可调用。
- GC 流程通过，说明 `authorization`、`verification`、`gc_audit` 可调用。

代码级测试：

```bash
cd app/service/mpc
GOMODCACHE=$PWD/.gomodcache GOCACHE=$PWD/.gocache go test ./crypto/vfl ./tests/unit/crypto ./contracts/vfl_audit ./server -count=1
```

## 10. 常见失败定位

`contractName not found`：服务连接的链上没有对应合约，或服务连接的不是部署合约的那条链。

TLS 握手失败或证书错误：`sdk_config.yml`/`sdk_config.docker.yml` 中的 CA、TLS 证书、节点地址不属于同一条链。

Docker 内连接 `127.0.0.1:12301` 失败：容器内的 `127.0.0.1` 是容器自身。宿主机链应使用 `host.docker.internal:12301`，远程链应使用远程 IP 或域名。

合约重复部署失败：同名同版本合约已经存在。使用合约升级流程，或变更版本号后部署。

完整数据流调用 `data_storage` 失败：当前 `contracts/` 目录没有 `data_storage` 合约包。只部署本组件的 MPC/VFL 能力时，最小合约集合是 `authorization`、`verification`、`gc_audit`、`vfl_audit`。

`SGX simulation runtime not found`：未安装 `/opt/intel/sgxsdk`，或启动前没有 `source /opt/intel/sgxsdk/environment`。默认 VFL 隐私训练依赖 `libsgx_urts_sim.so`。
