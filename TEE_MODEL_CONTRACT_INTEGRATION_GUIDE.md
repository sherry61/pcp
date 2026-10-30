# TEE 计算模型上传与数字合约校验联调指南

部署状态：正式业务包与签名基线已同步，实机验收通过；当前发布 `csv2-production-contract`。  
核对日期：2026-10-07  
适用范围：平台 TEE 交付后端与海光侧 `10.112.14.6:18080` 业务服务

## 1. 联调目标

当前 `/api/receive-json` 中的 `fileHash` 已按以下语义实现：

- `fileHash` 必须是本笔交易正式数字合约中的 `model_file_hash`；
- `model_file_hash` 来源于买方在交易申请阶段提交的 `.c` 文件，平台当时仅流式计算 SHA-256 并写入数字合约，不保存模型文件；
- 每次执行交付时，买方必须重新提交本次实际使用的同一个 `.c` 模型；
- 平台后端先调用海光 `/api/receive-key` 获取模型传输密钥，再加密模型并调用 `/api/receive-file`；
- 海光侧在 TEE 受保护内存中解密模型，对原始模型字节计算 SHA-256；
- 随后接收加密数字合约，将合约 `fileHash` 与本轮 TEE 内计算的模型 SHA-256 比较；
- 只有哈希一致且其他合约条件全部通过，才能接收 data/weight 并执行计算。

`fileHash` 不再表示固定业务压缩包摘要。海光运行包与证明网关仍由签名基线、受度量 initramfs 和启动证明对应；基础系统盘沿用原方案，不新增运行时系统文件度量。需要记录业务包版本时另用 `serviceArchiveHash`，不能复用 `fileHash`。

**本次需要平台改动的是业务编排，不是创建/启动 API。** 原有等待依赖装载、启动响应中的 `remoteAttestation`、18080 入口和 EC 解封装保持不变。平台原有“自动交付跳过合约校验”开关必须关闭：海光服务已强制要求模型与合约通过，不能再从 data key 开始。

## 2. 强制调用顺序

一个 VM 的一次启动只承载一轮交付，状态同时绑定真实 `vmId` 和本次启动。模型、合约、data、weight 都保留在来宾私有内存中；目前计算仍使用原来的 data/weight 加权算法，不编译或执行上传的 `.c`。顺序如下：

```text
VM 启动并完成远程证明
  -> 服务进入 WAITING_MODEL
  -> POST /api/receive-key   fileType=model
  -> POST /api/receive-file  fileType=model
  -> TEE 解密模型并计算 SHA-256，进入 MODEL_READY
  -> POST /api/receive-key   fileType=contract
  -> POST /api/receive-json  加密数字合约
  -> 比较 contract.fileHash 与本轮 model SHA-256
  -> 校验通过，进入 CONTRACT_VERIFIED
  -> POST /api/receive-key   fileType=data
  -> POST /api/receive-file  fileType=data
  -> POST /api/receive-key   fileType=weight
  -> POST /api/receive-file  fileType=weight
  -> 计算并生成结果
```

必须由海光服务端强制执行顺序，不能只依赖平台编排。未完成模型校验和数字合约校验时，data/weight 接口必须拒绝。

## 3. `/api/receive-key` 调整

现有 EC P-256 + AES-256-GCM 密钥封装协议保持不变，四种阶段均要求显式传入 `fileType`；其中新增：

- `model`：用于本轮 `.c` 模型加密上传；
- `contract`：用于加密数字合约及 `deliveried_cnt`。

请求示例：

```json
{
  "vmId": "0123456789abcdef",
  "fileType": "model",
  "ecPublicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

返回结构继续使用现有 `ephPub`、`salt`、`nonce`、`tag`、`ciphertext`。模型、合约、data、weight 每个阶段分别由 vTKM 生成新密钥，再按原 EC 协议封装。各阶段只申请一次，当前阶段用完才进入下一阶段；重复取钥或越序请求返回 409，不覆盖已有任务。

来宾不再通过 `sm4_key.bin` 共享密钥：`receive-file` 持有本轮内存状态；取钥与合约服务经仅来宾 root 可访问的 `/run/csv2-state/session.sock` 协作。该套接字不对外映射，不需要原型后端调整路径，也不增加外部端口。各阶段用完会清零来宾保留的该阶段 SM4 密钥；客户端仍需暂存 weight key 用于结果解密。

## 4. `/api/receive-file` 新增模型类型

### 4.1 请求格式

`/api/receive-file` 新增 `fileType=model`：

```json
{
  "vmId": "0123456789abcdef",
  "fileType": "model",
  "name": "model.c",
  "plainSize": 1837,
  "iv": "<Base64：16 字节随机 IV>",
  "ciphertext": "<Base64：SM4-CBC 模型密文>"
}
```

约束：

- `name` 固定为 `model.c`，不得依赖买方原始文件名；
- `plainSize` 是加密前模型的精确字节数，必须为正整数；
- 默认最大模型大小为 10 MiB，即 `plainSize <= 10485760`；
- 加密方式与现有 data/weight 一致：SM4-CBC、16 字节随机 IV、NoPadding；
- 明文末尾使用 `0x00` 补齐到 16 字节倍数，原始长度已经对齐时不额外增加一块；
- TEE 解密后只取前 `plainSize` 个字节作为原始模型，SHA-256 必须对这部分精确字节计算；
- 密文字节数必须严格等于 `ceil(plainSize / 16) * 16`，尾部补齐区必须全部为 `0x00`；多发一整块也拒绝；
- 合约中的 SHA-256 用 64 位十六进制字符串表示；服务内按固定 32 字节摘要比较，响应不返回该摘要。

`plainSize` 必须参与校验，因为 `.c` 文件也可能包含末尾零字节，不能通过简单删除尾部零字节恢复原文。

### 4.2 成功响应

```json
{
  "code": 200,
  "vmId": "0123456789abcdef",
  "fileType": "model",
  "model_received": true,
  "waiting_for": "contract"
}
```

响应不需要返回模型明文，也不建议返回模型哈希。模型哈希只保存在当前 `vmId` 的本轮受保护会话状态中，供随后 `/api/receive-json` 比较。

## 5. `/api/receive-json` 合约语义调整

合约明文至少包含：

```json
{
  "fileHash": "<正式数字合约中的 model_file_hash>",
  "timestamp": "2026-10-07T08:00:00Z",
  "delivery_cnt": "3"
}
```

外层请求保持：

```json
{
  "vmId": "0123456789abcdef",
  "iv": "<Base64：16 字节 IV>",
  "deliveried_cnt": "<Base64：已成功交付次数密文>",
  "ciphertext": "<Base64：数字合约 JSON 密文>"
}
```

合约 JSON 和 `deliveried_cnt` 继续使用 SM4-CBC + PKCS#7，并使用本次请求的同一个 IV。字段含义：

- `fileHash`：正式数字合约 `model_file_hash`；
- `delivery_cnt`：正式数字合约 `delivery_limit`；
- `deliveried_cnt`：平台统计的历史成功交付次数，仅 `SUCCESS` 记录计数，不包含失败记录和本次 `RUNNING` 临时占用；
- `timestamp`：UTC 秒精度时间，格式为 `YYYY-MM-DDTHH:MM:SSZ`。

海光侧处理步骤：

1. 确认当前 `vmId` 已完成模型上传并已申请独立 contract key，即处于 `CONTRACT_KEY_READY`；
2. 解密数字合约和 `deliveried_cnt`；
3. 校验字段格式、时间和交付次数；
4. 常量时间比较 `lowercase(contract.fileHash)` 与当前会话中的模型 SHA-256；
5. 一致时设置 `CONTRACT_VERIFIED`；
6. 不一致时清除本轮模型明文、模型哈希和相关密钥，并禁止进入 data/weight 阶段。

## 6. 状态隔离和服务门禁

服务端已实现以下阶段；不能依赖前端缓存的阶段来跳过校验：

```text
WAITING_MODEL
MODEL_KEY_READY
MODEL_READY
CONTRACT_KEY_READY
CONTRACT_VERIFIED
DATA_KEY_READY
DATA_READY
WEIGHT_KEY_READY
RESULT_READY
FAILED
```

状态必须同时绑定 `vmId` 和本次 VM 生命周期：

- VM 重启后清空模型、哈希、密钥、合约通过状态和计算材料；
- 一个 VM 的模型或合约状态不能被另一个 VM 读取；
- 新一轮交付不能继承上一轮 `CONTRACT_VERIFIED`；
- 合约未通过时，`fileType=data` 和 `fileType=weight` 均返回明确的顺序错误；
- 同一轮模型不能覆盖，合约通过后也不能重新上传或重新取 model key；当前不提供公开 reset 接口；
- `receive-file` 重启后进入失败态，不恢复之前的合约通过状态；VM 重启才产生全新状态；
- 合约失败或解密/计算失败后，本轮失败关闭，平台应结束该 attempt 并按约定清理 VM，不自动重试整段任务。

## 7. 当前错误响应

保留现有错误结构，以下错误已实现：

| HTTP | code | error | 含义 |
|---|---:|---|---|
| 400 | 60012 | `model_hash_mismatch` | 合约模型哈希与本轮实际模型哈希不一致 |
| 400 | 60017 | `invalid_model_file` | 模型类型、大小、`plainSize` 或补齐格式非法 |
| 409 | 60018 | `model_required` | 尚未成功接收模型就提交数字合约 |
| 409 | 60019 | `contract_not_verified` | 合约未通过就请求 data/weight |
| 409 | 60020 | `invalid_stage` | 当前会话阶段不允许该操作 |

原有 `60013` 时间格式错误、`60014` 未来时间、`60016` 交付次数超限继续保留；`60015` 表示计数不是非负十进制整数字符串或超出有符号 64 位范围。时间必须有 `Z` 且日期真实存在；不再接受本地时间或负计数。

```json
{"code":60012,"error":"model_hash_mismatch","message":"model_hash_mismatch"}
```

VM ID 不匹配仍返回 `403 vm_mismatch`；取钥服务内部错误仍为 HTTP 5xx，证明网关会按原规则撤销该次启动授权。一般字段格式错误可在调用方修正后重新提交，但已进入解密/校验后发生的失败会清理本轮材料。收到 `60020` 且本轮已失败时，不能继续该轮任务。

## 8. 安全要求

- 模型明文只能存在于 TEE 受保护内存，不得写入宿主机或来宾文件系统；
- 不得在日志、异常堆栈、审计记录或响应中输出模型内容；
- 平台传来的原始文件名不得写入日志，协议中统一使用 `model.c`；
- 模型接收后保留完整原始明文、精确长度和摘要；即使目前不执行模型，也不在算完摘要后清除。合约通过后同样保留完整合约，data/weight 和结果随本轮任务保留；
- 哈希不匹配及任务失败时，服务显式清零所持模型、合约、输入、密钥和摘要；正常进程退出也执行清理。VM 停止/销毁后进程与私有内存不再可访问，重启不恢复任何业务材料；不要把强制断电描述为执行了来宾用户态清零函数；
- 三个业务进程禁止 core dump，并锁定内存防止换出；初始化失败不开放服务。CSV 负责私有页的硬件保护，`mlockall` 本身不是内存加密功能；
- 模型、合约、data、weight 的密钥必须按阶段隔离；
- 哈希比较使用固定长度、常量时间比较；
- `/api/receive-file` 不得仅凭前端调用顺序放行，必须检查服务端状态机。

## 9. 平台侧接口约定

买方前端不会直接访问海光接口，也不会在浏览器进行 SM4 加密。前端只调用平台接口：

```http
POST /api/privacy/tee/model
Content-Type: multipart/form-data

transactionId=<交易号>
modelFile=<.c 文件>
```

下列原型平台路由由平台侧提供，不是海光新增接口。平台后端收到后执行：

1. 校验当前交易已绑定 VM 且后端状态为 `WAITING_MODEL`；
2. 在内存中接收 `.c`，不落盘、不记录文件内容或原始文件名；
3. 调用海光 `/api/receive-key`，`fileType=model`；
4. 解封装 16 字节 SM4 密钥；
5. 按 data/weight 相同方式加密，携带 `plainSize` 调用 `/api/receive-file`；
6. 海光返回模型接收成功后，释放平台侧暂存模型与该阶段 SM4 密钥；来宾内仍保留模型。平台使用的语言若无法保证不可变对象的原地清零，应按自身运行时能力管理敏感缓冲区；
7. 平台从数据库读取正式数字合约，另行协商 `fileType=contract` 密钥并调用 `/api/receive-json`；
8. 合约通过后才继续现有 data/weight 自动交付流程。

## 10. 联调验收用例

海光侧已完成下列相关自动化与实机检查；原型团队仍须用本方订单、权限、合约来源和清理调度进行端到端验收：

1. 已知 `.c` 原文在平台和 TEE 内得到相同 SHA-256，合约通过；
2. 模型只改变一个字节，数字合约不变，返回 `60012 model_hash_mismatch`；
3. 模型长度分别取 1、15、16、17 字节，TEE 均按 `plainSize` 计算正确哈希；
4. 非 `.c`、空文件、超过 10 MiB、非法 Base64、错误 IV、非法 `plainSize` 均拒绝；
5. 未上传模型直接提交合约，返回 `60018 model_required`；
6. 模型已上传但未通过合约时提交 data/weight，返回 `60019 contract_not_verified`；
7. 正确模型和合约通过后，data、weight、结果生成全流程成功；
8. 同一交易第二次交付使用新 VM，不能继承第一次模型哈希或合约状态；
9. 合约哈希不匹配后重新请求 data/weight 必须继续被拒绝；
10. VM 重启后确认模型与合约长度为零、回到 WAITING_MODEL；删除后确认 QEMU、VID 和实例目录清理成功。

正式验收日志只记录 `vmId`、阶段、时间、业务错误码和是否通过，不记录模型内容、SM4 密钥、完整密文或完整模型哈希。


## 11. 发布与本机验收记录

本次修改已进入正式业务归档与签名发布，不需要在每次创建时重新计算信任基线。创建/启动会校验固定基线，旧实例仍绑定原发布；需要按新流程联调时创建新实例。

| 项目 | 当前值 |
|---|---|
| 正式业务包 | `/var/lib/vm-api/measure-files/service_new.tar.gz` |
| 正式发布 | `csv2-production-contract` |
| `baselineHash` | `e3436a19adca033f6a1e171bc34fda81e8ecbda4e66b93328addf0a10c56c07f` |
| 预期 CSV 启动度量 | `d838b27e25f2118e8212dcba62f747c5630e95e78dff9bc520e544cc0d20c749` |
| 实机规格 | 8 核 / 4096 MB / 原有系统盘 |
| 正向流程 | 在线证明通过；真实 vTKM + EC 封装；模型/合约/data/weight 全链路通过；解密分数 16、36 |
| 内存检查 | 三个进程均锁定内存；结果生成后模型与合约仍在内存中；无模型/合约/SM4 密钥明文文件 |
| 失败路径 | 重启后提交错误模型摘要，返回 60012；内存任务清空；继续取 data key 返回 60020 |
| 回归 | 248 项测试中 213 项通过；35 项旧失败在未修改源码上同样复现，未计为本次验收通过 |
| 清理 | 测试 VM 已停止并删除 |

本接口负责模型摘要、合约时间和计数条件校验，不自动验证平台数字合约的外部签名或链上状态，也不维护跨 VM 的历史交付次数。平台仍应从正式订单/合约记录取得字段，维护成功次数和并发占用，并校验买卖双方权限。原型原有结果保存和导出后两分钟清理逻辑保持平台侧职责。

海光侧可在独立测试 VM 上运行 `stable_scripts/v2/csv2/tests/model_contract_live.py --vm-id <真实VMID>`；这是运维验收程序，不是客户 API，也不创建/删除 VM。错误合约测试使用 `--scenario mismatch`，必须在全新启动上单独执行。测试程序依赖同目录 `test_service_runtime.py` 的内存加密辅助函数。

实现位置：业务包内 `recv-key/receive-key.c`、`recv-json/receive-json.c`、`recv-file/receive-file.c` 和 `csv2_session.h`、`csv2_session_store.h`、`csv2_json.h`；宿主侧仍沿用 v2 的 `gate.py`、`build_image.py`、`legacy_patch.py`。完整增改文件见 [本次改造与验收记录](CSV2_MODEL_CONTRACT_CHANGELOG.md)。
