#!/bin/bash
set -euo pipefail

# 使用长安链官方cmc工具部署合约
CMC_PATH="/home/super/r/ssd2/chainmaker/chainmaker-go/tools/cmc/cmc"  # cmc工具路径
SDK_CONFIG="./config/sdk_config.yml"

# 部署授权合约
echo "部署授权合约..."
${CMC_PATH} client contract user create \
    --contract-name=authorization \
    --runtime-type=DOCKER_GO \
    --byte-code-path=./contracts/authorization/authorization_contract.7z \
    --version=1.0.0 \
    --sdk-conf-path=${SDK_CONFIG} \
    --admin-key-file-paths=./config/crypto_config/user/admin1/admin1.sign.key \
    --admin-crt-file-paths=./config/crypto_config/user/admin1/admin1.sign.crt \
    --enable-cert-hash=false \
    --sync-result=true

# 部署验证合约
echo "部署验证合约..."
${CMC_PATH} client contract user create \
    --contract-name=verification \
    --runtime-type=DOCKER_GO \
    --byte-code-path=./contracts/verification/verification_contract.7z \
    --version=1.0.0 \
    --sdk-conf-path=${SDK_CONFIG} \
    --admin-key-file-paths=./config/crypto_config/user/admin1/admin1.sign.key \
    --admin-crt-file-paths=./config/crypto_config/user/admin1/admin1.sign.crt \
    --enable-cert-hash=false \
    --sync-result=true

# 部署audit合约
echo "部署audit合约..."
${CMC_PATH} client contract user create \
    --contract-name=gc_audit \
    --runtime-type=DOCKER_GO \
    --byte-code-path=./contracts/gc_audit/gc_audit_contract.7z \
    --version=1.0.0 \
    --sdk-conf-path=${SDK_CONFIG} \
    --admin-key-file-paths=./config/crypto_config/user/admin1/admin1.sign.key \
    --admin-crt-file-paths=./config/crypto_config/user/admin1/admin1.sign.crt \
    --enable-cert-hash=false \
    --sync-result=true

echo "部署VFL审计合约..."
${CMC_PATH} client contract user create \
    --contract-name=vfl_audit \
    --runtime-type=DOCKER_GO \
    --byte-code-path=./contracts/vfl_audit/vfl_audit_contract.7z \
    --version=1.0.0 \
    --sdk-conf-path=${SDK_CONFIG} \
    --admin-key-file-paths=./config/crypto_config/user/admin1/admin1.sign.key \
    --admin-crt-file-paths=./config/crypto_config/user/admin1/admin1.sign.crt \
    --enable-cert-hash=false \
    --sync-result=true
