# MPC/GC 问题排查与修复总结

日期: 2026-07-03

## 1. 问题背景

本次排查围绕 `mpc_` 目录下的 Flask 中转服务、`mpc_server`、后端 `backend` 的 MPC 路由，以及前端资产交付页面展开。

用户最初观察到的问题包括:

- `mpc_server` 和 Flask 服务启动关系不清晰
- 端口 `8091` 与系统已有服务冲突
- GC/MPC 任务在“资产交付”流程中频繁报错
- 买方请求交付后，卖方页面状态不推进
- 卖方提交材料后前端长时间转圈，体验很差

## 2. 最终确认的启动方式

当前这套链路涉及两个本地服务:

- Flask 中转服务: `28090`
- `mpc_server`: `28091`

职责划分:

- Flask 负责 MPC 任务创建、文件上传、任务状态维护
- `mpc_server` 负责真正的 GC/MPC 业务、授权、评估和链上审计

当前关键配置:

- [config.yml](/home/super/fqh/mpc_/config.yml:1)
- [config.yaml](/home/super/fqh/mpc_/app/service/mpc/config/config.yaml:1)
- [sdk_config.yml](/home/super/fqh/mpc_/app/service/mpc/config/sdk_config.yml:1)

## 3. 主要问题与根因

### 3.1 端口冲突

原先 `mpc_server` 使用 `8091`，与现有系统服务冲突。

修复:

- Flask 改为 `28090`
- `mpc_server` 改为 `28091`
- 后端默认请求地址同步改为 `http://127.0.0.1:28090/api/v1`

### 3.2 链上 RPC 超时 / 证书与 SDK 配置不一致

排查中出现过:

- `grpc connections unavailable`
- `invalid ecdsa signature`
- `DeadlineExceeded`

根因不是前端，也不是 Flask 本身，而是 `mpc_server` 的 ChainMaker SDK 配置与本机实际可用的 GoSDK 配置不一致。

重点发现:

- 正常工作的链路在 `8848` 的 GoSDK 服务中
- 该服务使用 `10.112.47.214:12301`
- `mpc_server` 的 SDK 参数、节点地址、用户证书、超时参数与之未对齐

修复:

- 将 `mpc_server` 的链节点地址对齐到 `10.112.47.214:12301`
- 将 SDK 用户从 `admin1` 对齐到当前本地可用的 `client1`
- 增加 RPC 超时与重试参数，避免 10 秒内就被错误判定为失败

修改文件:

- [sdk_config.yml](/home/super/fqh/mpc_/app/service/mpc/config/sdk_config.yml:1)
- [config.yaml](/home/super/fqh/mpc_/app/service/mpc/config/config.yaml:1)

### 3.3 后端 DB 状态与 Flask 内存任务状态失配

Flask 任务存储在内存中，Flask 重启后内存任务会丢失。

因此出现过这种现象:

- 数据库 `mpc_delivery_contracts` 中已有 `remote_task_id`
- 后端认为任务存在
- Flask 实际已经没有这条任务
- 上传卖方数据时报 `task not found`

这属于“数据库记录存在，但远端任务已经丢失”的状态失配问题。

### 3.4 后端 30 秒超时导致误判失败

即使链路已经跑通，后端仍可能在 30 秒超时后把任务写成 `failed`，但远端 Flask/`mpc_server` 实际仍在继续计算，最终会成功。

表现为:

- Flask 任务最终 `done`
- 后端数据库却保留 `failed`
- 前端看到的状态与实际完成状态不一致

根因:

- 后端默认 HTTP timeout 为 30000ms
- 同步执行的 GC 流程耗时大于 30 秒

### 3.5 前端状态同步不及时

前端原先主要靠手动点击“刷新交付状态”推进。

这导致:

- 买方请求交付后，卖方页面仍显示“待买方操作”
- 实际远端任务已创建，但页面本地状态还没更新

### 3.6 卖方提交材料后前端长时间转圈

根因不是前端弹窗逻辑，而是 Flask 的 `/task/<id>/start` 原先同步执行完整 GC 流程:

- 生成混淆电路
- 生成授权
- 数据中心评估
- 链上验证
- 审计结果存证

HTTP 只有在整条链路结束后才返回，因此前端会一直等待。

## 4. 实施的修复

### 4.1 端口与路由修复

修改:

- [config.yml](/home/super/fqh/mpc_/config.yml:1)
- [backend/mpc/client.js](/home/super/fqh/backend/mpc/client.js:1)
- [task/routes.py](/home/super/fqh/mpc_/app/service/task/routes.py:1)

效果:

- Flask 与 `mpc_server` 端口分离
- 后端默认地址与新端口保持一致

### 4.2 ChainMaker SDK 配置对齐

修改:

- [sdk_config.yml](/home/super/fqh/mpc_/app/service/mpc/config/sdk_config.yml:1)
- [config.yaml](/home/super/fqh/mpc_/app/service/mpc/config/config.yaml:1)

效果:

- 消除之前的链握手/签名/超时类错误
- MPC 链路可以实际完成链上调用

### 4.3 后端超时和状态同步修复

修改:

- [backend/mpc/client.js](/home/super/fqh/backend/mpc/client.js:1)
- [backend/mpc/routes.js](/home/super/fqh/backend/mpc/routes.js:1)

内容:

- 默认超时从 `30000ms` 提升到 `120000ms`
- 支持通过 `MPC_TASK_TIMEOUT_MS` 覆盖
- 上传卖方材料失败时把 `last_error` 回写数据库
- 即使本地数据库状态为 `failed`，后续仍允许继续向远端拉状态并纠偏

效果:

- 避免“任务实际成功，但后端永远卡在 failed”

### 4.4 前端状态自动轮询

修改:

- [DeliveryBuyer2.vue](/home/super/fqh/frontend/src/views/DeliveryBuyer2.vue:451)
- [DeliverySeller2.vue](/home/super/fqh/frontend/src/views/DeliverySeller2.vue:405)

内容:

- 买卖双方页面每 5 秒自动拉取当前页状态
- 卖方在本地还没拿到 `mpcRecord` 时允许主动检查状态

效果:

- 买方请求交付后，卖方页面无需手工反复刷新
- 更接近原先“买方一请求，卖方很快就能执行交付”的体验

### 4.5 Flask 任务启动改为异步

修改:

- [task/routes.py](/home/super/fqh/mpc_/app/service/task/routes.py:1)

内容:

- `/task/<task_id>/start` 不再同步执行完整 GC/VFL 流程
- 改为后台线程执行
- 接口先返回 `computing`

效果:

- 卖方上传材料后前端弹窗可以立即关闭
- 前端靠轮询等待最终 `done/failed`

## 5. 实测验证结果

使用真实交易 `transaction_id=250` 做了完整联调。

关键过程:

- 后端创建任务成功
- 卖方上传 JSON 材料成功
- Flask 任务状态推进到 `done`
- 后端状态同步为 `done`
- 数据库 `mpc_delivery_contracts` 最终为 `done/done`

最终结果:

- `verified: true`
- 输出结果可通过后端接口正常获取

关键成功记录:

- 授权交易 ID: `18beca1b9fb6921eca60015797130fb89376cf53acd84892a480cf0815a3f5fb`
- 审计结果交易 ID: `18beca23cc8b06afca42ef624bb6febddb0917d2729a4ad09db1b40abc11b11b`

## 6. 为什么任务仍然偏慢

现在“通了”不等于“很快”。任务仍然慢，主要原因是:

- 一次 GC 任务会触发多次链上写入
- 每次写入后 SDK 会轮询交易确认
- GC 流程本身包含授权、评估、审计等多个阶段
- 链上确认等待占了明显时间

也就是说，当前主要性能瓶颈在“多次链上确认 + 同步确认等待”，不是页面本身慢。

## 7. 当前结论

本次问题已经可以认为解决，结论如下:

- 端口冲突问题已解决
- `mpc_server` 与 Flask 启动关系已理顺
- MPC/GC 主链路已打通
- 链上错误已收敛并修复到可正常执行
- 后端状态同步问题已修复
- 前端状态推进和卖方提交材料体验已修复

当前系统已具备以下能力:

- 买方发起 MPC 请求
- 卖方提交材料
- 任务后台执行
- 前端自动轮询状态
- 最终获取计算结果

## 8. 后续建议

建议后续继续优化:

- 将 Flask 的内存任务存储迁移到可持久化介质，避免重启丢任务
- 进一步减少同步等待链确认的步骤
- 将链上非关键确认改成后台异步确认
- 为前端增加更明确的“已提交，后台处理中”提示
- 为 MPC 链路补一份固定启动文档与联调 checklist

