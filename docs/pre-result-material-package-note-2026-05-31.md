# PRE 结果下载补齐材料说明

日期：2026-05-31

## 背景

当前 PRE 主流程已经跑通：

- 卖家发布 PRE 交付
- 买家上传 PRE 公钥
- PCP 执行重加密
- 买家可收到结果通知并下载 `pre_result.tar`

但目前买家下载到的 `pre_result.tar` 还不足以在前端直接恢复原始压缩包。

## 问题说明

按当前 PRE 实现，重加密阶段完成的是“密钥访问权转移”，不是“原始文件解密”。

也就是：

1. 卖家先把原始压缩包加密成本地密文材料
2. TEE 持有可解开文件密钥的权限
3. PRE 重加密后，TEE 把文件密钥的访问权转移给买家公钥
4. 买家再用自己的私钥解出文件密钥
5. 最后还需要用该文件密钥去解开原始密文文件，才能恢复原始压缩包

因此，买家本地最终解密时，不仅需要重加密结果包，还需要卖家最初上传的密文三件套。

## 当前下载结果的不足

当前买家从 PCP 下载到的 `pre_result.tar`，本质上是：

- 重加密后的结果包

它不能单独完成前端最终解密，因为缺少卖家原始密文三件套。

## 前端最终解密所需材料

前端若要在本地恢复出原始压缩包，至少需要以下材料：

### 1. 重加密结果包

用于买家使用自己的私钥解出最终文件解密密钥。

### 2. 卖家原始密文三件套

- `source_cipher_file`
  原始压缩包加密后的密文文件

- `source_wrapped_key_file`
  原始文件解密密钥的包装材料

- `source_meta_file`
  解密所需元信息，例如算法、IV、内容类型等

## 建议改法

建议保持现有 PRE 计算逻辑不变，只调整买家结果下载时的交付内容。

也就是在买家可下载结果中，除了当前的重加密结果包外，再把卖家原始密文三件套一并交付给买家。

建议返回的结果材料至少包含：

- re-encrypted result package
- `source_cipher_file`
- `source_wrapped_key_file`
- `source_meta_file`

## 推荐实现方向

### 方案一：补齐下载材料包

保持现有 PRE 核心算法、任务状态流转、重加密流程都不变。

只在结果下载阶段，把下列材料统一打包返回给买家：

- 重加密结果包
- `source_cipher_file`
- `source_wrapped_key_file`
- `source_meta_file`

这是最推荐的方案，因为：

- 不需要改 PRE 核心算法
- 不需要改 TEE 重加密逻辑
- 只改结果组织方式
- 前端可以本地完成最终解密闭环

### 方案二：PCP 直接生成买家最终消费包

由 PCP 直接输出一个适合买家前端本地解密的统一结果包。

这个方案也可行，但改动范围会比方案一更大，因为需要重新定义最终结果格式。

## 前端本地解密预期流程

如果下载材料补齐，前端本地解密流程将是：

1. 买家下载结果材料包
2. 买家上传自己此前保存的 PRE 私钥文件
3. 前端使用私钥解开 re-encrypted result package，得到文件解密密钥
4. 前端使用该密钥解开 `source_cipher_file`
5. 最终恢复出原始压缩包
6. 浏览器导出解密后的原始压缩包

## 现阶段诉求

我们这边希望 PCP 在买家结果下载中，除了当前的重加密结果包外，再提供：

- `source_cipher_file`
- `source_wrapped_key_file`
- `source_meta_file`

这样前端即可在不把原文和私钥上传到服务端的前提下，完成最终本地解密。

## 结论

当前 PRE 结果链路已经具备“换锁成功”的能力，但还缺“最终还原原始压缩包”的下载材料。

最小改动方案是：

- 不改 PRE 核心逻辑
- 只补齐买家下载结果时的材料包内容

这样可以最快形成 PRE 的完整可用闭环。

## 接口返回结构建议

建议对外仍保持一个统一下载入口，但下载内容从“仅返回重加密结果包”调整为“返回完整结果材料包”。

可以有两种落地方向。

### 方向一：继续返回 tar，但补齐完整材料

保持当前下载接口语义不变，例如仍由：

- `GET /download/{token}`

返回一个 tar 包。

建议 tar 内至少包含以下文件：

- `manifest.json`
- `result/reencrypted.manifest.json`
- `result/cipher.bin`
- `result/wrapped_key.bin`
- `result/meta.json`
- `source/source_cipher.manifest.json`
- `source/source_cipher.bin`
- `source/source_wrapped_key.bin`
- `source/source_meta.json`

其中：

- `result/*` 表示重加密结果包材料
- `source/*` 表示卖家原始密文三件套材料

建议 `manifest.json` 结构如下：

```json
{
  "version": 1,
  "result_role": "pre_result",
  "contract_id": "PRE_TASK_xxx",
  "source_contract_id": "CONTRACT-xxx",
  "format": "pre_material_package",
  "result_package": {
    "manifest_path": "result/reencrypted.manifest.json",
    "cipher_path": "result/cipher.bin",
    "wrapped_key_path": "result/wrapped_key.bin",
    "meta_path": "result/meta.json"
  },
  "source_package": {
    "manifest_path": "source/source_cipher.manifest.json",
    "cipher_path": "source/source_cipher.bin",
    "wrapped_key_path": "source/source_wrapped_key.bin",
    "meta_path": "source/source_meta.json"
  }
}
```

这个方案对前端最友好，因为：

- 仍然只下载一个 tar
- 前端解包后按 `manifest.json` 取材料即可
- 对外接口形式变化最小

### 方向二：状态接口直接返回材料清单

如果不想在 tar 内自己约定路径，也可以在状态接口中直接返回一个结构化字段，明确告诉前端有哪些结果材料。

例如在 `PRE /status` 响应中新增：

```json
{
  "code": 0,
  "message": "OK",
  "data": {
    "contract_id": "PRE_TASK_xxx",
    "status": "COMPLETED",
    "result": {
      "type": "pre_material_package",
      "download_token": "xxx",
      "filename": "pre_result.tar",
      "material_manifest": {
        "result_package": {
          "manifest_s3_uri": "s3://.../pre/result_packages/.../reencrypted.manifest.json"
        },
        "source_package": {
          "manifest_s3_uri": "s3://.../pre/source_cipher/.../source_cipher.manifest.json"
        }
      }
    }
  }
}
```

这样前端即使只下载一个 tar，也能提前知道 tar 里应该包含哪些东西；如果后续要拆成多文件下载，也更容易演进。

### 推荐方案

更推荐 **方向一**：

- 继续保持 `download_token + tar 下载` 机制
- 只扩展 tar 内容
- 在 tar 根目录增加统一 `manifest.json`

这样改动最小，兼容当前下载链路，也最容易让前端做到“用户只看到最终下载一个压缩包”。
