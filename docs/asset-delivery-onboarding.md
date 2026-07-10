# 资产交付接手指南

这份文档给新的 code agent 用，目标是用最短时间接手当前项目里的资产交付模块，快速定位前后端入口、理解四类隐私计算交付流程，并避免已知坑。

## 1. 先看哪些文件

### 前端主入口

- [frontend/src/views/DeliveryBuyer2.vue](/home/super/fqh/frontend/src/views/DeliveryBuyer2.vue)
  - 买方交付页主文件
  - 包含 `HE / FL / PRE / MPC` 四类交付的请求、状态刷新、结果下载逻辑
  - 关键方法：
    - `uploadHePublicKeys`
    - `openFlRequestDialog`
    - `uploadPrePublicKey`
    - `openMpcDialog`
    - `downloadResult`
    - `downloadFlResult`
    - `downloadPreResult`
    - `confirmDecryptPreResult`

- [frontend/src/views/DeliverySeller2.vue](/home/super/fqh/frontend/src/views/DeliverySeller2.vue)
  - 卖方交付页主文件
  - 包含四类交付的执行按钮、状态机、卖方上传和卖方下载逻辑
  - 关键方法：
    - `openHeDelivery`
    - `submitPreDelivery`
    - `submitFlDelivery`
    - `submitMpcSellerData`
    - `getSellerHeActionLabel`
    - `getSellerPreActionLabel`
    - `getSellerFlDeliveryActionLabel`
    - `getSellerMpcActionLabel`

### 前端工具层

- [frontend/src/utils/heCrypto.js](/home/super/fqh/frontend/src/utils/heCrypto.js)
  - HE 前端加解密与结果处理

- [frontend/src/utils/flCrypto.js](/home/super/fqh/frontend/src/utils/flCrypto.js)
  - FL 密钥生成、私钥导出、结果解密、底模自动解密导出

- [frontend/src/utils/preCrypto.js](/home/super/fqh/frontend/src/utils/preCrypto.js)
  - PRE 前端工具
  - 目前仍保留一部分旧的浏览器侧 PRE 能力，但当前主流程已经改成“后端 helper 协助发布/解密”

### 后端主入口

- [backend/pcp/routes.js](/home/super/fqh/backend/pcp/routes.js)
  - `HE + PRE` 主路由文件
  - 关键接口：
    - `/api/privacy/he/*`
    - `/api/privacy/pre/*`
  - 当前 PRE 新增了：
    - `/api/privacy/pre/publish` 支持 `source_archive`
    - `/api/privacy/pre/decrypt-result`

- [backend/pcp/fl-routes.js](/home/super/fqh/backend/pcp/fl-routes.js)
  - `FL` 专用路由文件
  - 关键接口：
    - `/api/privacy/fl/create-contract`
    - `/api/privacy/fl/join`
    - `/api/privacy/fl/upload-batch`
    - `/api/privacy/fl/status`
    - `/api/privacy/fl/result`

- [backend/pcp/index.js](/home/super/fqh/backend/pcp/index.js)
  - 路由注册入口

### 当前 PRE helper

- [scripts/pre_decrypt_helper.py](/home/super/fqh/scripts/pre_decrypt_helper.py)
- [scripts/pre_publish_helper.py](/home/super/fqh/scripts/pre_publish_helper.py)

这两个脚本现在是 PRE 跑通流程的关键组成部分，不是临时测试垃圾。`routes.js` 已经依赖它们。

### 外部参考资料

- `/home/super/tr/test`
  - 全流程测试样例
  - 有助于理解 PCC 期望的交付材料结构

- `/home/super/tr/pcc/docs`
  - PCC API 文档
  - 尤其要看 PRE / FL 的请求字段和结果结构

- `/home/super/tr/pcc/app/crypto/afgh_pre.py`
  - PCC 真实 PRE 实现
  - 用来确认浏览器实现和 PCC 字节协议为什么不兼容

## 2. 当前模块的真实结构

项目表面上是“资产交付”，本质上是四条不同的交付链路共用两张前端页面：

- `HE`
  - 买方先提交公钥
  - 卖方执行交付，上传两个 CSV
  - 买方下载结果并本地解密

- `FL`
  - 买方“请求交付”，上传顶层模型初始包和底层模型初始包
  - 卖方执行交付时会自动完成入会、下载卖方私钥、下载并解密底模
  - 卖方再上传训练结果压缩包
  - 买卖双方分别下载各自结果

- `PRE`
  - 买方先提交公钥并下载私钥
  - 卖方执行交付，上传原始压缩包
  - 后端 helper 负责生成 `source public key / re-encryption key / source cipher zip`
  - 买方下载加密结果，再通过后端 `/decrypt-result` 解密导出

- `MPC`
  - 买方先请求交付，创建任务
  - 卖方上传数据
  - 买方查看结果

不要试图把这四类流程抽成一个完全统一的协议层。页面能统一，协议细节不能强行统一。

## 3. 当前前端交互约定

这是已经和业务侧对齐过的一套约定，改之前先确认，不要随手推翻。

### 买方页

- 主动作统一叫 `请求交付`
- 请求后按钮文本统一尽量显示 `已请求`
- 下载按钮统一叫 `下载结果`
- `PRE` 下载弹窗不要再出现 `PRE` 字样，按 `HE` 风格做业务文案

### 卖方页

- 主动作统一叫 `执行交付`
- 进入已执行/已完成态后，按钮文本显示 `已执行`
- 禁用态文案也尽量保持按钮仍显示 `执行交付` 或 `已执行`，不要写测试味很重的内部状态
- FL 卖方弹窗已经压缩成一个主入口：
  - 先自动下载卖方私钥和底模
  - 再上传训练结果压缩包

### 交付状态文案

前端表格目前统一只显示：

- `待买方操作`
- `待卖方交付`
- `计算中`
- `审计中`
- `已完成`
- `失败`

不要再往表格里塞 PCC 内部细粒度状态名。

## 4. 已知关键注意事项

### 4.1 不要改 API_BASE

买卖方页面里写死了：

- `const API_BASE = 'http://10.112.47.214:3000'`

之前改错过，直接导致前端联调报 `Network Error`。除非业务明确要求，否则不要动。

### 4.2 PRE 不要再走纯浏览器本地实现

之前浏览器端 `mcl-wasm` PRE 实现和 PCC 的 `py_ecc`/AFGH_PRE 字节协议不兼容，典型报错是：

- `PRE 本地解密失败`
- `AES-GCM 校验未通过`

当前可用路线是：

- 卖方上传原始压缩包
- 后端调用 `pre_publish_helper.py`
- 买方下载加密结果后调用 `/api/privacy/pre/decrypt-result`
- 后端调用 `pre_decrypt_helper.py`

如果有人又想把 PRE 改回浏览器纯本地解密，先让他去读 PCC 的 `afgh_pre.py` 再说。

### 4.3 FL 的卖方 ZIP 结构很严格

`backend/pcp/fl-routes.js` 对卖方上传 ZIP 的内部文件名要求严格，缺少或重复会直接报错，例如：

- `卖方 ZIP 缺少或重复 smashed/cipher.bin`

所以接 FL 时一定先用测试样例确认 ZIP 目录结构。

### 4.4 FL 的“请求交付”与“执行交付”是两阶段

不要把 FL 理解成“买方建合同后卖方直接传文件”。

当前正确顺序是：

1. 买方请求交付，生成 FL contract
2. 卖方执行交付，先 `join`
3. 卖方自动下载私钥和底模
4. 卖方上传训练结果压缩包
5. 双方按各自角色下载结果

### 4.5 PRE helper 依赖 Python 环境

后端会找这些 Python 路径：

- `PRE_DECRYPT_PYTHON`
- `/tmp/pcc-pre-interop/bin/python`
- `/usr/bin/python3`
- `/usr/local/bin/python3`

如果 PRE 路由突然 500，先查是不是 helper 环境没准备好。

### 4.6 服务重启要谨慎

项目有 [allserve.go](/home/super/fqh/allserve.go)，但实际联调时端口占用问题出现过。

经验上：

- 需要重启时先和当前操作者确认
- 不要假设自己能安全无损地抢占端口
- 如果要改启动逻辑，优先做“启动前清理旧端口占用”的保护

### 4.7 不要提交这些东西

- `scripts/__pycache__/`
- 空目录 `mpc_/app/service/mpc/mpc_/`

## 5. 从零到一最快接法

如果是第一次接这个模块，推荐按下面顺序，不要一上来全看。

### 第一步：先看前端两张主页面

先完整读这两个文件：

- [frontend/src/views/DeliveryBuyer2.vue](/home/super/fqh/frontend/src/views/DeliveryBuyer2.vue)
- [frontend/src/views/DeliverySeller2.vue](/home/super/fqh/frontend/src/views/DeliverySeller2.vue)

重点不是看样式，而是搞清楚：

- 每种算法的主按钮是谁触发
- 请求参数从哪来
- 状态是怎么映射成页面文案的
- 下载动作是直接下载还是先弹窗再解密

### 第二步：按协议分流到后端

看完页面后再按协议进后端：

1. `HE/PRE` 看 [backend/pcp/routes.js](/home/super/fqh/backend/pcp/routes.js)
2. `FL` 看 [backend/pcp/fl-routes.js](/home/super/fqh/backend/pcp/fl-routes.js)
3. `MPC` 再顺着页面调用的 `/api/privacy/mpc/*` 去找对应实现

不要先从后端全局搜状态码，那样会非常慢。

### 第三步：只选一条链路打通

最快的策略不是四条一起看，而是先选一条最容易观测的链路打通。

推荐顺序：

1. `HE`
2. `FL`
3. `PRE`
4. `MPC`

原因：

- `HE` 最直观，前后端边界最清楚
- `FL` 业务最复杂，但当前主流程已较稳定
- `PRE` 容易踩协议兼容坑
- `MPC` 当前更多是任务编排，不是纯密码协议问题

### 第四步：联调时优先看状态接口

所有页面问题，先查对应 `status` 接口，不要先怀疑 UI。

常用接口：

- `/api/privacy/he/status`
- `/api/privacy/pre/status`
- `/api/privacy/fl/status`
- `/api/privacy/mpc/status`

页面大多数按钮禁用/文案变化，都是由这些状态接口驱动的。

### 第五步：PRE 和 FL 一定准备测试材料

没有测试数据时，联调效率会非常差。

优先使用：

- 仓库内 `testdata/`
- `/home/super/tr/test`

尤其是：

- FL 的训练结果 ZIP
- PRE 的原始压缩包
- HE/MPC 的 CSV

## 6. 四个服务的启动方式

按当前项目实际使用方式，资产交付联调要起这四个服务。

### 6.1 后端

```bash
sudo -i
cd /home/super/fqh
go run allserve.go
```

### 6.2 前端

```bash
cd /home/super/fqh/frontend
npm run serve
```

### 6.3 mpc

```bash
cd /home/super/fqh/mpc_/app/service/mpc
./mpc_server
```

### 6.4 mpcFlask

```bash
cd /home/super/fqh/mpc_
python3 -m flask --app app.app run --host 0.0.0.0 --port 28090
```

### 6.5 补充说明

- `backend` 通过 `allserve.go` 启动
- `frontend` 是 Vue 开发服务
- `mpc` 和 `mpcFlask` 都要起，缺一个都会影响联调
- 页面里的 `API_BASE` 当前是 `http://10.112.47.214:3000`，不要随手改

## 7. 建议的排查顺序

出现问题时，按这个顺序最省时间：

1. 看浏览器按钮当前是否符合状态机预期
2. 查对应 `status` 接口返回值
3. 查前端提交时真正发出的字段
4. 查后端路由是否已经支持当前字段
5. 查 PCC 文档或测试样例是否和本地约定一致
6. 如果是 PRE，再查 helper 是否执行成功

## 8. 给下一个 agent 的建议

- 先把页面当成“状态机”，不是普通表单页
- 不要一开始追求抽象复用，先把协议跑通
- 不要轻易重命名后端字段，PCC 对字段和 ZIP 结构很敏感
- 不要把测试态文案直接暴露给业务页面
- 改完前端文案后顺手跑目标文件 `eslint`
- 改完后端 PRE/FL 逻辑后，优先用新交易重新测，不要复用已经污染的旧交易

如果只允许你花 30 分钟了解这个模块，就按下面读：

1. `DeliveryBuyer2.vue`
2. `DeliverySeller2.vue`
3. `backend/pcp/routes.js`
4. `backend/pcp/fl-routes.js`
5. `/home/super/tr/pcc/docs`

这样是当前从零到一最快的路径。
