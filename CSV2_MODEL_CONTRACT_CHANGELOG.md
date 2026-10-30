# CSV2 模型与数字合约改造及验收记录

本次已在正式 v2 底层服务中实现模型上传、模型摘要绑定合约、合约通过后放行 data/weight 的完整业务顺序。模型明文保留在 CSV2 来宾私有内存中，当前仍使用原 data/weight 加权计算，不执行上传的 C 模型。外层创建/启动路由、默认 8 核 4G、系统盘、原 bootstrap、EC 封装和 vTKM 生钥方式沿用原设计。

## 生效发布

| 项目 | 值 |
|---|---|
| release | `csv2-production-contract` |
| baselineHash | `e3436a19adca033f6a1e171bc34fda81e8ecbda4e66b93328addf0a10c56c07f` |
| expected_measure | `d838b27e25f2118e8212dcba62f747c5630e95e78dff9bc520e544cc0d20c749` |
| 业务压缩包 SHA-256 | `5bf1d12da4964a09e55b5c4b4f6c4e7f59461976bf863fd97f58bbf069653d5e` |

逐文件/组件摘要在新发布的 inventory.json 内，baseline.json 与 baseline.sig 已重新签名并验证。硬件预期启动度量由官方 csv-measure 根据批准的启动输入离线计算，没有把实测报告自动登记为基线。旧发布仍固定不变；创建新实例会选用当前发布。

## 本次需提交的代码

| 正式文件 | 变更逻辑 |
|---|---|
| `/var/lib/vm-api/measure-files/service_new.tar.gz` | 三个业务引擎、内存任务状态与构建头文件；移除归档中的旧合约样本。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/gate.py` | 转发并严格校验模型 plainSize、fileType 与合约计数字段；沿用证明授权和 VM ID 检查。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/legacy_patch.py` | 按批准摘要接受新 C 引擎；防止未经审查的引擎源码悄悄进入构建。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/build_image.py` | 将三个新头文件纳入受度量构建输入和摘要清单，编译现有三个业务服务。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/tests/test_service_runtime.py` | 真实持续运行的 C 服务、模拟 vTKM 的全流程、边界、失败与重启测试。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/tests/test_legacy_patch.py` | 实际 JSON 解析器、源码批准与 vTKM 管道超时/异常测试。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/tests/test_gate.py` | 网关类型约束、VM ID、授权、接口透传等回归测试。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/tests/test_build_image.py` | 检查新增头文件被记录在构建输入与度量清单中。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/tests/model_contract_live.py` | 新增：18080 真实 vTKM/EC 正向与错误合约验收程序，不负责 VM 创建/删除。 |
| `/opt/vm-api-service/stable_scripts/v2/csv2/OPERATIONS.txt` | 同步模型与合约阶段、纯内存密钥和发布更新说明。 |

业务包中的源码变动如下；提交 service_new.tar.gz 时这些成员必须一起更新。若仓库单独管理解包后的源码，也按此表同步。

| 包内路径 | 类型 | 逻辑 |
|---|---|---|
| `service/recv-key/receive-key.c` | 修改 | 校验 VM ID/阶段；vTKM 生钥、原 EC 封装；密钥交给内存任务，无文件共享。 |
| `service/recv-json/receive-json.c` | 修改 | 摘要绑定实际模型；严格 UTC/非负计数；合约明文提交内存任务，失败清理。 |
| `service/recv-file/receive-file.c` | 修改 | 接收与保留模型、按 plainSize 计算摘要；执行合约门禁和原加权计算；统一持有业务内存。 |
| `service/rebuild.sh` | 修改 | 编译时增加公共头文件包含目录。 |
| `service/csv2_session.h` | 新增 | VM ID 核对、私有进程通信、内存锁定/禁止 core dump、严格 Base64。 |
| `service/csv2_session_store.h` | 新增 | 单次启动的模型/合约/密钥状态机、失败清零、进程重启防止复用。 |
| `service/csv2_json.h` | 新增 | 沿用严格 JSON 解析并新增精确整数 plainSize 解析。 |

三个同名 C 可执行文件已重新编译，正常部署仍按原 bootstrap 流程在来宾中重编译。已删除包内 `service/recv-json/data/digitalContract.json` 这一旧样本，避免误认为新业务合约落盘。未改变母版系统和原有启动依赖安装逻辑。

## 业务流程和验收

```text
启动度量/远程证明通过
 → model key → model.c 解密、精确长度摘要与明文留存
 → contract key → 模型摘要/UTC 时间/次数条件校验
 → data key → data 上传
 → weight key → weight 上传 → 原加权计算 → 加密结果
```

密钥都由真实 vTKM 产生，外部保持 P-256 ECDH + SHA256 + AES-GCM。内部取消 sm4_key.bin，使用 root 私有 Unix 套接字把阶段密钥交给任务进程内存；没有新对外端口。完整模型、合约、data/weight 同属一轮任务，正常结果生成后保留；失败时清零任务持有的材料。VM 重启后回到初始状态，进程中途重启则拒绝沿用旧任务。

| 验收项 | 结果 |
|---|---|
| 最终发布测试 VM | `64b99d5e172d2f32`，8 核 / 4096 MB，已停止删除 |
| 首次启动 | 198.08 秒，`passed=true`、`online-kds`、`kdsOnline=true` |
| 同实例重启 | 25.74 秒，新证明通过，内存任务与材料为空 |
| 真实正向链路 | 模型、合约、data、weight 均成功；结果解密为 16、36 |
| 明文保留与文件检查 | 结果生成后仍有 31 字节模型、138 字节合约；三个进程内存均已锁定，无模型、合约或 SM4 密钥明文文件 |
| 错误合约 | 返回 60012 model_hash_mismatch；模型和合约长度清零、状态 FAILED；继续请求密钥返回 60020 |
| 越序/VM ID | 无合约的 data/weight、无模型的合约、错误 VM ID、重复取钥均拒绝 |
| 边界与异常（离线） | 1/15/16/17 字节和 10 MiB 模型；尾零、额外密文块、非法 Base64/长度、时间/计数、helper 超时、服务重启 |
| 回归 | 248 项：213 通过；35 项旧失败在修改前源码也复现；新增回归失败 0 |
| 资源清理 | QEMU 停止、实例及 /run 启动目录删除；只清理本次 VM 的 VID |

那 35 项旧失败包括 32 项生命周期测试缺少当前签名系统盘基线的夹具、1 项仍要求无盘 QEMU 的测试，以及 2 项旧启动/挑战边界断言。未据此宣称全仓库测试全绿；详细失败用例保存在同名 JSON 验收记录中。本次没有为让旧断言通过而改动实际启动和证明安全策略。

本机实测确认应用解密/内存留存/门禁行为及 CSV2 启动验证，不等同于对任意业务输出提供硬件签名。合约接口也不验证外部合约签名或链上状态；正式合约来源、历史计数、买卖双方和订单权限由原型平台管理。原有宿主 vPSP HugePage 泄漏未调整。

## 平台联调调整

关闭“跳过合约”分支。按模型→合约→data→weight 串行调用，每阶段各请求一次密钥；合约 fileHash 使用平台正式合约的 model_file_hash。失败任务结束并清理，不能反复取钥覆盖。原等待依赖装载、启动证明反馈、取结果与订单导出后清理流程保留。

详见 [模型与合约联调指南](TEE_MODEL_CONTRACT_INTEGRATION_GUIDE.md) 和已同步的 [整体对接手册](CSV2_PROTOTYPE_INTEGRATION_GUIDE.md)。

签名制品位于当前 release 目录；current.json 已切换。发布/验证私钥、实例会话材料及业务密钥不要上传工蜂。过程镜像、测试实例和本次中间发布均已清理，旧稳定发布保留回退。
