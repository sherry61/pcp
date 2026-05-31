<template>
  <div class="market">
    <AppHeader :username="username" :userId="userId" />

    <div class="main-content">
      <AppSidebar />

      <div class="content">
        <h2 class="title">交易市场</h2>

        <div class="toolbar">
          <button class="btn" @click="refresh">刷新交易列表</button>
        </div>

        <!-- ✅ 卖家申请列表：字段按你图里那张 -->
        <div class="apply-list" v-if="awaitingAssets.length">
          <div class="apply-card" v-for="a in awaitingAssets" :key="a.transaction_id + '-' + a.file_hash">
            <div class="row"><span class="k">交易ID:</span><span class="v">{{ a.transaction_id }}</span></div>
            <div class="row"><span class="k">价格:</span><span class="v">{{ a.price }} RMB</span></div>
            <div class="row">
              <span class="k">资产ID:</span>
              <span class="v mono">{{ a.file_hash }}</span>
            </div>
            <div class="row"><span class="k">状态:</span><span class="v">{{ a.status }}</span></div>
            <div class="row">
              <span class="k">卖家地址:</span>
              <span class="v mono">{{ a.seller_address }}</span>
            </div>
            <div class="row">
              <span class="k">买家地址:</span>
              <span class="v mono">{{ a.buyer_address }}</span>
            </div>
            <div class="row"><span class="k">申请数量:</span><span class="v">{{ a.quantity }}</span></div>

            <div class="actions">
              <button
                class="btn primary"
                :disabled="a.status !== '待确认'"
                @click="confirmTransaction(a)"
              >
                确认交易
              </button>
            </div>
          </div>
        </div>

        <div v-else class="empty">暂无待确认的购买申请</div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from "axios";
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";

export default {
  name: "MarketSeller",
  components: { AppHeader, AppSidebar },
  data() {
    return {
      username: "",
      userId: "",
      awaitingAssets: [],
      isLoading: false,
    };
  },
  async mounted() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = this.parseJwt(token);
    this.username = decodeURIComponent(payload.username);

    await this.fetchUserId(this.username);
    await this.fetchPendingAssets();
  },
  methods: {
    async refresh() {
      await this.fetchPendingAssets();
    },

    parseJwt(token) {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    },

    async fetchUserId(username) {
      const response = await axios.post("http://10.112.47.214:3000/api/get-user-id", { username });
      this.userId = response?.data?.id || "";
    },

    // ✅ 直接复用你现有的 fetchPendingAssets 逻辑（我把它原样保留）
    async fetchPendingAssets() {
      try {
        const certLists = [];

        // org1
        try {
          const org1Res = await axios.post("http://10.112.47.214:3000/api/get-certificates", {
            userId: this.userId,
          });
          if (org1Res.status === 200 && Array.isArray(org1Res.data.certificates)) {
            certLists.push(
              ...org1Res.data.certificates.map((cert) => ({
                org: "wx-org1.chainmaker.org",
                cert: cert.cert,
              }))
            );
          }
        } catch (err) {console.error("get certificates error:", err);}

        // org2
        try {
          const org2Res = await axios.post("http://10.112.47.214:3000/api/get-certificates2", {
            userId: this.userId,
          });
          if (org2Res.status === 200 && Array.isArray(org2Res.data.certificates)) {
            certLists.push(
              ...org2Res.data.certificates.map((cert) => ({
                org: "wx-org2.chainmaker.org",
                cert: cert.cert,
              }))
            );
          }
        } catch (err) {console.error("get certificates error:", err);}

        const allPendingTx = [];

        for (const { org, cert } of certLists) {
          try {
            const certPath = `/home/super/r/GoSDK/crypto-config/${org}/user/${cert}/${cert}.sign.crt`;
            const addrRes = await axios.post("http://10.112.47.214:9092/cert-to-addr", {
              cert_path: certPath,
            });
            const certAddr = addrRes?.data?.ethereum?.address;
            if (!certAddr) continue;

            const txRes = await axios.get(
              `http://10.112.47.214:3000/api/seller-pending-transactions/${certAddr}`
            );
            const list = txRes?.data?.pendingTransactions || [];

            const formatted = list.map((tx) => ({
              transaction_id: tx.transaction_id,
              price: tx.price ?? 100, // 后端如果没给价格，你原来写死 1.5，我这里兼容一下
              file_hash: tx.asset_id,
              status: tx.status,
              seller_address: tx.seller_address,
              buyer_address: tx.buyer_address,
              quantity: tx.quantity,
            }));

            allPendingTx.push(...formatted);
          } catch (err) {
            console.error("fetchPendingAssets item error:", err);
          }
        }

        this.awaitingAssets = allPendingTx;
      } catch (e) {
        console.error("fetchPendingAssets error:", e);
        this.awaitingAssets = [];
      }
    },

    async confirmTransaction(asset) {
  try {
    const isAgree = true;

    // --- Step 1: 获取交易和资产的必要信息 ---
    const txDetail = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${asset.transaction_id}`);
    const transactionInfo = txDetail.data.transaction;
    if (!transactionInfo || !transactionInfo.quality) {
      this.$message.error('无法获取交易详情或权限类型');
      return;
    }
    console.log("user_id", transactionInfo.owner_id);
    const qualityStr = transactionInfo.quality;
    let expiration = transactionInfo.expiration_time;
    if (expiration) {
      expiration = new Date(expiration.replace(' ', 'T')).toISOString();
    }
    const assetDetailRes = await axios.get(`http://10.112.47.214:3000/api/asset/${asset.file_hash}`);
    asset.industry = assetDetailRes.data.industry;

    // --- Step 2: 在数据库中确认交易状态 ---
    const response = await axios.post('http://10.112.47.214:3000/api/seller-confirm-transaction', {
      seller_address: asset.seller_address,
      transaction_id: asset.transaction_id,
      isAgree,
    });
    if (response.status !== 200 || response.data.status !== '已确认') {
      this.$message.error('交易确认失败');
      return;
    }
    this.$message.success('交易已在数据库中确认');
    asset.status = '已确认';

    

    try {
  const tx        = transactionInfo;
  const assetInfo = assetDetailRes.data || {};

  const contractId   = `CONTRACT-${asset.transaction_id}`;
  const productName  = assetInfo.asset_name || "未知产品";
  const contractName = `${productName}-数字合约`;
  const tokenId      = asset.file_hash;
  const desc         = assetInfo.description || "自动生成数字合约";

  const operationsArr = (tx.quality || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s === "所有权" ? "所有" : s));

  const operationsStr = operationsArr.join(",");

  const expirationIso = expiration || null;
  const quantityLimit = tx.quantity ?? asset.quantity ?? 1;
  const processingType = tx.processing_type || null;

  const modelFileHash = tx.model_file_hash || null;

  await axios.post("http://10.112.47.214:3000/api/save-digital-contract", {
    transaction_id: asset.transaction_id,
    contract_id: contractId,
    contract_name: contractName,
    product_name: productName,
    token_id: tokenId,
    contract_description: desc,
    seller_address: asset.seller_address,
    buyer_address: asset.buyer_address,
    operations: operationsStr,
    expiration_time: expirationIso,
    quantity_limit: quantityLimit,
    processing_type: processingType,
    model_file_hash: modelFileHash
  });

  this.$message.success("数字合约已生成并保存");

} catch (err) {
  console.error("保存数字合约失败:", err);
  this.$message.error("数字合约保存失败");
}

    // --- Step 3: 处理所有链上交易（所有权和使用权）---
    
    // 【关键修改】引入一个总的成功标志位
    let anyTransactionSucceeded = false; 

    const qualityList = qualityStr.split(',').map(q => q.trim());
    let hasOwnership = qualityList.includes('所有权');

    // 处理使用权 (BuyPermission)
    for (const rightType of qualityList) {
      if (rightType === '所有权') continue; // 所有权单独处理

      const permissionPayload = {
        owner: asset.buyer_address,
        tokenID: asset.file_hash,
        expiration: expiration,
        rightType
      };

      try {
        console.log(`调用 BuyPermission for [${rightType}]:`, permissionPayload);
        const permissionResponse = await axios.post('http://10.112.47.214:8848/pre/BuyPermission', permissionPayload);
        if (permissionResponse.status === 200 && permissionResponse.data.code === 0) {
          this.$message.success(`权限 [${rightType}] 交易成功`);
          anyTransactionSucceeded = true; // 【关键修改】只要有一次成功，就标记
        } else {
          this.$message.warning(`权限 [${rightType}] 交易失败: ${permissionResponse.data.message}`);
        }
      } catch (permError) {
        console.error(`购买权限 [${rightType}] 异常:`, permError);
        this.$message.error(`权限 [${rightType}] 交易时发生网络错误`);
      }
    }

    // 处理所有权 (transferAsset)
    if (hasOwnership) {
      const transferSuccess = await this.transferAsset(asset);
      if (transferSuccess) {
        anyTransactionSucceeded = true; // 【关键修改】转移成功，也标记
      }
    }

    // --- Step 4: 【统一处理】根据交易是否成功，决定是否存入二次交易表 ---
    
    // 【关键修改】最后检查总的成功标志位
   if (anyTransactionSucceeded) {
  console.log('✅ 至少有一项权益交易成功，开始处理二次销售入库...');
  
  try {
    // 4.1. 获取资产的完整信息作为基础模板
    const assetDetailsResponse = await axios.get(`http://10.112.47.214:3000/api/get-asset-details/${asset.file_hash}`);
    
    if (assetDetailsResponse.status === 200) {
      const assetDetails = assetDetailsResponse.data;
      console.log('获取到资产完整信息:', assetDetails);

      // 4.2. 检查原始资产是否允许二次销售
      if (assetDetails.allow_resale === 1) {
        console.log('该资产允许二次交易，准备存入 resalable_assets 表。');

        // 【=============== 核心修改在这里 ===============】
        // 4.3. 准备要存入新表的数据
        
        // 我们从交易信息中获取买家实际购买的权益列表
        const purchasedRights = qualityStr.split(',').map(q => q.trim());
        
        const resalableData = {
          ...assetDetails, // 先复制所有原始信息作为模板

          // --- 关键覆盖操作 ---
          user_id: transactionInfo.buyer_id,        // 覆盖为新所有者(买家)的ID
          current_owner_address: asset.buyer_address, // 覆盖为新所有者(买家)的地址
          
          // 根据买家购买的权益，重置可出售权益字段
          // 无论原始资产的权益是什么，新记录只反映本次购买的权益
          can_sell_asset: purchasedRights.includes('所有权') ? 1 : 0,
          can_sell_view: purchasedRights.includes('查阅权') ? 1 : 0,
          can_sell_process: purchasedRights.includes('加工权') ? 1 : 0,
        };
        
        // 移除旧的ID，让新表自增
        delete resalableData.id;

        console.log('准备存入 resalable_assets 的最终数据:', resalableData);
        
        // 4.4. 调用接口，存入新表
        await axios.post('http://10.112.47.214:3000/api/save-resalable-asset', resalableData);
        
        console.log('成功请求将资产存入 resalable_assets 表。');
        this.$message.info('该资产已成功加入可二次交易列表！');

      } else {
        console.log('ℹ️ 该资产的原始设置不允许二次交易 (allow_resale is not 1)。');
      }
    } else {
      console.error('获取资产详细信息失败:', assetDetailsResponse.data.message);
    }
  } catch (postProcessError) {
    console.error('❌ 交易后处理（二次销售入库）失败:', postProcessError);
    this.$message.error('交易后处理失败，请联系管理员。');
  }

} else {
    //console.log('❌ 所有权益交易均未成功，不执行二次销售入库。');
    //this.$message.error('所有链上交易均未成功，请检查区块链网络或联系管理员。');
}

  } catch (error) {
    console.error('❌ 确认交易顶层流程异常:', error);
    this.$message.error('确认交易时发生未知错误，请查看控制台。');
  }
},

    async transferAsset(asset) {
  try {
    console.log("⚙️ 开始资产转移流程...");
    console.log("卖家地址:", asset.seller_address);
    console.log("买家地址:", asset.buyer_address);
    console.log("资产ID:", asset.file_hash);
    console.log("资产领域:", asset.industry);

    // 收集所有证书和地址映射
    const allCerts = [];

    const orgs = [
      { orgName: 'wx-org1.chainmaker.org', api: 'get-certificates' },
      { orgName: 'wx-org2.chainmaker.org', api: 'get-certificates2' },
    ];

    for (const { orgName, api } of orgs) {
      try {
        const res = await axios.post(`http://10.112.47.214:3000/api/${api}`, {
          userId: this.userId,
        });

        if (res.status === 200 && Array.isArray(res.data.certificates)) {
          for (const { cert } of res.data.certificates) {
            const certPath = `/home/super/r/GoSDK/crypto-config/${orgName}/user/${cert}/${cert}.sign.crt`;
            const addrRes = await axios.post('http://10.112.47.214:9092/cert-to-addr', {
              cert_path: certPath,
            });
            const addr = addrRes?.data?.ethereum?.address;
            if (addr) {
              allCerts.push({ cert, orgName, addr });
            }
          }
        }
      } catch (e) {
        console.error(`获取 ${api} 证书或地址失败:`, e);
      }
    }

    // 根据 asset.buyer_address 找到匹配的 orgName 和 cert
    const certInfo = allCerts.find(item => item.addr === asset.seller_address);
    if (!certInfo) {
      throw new Error(`未找到与地址 ${asset.seller_address} 匹配的证书`);
    }

    console.log("🔍 找到对应证书与组织:", certInfo);

    // Step 1: DynamicCertConfig
    const configResponse = await axios.post('http://10.112.47.214:8848/pre/DynamicCertConfig', {
      clientName: certInfo.cert,
      orgName: certInfo.orgName
    });

    if (configResponse.status !== 200) {
      throw new Error('❌ DynamicCertConfig 配置失败');
    }

    // Step 2: 资产转移（判断资产是否分割）
    const indivisibleIndustries = ['WH'];
    let transferResponse;

    if (indivisibleIndustries.includes(asset.industry)) {
      console.log("🛡️ 资产类型：不可分割，调用 TransferFrom");
      transferResponse = await axios.post('http://10.112.47.214:8848/pre/TransferFrom', {
        from: asset.seller_address,
        to: asset.buyer_address,
        tokenId: asset.file_hash,
      });
    } else {
      console.log("🛡️ 资产类型：可分割，调用 En-Transfer");
      transferResponse = await axios.post('http://10.112.47.214:8848/pre/En-Transfer', {
        to: asset.buyer_address,
        amount: asset.quantity.toString(),
      });
    }

    if (transferResponse.status === 200 && transferResponse.data.code === 0) {
      this.$message.success('资产转移成功');
      console.log('✅ 资产链上转移成功');

      await axios.post('http://10.112.47.214:3000/api/update-owner', {
        assetId: asset.file_hash,
        newOwner: asset.buyer_address
      });
    } else {
      throw new Error('❌ 链上转移失败，返回值异常');
    }
  } catch (error) {
    console.error('❌ 资产转移流程异常:', error);
    alert('资产转移失败，请稍后重试。');
  }
}
  },
};
</script>

<style scoped>
.market {
  width: 100%;
  min-height: 100vh;
  background: #f0f2f5;
  display: flex;
  flex-direction: column;
}
.main-content {
  display: flex;
  flex: 1;
  background: #f5f6fa;
  overflow-y: auto;
}
.content {
  flex: 1;
  padding: 20px;
  background: #f5f6fa;
}
.title {
  margin: 0;
  padding: 10px 0;
  padding-left: 30px;
  font-size: 24px;
  color: #333;
}

.toolbar {
  display: flex;
  justify-content: flex-start;
  padding-left: 30px;
  margin: 12px 0 18px;
}
.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: #e7e8eb;
  color: #111;
}
.btn.primary {
  background: #007bff;
  color: #fff;
}
.btn:disabled {
  background: #c6c6c6;
  cursor: not-allowed;
}

.apply-list {
  padding: 0 30px 30px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 18px;
}

.apply-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px 16px 12px;
  border: 1px solid #e5e5e5;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}

.row {
  display: flex;
  gap: 10px;
  margin: 8px 0;
}
.k {
  width: 80px;
  font-weight: 700;
  color: #222;
}
.v {
  flex: 1;
  color: #333;
  word-break: break-word;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}
.empty {
  padding: 30px;
  color: #666;
}
</style>
