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
              <span class="k">购买权限:</span>
              <span class="v rights-text">{{ a.quality || "未填写" }}</span>
            </div>
            <div class="row">
              <span class="k">卖家地址:</span>
              <span class="v mono">{{ a.seller_address }}</span>
            </div>
            <div class="row">
              <span class="k">买家地址:</span>
              <span class="v mono">{{ a.buyer_address }}</span>
            </div>
            <div class="row"><span class="k">申请数量:</span><span class="v">{{ a.quantity }}</span></div>
            <div class="row pc-row">
              <span class="k">资产交付方法:</span>
              <span class="v">{{ a.pc_type_label || "未选择" }}</span>
            </div>

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

    normalizePcType(value) {
      return String(value || "").trim().toUpperCase();
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
                address: cert.address || "",
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
                address: cert.address || "",
              }))
            );
          }
        } catch (err) {console.error("get certificates error:", err);}

        const allPendingTx = [];

        for (const { cert, address } of certLists) {
          try {
            const certAddr = address;
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
              quality: tx.quality,
              seller_address: tx.seller_address,
              buyer_address: tx.buyer_address,
              quantity: tx.quantity,
              pc_type: tx.pc_type || "",
              pc_type_label: ({
                HE: "同态加密",
                PRE: "代理重加密",
                FL: "联邦学习",
                MPC: "多方安全计算",
                TEE: "可信执行环境"
              })[this.normalizePcType(tx.pc_type)] || "未选择",
            }));

            allPendingTx.push(...formatted);
          } catch (err) {
            console.warn("跳过无效或过期证书，不影响其他证书:", {
              cert,
              error: err.response?.data || err.message
            });

            continue;
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
    const pcType = this.normalizePcType(asset.pc_type);

    if (!pcType) {
      this.$message.error('买家尚未选择资产交付方法');
      return;
    }

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
    .map(s => (s === "持有权" ? "持有" : s));

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
    model_file_hash: modelFileHash,
    pc_type: pcType
  });

  this.$message.success("数字合约已生成并保存");

} catch (err) {
  console.error("保存数字合约失败:", err);
  this.$message.error("数字合约保存失败");
}

    // --- Step 3: 处理所有链上交易（所有权和使用权）---

    const qualityList = qualityStr.split(',').map(q => q.trim());
    let hasOwnership = qualityList.includes('持有权');

    // 处理使用权 (BuyPermission)
    for (const rightType of qualityList) {
      if (rightType === '持有权') continue; // 所有权单独处理

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
        } else {
          this.$message.warning(`权限 [${rightType}] 交易失败: ${permissionResponse.data.message}`);
        }
      } catch (permError) {
        console.error(`购买权限 [${rightType}] 异常:`, permError);
        const backendMessage =
          permError?.response?.data?.message ||
          permError?.response?.data?.error ||
          permError?.message ||
          '未知错误';
        this.$message.error(`权限 [${rightType}] 交易失败: ${backendMessage}`);
      }
    }

    // 处理所有权 (transferAsset)
    if (hasOwnership) {
      await this.transferAsset(asset);
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
          for (const { cert, address } of res.data.certificates) {
            if (address) {
              allCerts.push({
                cert,
                orgName,
                addr: address
              });
              console.log('证书有效:', {
                cert,
                orgName,
                addr: address
              });
            } else {
              console.warn('证书未解析出地址，跳过:', {
                cert,
                orgName
              });
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
      return true;
    } else {
      throw new Error('❌ 链上转移失败，返回值异常');
    }
  } catch (error) {
    console.error('❌ 资产转移流程异常:', error);
    alert('资产转移失败，请稍后重试。');
    return false;
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
.pc-row {
  align-items: center;
}
.pc-select {
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #111;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  border: 1px solid #e7ecf3;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 10px;
}
.k {
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
}
.v {
  color: #101828;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
}
.rights-text {
  color: #175cd3;
  font-weight: 600;
}
.actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
}
.empty {
  padding: 30px;
  color: #666;
}
</style>
