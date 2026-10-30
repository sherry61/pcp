<template>
  <div class="personal-center">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <div class="page" v-loading="loading || profileLoading">
          <h2 class="title">个人中心</h2>

          <div class="top-grid">
            <section class="info-panel">
              <h3 class="section-title">基本信息</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">用户名</span>
                  <span class="info-value">{{ profile?.username || username || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">用户 ID</span>
                  <span class="info-value mono">{{ profile?.id || userId || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">邮箱</span>
                  <span class="info-value">{{ profile?.email || '未填写' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">手机</span>
                  <span class="info-value">{{ profile?.phone_number || '未填写' }}</span>
                </div>
                <div class="info-item span-2">
                  <span class="info-label">地址</span>
                  <span class="info-value">{{ profile?.address || '未填写' }}</span>
                </div>
                <div class="info-item span-2">
                  <span class="info-label">注册时间</span>
                  <span class="info-value">{{ formatProfileDate(profile?.created_at) }}</span>
                </div>
              </div>
            </section>

            <aside class="balance-card">
              <div class="balance-head">
                <div class="balance-label">账户余额</div>
                <el-button size="small" plain @click="openRecharge">充值</el-button>
              </div>
              <div class="balance-value">
                ¥ {{ balanceText }}
                <span class="currency">CNY</span>
              </div>
            </aside>
          </div>

          <section class="cert-section">
            <div class="section-head">
              <h3 class="section-title">我的证书</h3>
              <el-button
                v-if="activeCertificate"
                size="small"
                plain
                @click="openCertDialog('renew')"
              >续期证书</el-button>
              <el-button
                v-else
                type="primary"
                plain
                size="small"
                @click="openCertDialog('apply')"
              >申请证书</el-button>
            </div>
            <div v-if="activeCertificate" class="cert-surface">
              <div class="cert-main">
                <div>
                  <div class="cert-name">{{ activeCertificate.cert }}</div>
                  <div class="cert-org">{{ activeCertificate.organization }}</div>
                </div>
                <span class="cert-badge" :class="{ expired: certificateExpired }">
                  {{ certificateExpired ? '已过期' : '有效' }}
                </span>
              </div>
              <div class="cert-grid">
                <div class="cert-item span-2">
                  <span>证书地址</span>
                  <strong class="mono">{{ activeCertificate.address }}</strong>
                </div>
                <div class="cert-item">
                  <span>创建时间</span>
                  <strong>{{ activeCertificate.createdAt }}</strong>
                </div>
                <div class="cert-item">
                  <span>过期时间</span>
                  <strong>{{ activeCertificate.expirationAt }}</strong>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无证书" />
          </section>
        </div>

        <el-dialog
          :title="certDialogMode === 'renew' ? '续期证书' : '申请证书'"
          v-model="isDialogVisible"
          width="500px"
        >
          <template v-if="certDialogMode === 'renew'">
            <el-descriptions :column="1">
              <el-descriptions-item label="证书名称">{{ activeCertificate?.cert }}</el-descriptions-item>
              <el-descriptions-item label="所属组织">{{ activeCertificate?.organization }}</el-descriptions-item>
              <el-descriptions-item label="当前有效期">{{ activeCertificate?.expirationAt }}</el-descriptions-item>
            </el-descriptions>
            <el-alert
              title="证书名称和链上地址保持不变，续期后有效期延长。"
              type="info"
              show-icon
              :closable="false"
              style="margin-top:12px;"
            />
          </template>
          <el-form v-else :model="form">
            <el-form-item label="证书名称" :rules="{ required: true, message: '请输入证书名称', trigger: 'blur' }">
              <el-input v-model="form.certificateName" placeholder="输入不超过10位的字母和数字组合" />
            </el-form-item>
            <el-form-item label="选择组织" :rules="{ required: true, message: '请选择组织', trigger: 'change' }">
              <el-select v-model="form.organization" placeholder="请选择组织">
                <el-option label="wx-org1.chainmaker.org" value="wx-org1.chainmaker.org"></el-option>
                <el-option label="wx-org2.chainmaker.org" value="wx-org2.chainmaker.org"></el-option>
              </el-select>
            </el-form-item>
            <el-alert title="证书有效期暂定为6个月，到期后可续期。" type="info" show-icon />
          </el-form>
          <el-alert
            v-if="formError"
            :title="formError"
            type="error"
            show-icon
            :closable="false"
            style="margin-top:12px;"
          />
          <template #footer>
            <div class="dialog-footer">
              <el-button @click="isDialogVisible = false">取消</el-button>
              <el-button
                type="primary"
                @click="certDialogMode === 'renew' ? renewCertificate() : submitApplication()"
              >
                {{ certDialogMode === 'renew' ? '确认续期' : '确认申请' }}
              </el-button>
            </div>
          </template>
        </el-dialog>

        <el-dialog
          v-model="rechargeVisible"
          title="余额充值"
          width="420px"
          @closed="stopRechargePolling"
        >
          <template v-if="!rechargeQr">
            <el-form label-width="72px">
              <el-form-item label="充值金额">
                <el-input v-model="rechargeAmount" placeholder="请输入充值金额">
                  <template #append>元</template>
                </el-input>
              </el-form-item>
            </el-form>
          </template>

          <template v-else>
            <div class="recharge-qr">
              <img :src="rechargeQr" alt="充值二维码" />
              <div v-if="rechargeStatus === 'PAID'" class="recharge-paid">✓ 已到账</div>
            </div>
            <div class="recharge-amount-line">
              应付金额 <strong>¥ {{ rechargeAmount }}</strong>
            </div>
            <div class="recharge-tip">请使用支付宝扫码支付，到账后余额自动更新。</div>
          </template>

          <el-alert
            v-if="rechargeError"
            :title="rechargeError"
            type="error"
            show-icon
            :closable="false"
            style="margin-top:12px;"
          />

          <template #footer>
            <div class="dialog-footer">
              <el-button @click="rechargeVisible = false">取消</el-button>
              <el-button
                v-if="!rechargeQr"
                type="primary"
                :loading="rechargeLoading"
                @click="createRecharge"
              >支付</el-button>
            </div>
          </template>
        </el-dialog>

        <el-alert v-if="message" :title="message" type="info" show-icon class="page-message" />
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";
import axios from "axios";
import QRCode from "qrcode";

export default {
  name: "UserProfile",
  components: {
    AppHeader,
    AppSidebar,
  },
  setup() {
    const username = ref("");
    const userId = ref("");
    const certificates = ref([]);
    const tableData = ref([]);

    const loading = ref(false); // 加载状态
    const isDialogVisible = ref(false);
    const certDialogMode = ref('apply');
    const isCertContentDialogVisible = ref(false);
    const searchQuery = ref(""); // 搜索关键词
    const message = ref(""); // 提示信息
    const formError = ref("");
    const defaultRegisterCert = ref('');
    const defaultTradeCert = ref('');
    const savingDefaultCert = ref(false);

    const defaultCertOptions = ref([]);
    const profile = ref(null);
    const stats = ref({});
    const profileLoading = ref(false);

    const balance = ref('0.00');
    const balanceText = computed(() => {
      const value = Number(balance.value);
      return Number.isFinite(value) ? value.toFixed(2) : '0.00';
    });
    const rechargeVisible = ref(false);
    const rechargeAmount = ref('');
    const rechargeLoading = ref(false);
    const rechargeError = ref('');
    const rechargeQr = ref('');
    const rechargeOrderNo = ref('');
    const rechargeStatus = ref('PENDING');
    const rechargeTimer = ref(null);

    const fetchBalance = async () => {
      if (!userId.value) return;
      try {
        const res = await axios.get('http://10.112.191.163:3000/api/balance', {
          params: { userId: userId.value }
        });
        if (res.data?.success) {
          balance.value = Number(res.data.balance || 0).toFixed(2);
        }
      } catch (error) {
        console.error('获取余额失败:', error);
      }
    };

    const stopRechargePolling = () => {
      if (rechargeTimer.value) {
        clearInterval(rechargeTimer.value);
        rechargeTimer.value = null;
      }
    };

    const openRecharge = () => {
      stopRechargePolling();
      rechargeVisible.value = true;
      rechargeAmount.value = '';
      rechargeError.value = '';
      rechargeQr.value = '';
      rechargeOrderNo.value = '';
      rechargeStatus.value = 'PENDING';
    };

    const startRechargePolling = () => {
      stopRechargePolling();
      rechargeTimer.value = setInterval(async () => {
        if (!rechargeOrderNo.value) return;
        try {
          const res = await axios.get(
            `http://10.112.191.163:3000/api/balance/recharge-status/${rechargeOrderNo.value}`
          );
          if (res.data?.status === 'PAID') {
            rechargeStatus.value = 'PAID';
            stopRechargePolling();
            await fetchBalance();
            message.value = '充值成功';
            setTimeout(() => {
              rechargeVisible.value = false;
            }, 700);
          }
        } catch (error) {
          console.error('查询充值状态失败:', error);
        }
      }, 3000);
    };

    const createRecharge = async () => {
      const amount = Number(rechargeAmount.value);
      if (!Number.isFinite(amount) || amount < 0.01 || amount >= 100000000) {
        rechargeError.value = '充值金额需在 0.01 ~ 99999999.99 元之间';
        return;
      }

      rechargeError.value = '';
      rechargeLoading.value = true;
      try {
        const res = await axios.post('http://10.112.191.163:3000/api/balance/recharge', {
          userId: parseInt(userId.value),
          amount
        });
        if (res.status !== 201 || !res.data?.qr_code) {
          rechargeError.value = res.data?.message || '创建充值订单失败';
          return;
        }
        rechargeOrderNo.value = res.data.out_trade_no;
        rechargeAmount.value = Number(res.data.amount || amount).toFixed(2);
        rechargeQr.value = await QRCode.toDataURL(res.data.qr_code, { width: 220, margin: 1 });
        rechargeStatus.value = 'PENDING';
        startRechargePolling();
      } catch (error) {
        console.error('创建充值订单失败:', error);
        rechargeError.value = error.response?.data?.message || '创建充值订单失败，请稍后重试';
      } finally {
        rechargeLoading.value = false;
      }
    };

    const formatProfileDate = (value) => {
      if (!value) return '未知';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('zh-CN', { hour12: false });
    };

    const fetchUserProfile = async () => {
      if (!userId.value) return;
      profileLoading.value = true;
      try {
        const res = await axios.get('http://10.112.191.163:3000/api/user-profile', {
          params: { userId: userId.value }
        });
        if (res.data?.success) {
          profile.value = res.data.profile || null;
          stats.value = res.data.stats || {};
        }
      } catch (error) {
        console.error('获取个人资料失败:', error);
      } finally {
        profileLoading.value = false;
      }
    };

    const activeCertificate = computed(() => {
      const preferred = profile.value?.default_register_cert || profile.value?.default_trade_cert;
      const list = certificates.value || [];
      return list.find((item) => item.cert === preferred) || list[0] || null;
    });

    const certificateExpired = computed(() => {
      const raw = activeCertificate.value?.expiresAtRaw;
      if (!raw) return false;
      const time = new Date(raw).getTime();
      return Number.isFinite(time) && time <= Date.now();
    });

    const openCertDialog = (mode) => {
      certDialogMode.value = mode === 'renew' ? 'renew' : 'apply';
      form.value = { certificateName: '', organization: '' };
      formError.value = '';
      isDialogVisible.value = true;
    };

    const form = ref({
      certificateName: "",
      organization: "",
    });

    const certContent = ref("");

    const fetchDefaultCertOptions = async () => {
  if (!userId.value) return;

  try {
    const res = await axios.get(
      'http://10.112.191.163:3000/api/user-certificates',
      {
        params: {
          userId: userId.value
        }
      }
    );

    if (res.data?.success) {
      defaultCertOptions.value = res.data.certificates || [];
    }
  } catch (error) {
    console.error('获取默认证书候选列表失败:', error);
    defaultCertOptions.value = [];
  }
};

    const fetchDefaultCert = async () => {
      if (!userId.value) return;

      try {
        const res = await axios.get(
          'http://10.112.191.163:3000/api/default-cert',
          {
            params: {
              userId: userId.value
            }
          }
        );

        if (res.data?.success) {
          defaultRegisterCert.value = res.data.default_register_cert || '';
          defaultTradeCert.value = res.data.default_trade_cert || '';
        }
      } catch (error) {
        console.error('获取默认证书失败:', error);
      }
    };

    const saveDefaultCert = async () => {
      if (!userId.value) {
        message.value = '用户ID缺失，无法保存默认证书';
        return;
      }

      if (!defaultRegisterCert.value) {
        message.value = '请选择上链默认证书';
        return;
      }

      if (!defaultTradeCert.value) {
        message.value = '请选择交易默认证书';
        return;
      }

      try {
        savingDefaultCert.value = true;

        const res = await axios.post(
          'http://10.112.191.163:3000/api/save-default-cert',
          {
            userId: userId.value,
            defaultRegisterCert: defaultRegisterCert.value,
            defaultTradeCert: defaultTradeCert.value
          }
        );

        if (res.data?.success) {
          message.value = '默认证书保存成功';
        } else {
          message.value = res.data?.message || '默认证书保存失败';
        }
      } catch (error) {
        console.error('保存默认证书失败:', error);
        message.value = '保存默认证书失败，请检查后端服务';
      } finally {
        savingDefaultCert.value = false;
      }
    };

    const submitApplication = async () => {
      formError.value = "";

      if (!form.value.certificateName) {
        formError.value = "证书名称不能为空";
        return;
      }

      if (!form.value.organization) {
        formError.value = "请选择组织";
        return;
      }

      // 验证证书名称格式（1-10个字母或数字）
      const certNamePattern = /^[a-zA-Z0-9]{1,10}$/;
      if (!certNamePattern.test(form.value.certificateName)) {
        formError.value = "证书名称格式不正确，必须是1-10个字母或数字";
        return;
      }

      const normalizedCertificateName = form.value.certificateName.trim().toLowerCase();
      const hasDuplicateCertificate = certificates.value.some(
        (item) => item.cert.trim().toLowerCase() === normalizedCertificateName
      );

      if (hasDuplicateCertificate) {
        formError.value = "证书名称已存在，请更换后重试";
        return;
      }

      try {
        loading.value = true;

        // 生成前先检查名称是否已被占用，避免覆盖别人的证书文件。
        const nameCheck = await axios.get('http://10.112.191.163:3000/api/certificate-name-available', {
          params: { certificateName: form.value.certificateName }
        });
        if (nameCheck.data?.success && nameCheck.data.available === false) {
          formError.value = '证书名称已被使用，请更换';
          return;
        }

        // 第一步：调用 /generate 接口生成证书
        const generateResponse = await axios.post('/generate', {
          client_number: form.value.certificateName,
          org: form.value.organization.split(".")[0]
        });

        if (generateResponse.status !== 200 || generateResponse.data.status !== "success") {
          formError.value =
            generateResponse.data?.msg ||
            generateResponse.data?.message ||
            "证书生成失败";
          return;
        }

        // 第二步：登记证书并设为当前账户证书
        const addCertResponse = await axios.post('http://10.112.191.163:3000/api/add-certificate', {
          userId: parseInt(userId.value),
          certificateName: form.value.certificateName,
          org: form.value.organization.split(".")[0]
        });

        if (addCertResponse.status !== 200) {
          formError.value = addCertResponse.data?.message || "证书添加失败";
          return;
        }

        message.value = "证书申请成功";
        formError.value = "";
        isDialogVisible.value = false;
        form.value = { certificateName: "", organization: "" };
        await fetchUserCertificate(userId.value);
        await fetchUserProfile();
      } catch (error) {
        console.error("申请/更换证书时发生错误:", error);
        const serverMessage = error.response?.data?.message || error.response?.data?.error;
        formError.value = serverMessage || "证书操作失败，请稍后重试";
        message.value = formError.value;
      } finally {
        loading.value = false;
      }
    };

    const renewCertificate = async () => {
      if (!activeCertificate.value) return;
      formError.value = '';
      loading.value = true;

      try {
        const org = String(activeCertificate.value.organization || '').split('.')[0];
        const response = await axios.post('http://10.112.191.163:3000/api/renew-certificate', {
          userId: parseInt(userId.value),
          certificateName: activeCertificate.value.cert,
          org
        });

        if (!response.data?.success) {
          formError.value = response.data?.message || '证书续期失败';
          return;
        }

        message.value = response.data.message || '证书续期成功';
        isDialogVisible.value = false;
        await fetchUserCertificate(userId.value);
        await fetchUserProfile();
      } catch (error) {
        console.error('证书续期失败:', error);
        formError.value = error.response?.data?.message || '证书续期失败，请稍后重试';
      } finally {
        loading.value = false;
      }
    };

    // 解析 JWT Token
    const parseJwt = (token) => {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(jsonPayload);
    };

    // 获取用户ID
    const fetchUserId = async (username) => {
      try {
        const response = await axios.post(
          "http://10.112.191.163:3000/api/get-user-id",
          { username }
        );
        if (response.status === 200 && response.data.id) {
          userId.value = response.data.id;
        } else {
          console.error("获取用户ID失败:", response.data);
          message.value = "获取用户ID失败，请稍后重试。";
        }
      } catch (error) {
        console.error("请求用户ID时发生错误:", error);
        message.value = "获取用户ID失败，服务器不可用。";
      }
    };

    const formatTimestamp = (timestamp) => {
      if (!timestamp) {
        return "未知";
      }

      if (typeof timestamp === "string") {
        const normalized = timestamp.replace(" ", "T");
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) {
          return "未知";
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }

      const value = Number(timestamp);
      if (!Number.isFinite(value)) {
        return "未知";
      }

      const date = new Date(value > 1e12 ? value : value * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    // 获取用户证书数据
   // 获取用户证书数据
const fetchUserCertificate = async (userId) => {
  try {
    loading.value = true;
    const [response1, response2] = await Promise.allSettled([
      // 获取 org-chainmaker1 的证书
      axios.post("http://10.112.191.163:3000/api/get-certificates", { userId: parseInt(userId) }),
      
      // 获取 org-chainmaker2 的证书
      axios.post("http://10.112.191.163:3000/api/get-certificates2", { userId: parseInt(userId) })
    ]);
    
    // 合并两个组织的证书数据
    const certificates1 = response1.status === "fulfilled"
      ? (response1.value.data.certificates || [])
      : [];
    const certificates2 = response2.status === "fulfilled"
      ? (response2.value.data.certificates || [])
      : [];

    // 合并结果
    const allCertificates = [...certificates1, ...certificates2]
      .filter((item) => item?.cert);

    if (allCertificates.length > 0) {
      certificates.value = allCertificates.map((item) => {
        const cert = item.cert || "未知证书";
        let organization = item.organization || "未知组织";
        let address = item.address || "-";
        let createdAt = "未知";
        let expirationAt = "未知";

        if (item.data?.org_id) {
          organization = item.data.org_id;
        }

        if (item.registry_created_at) {
          createdAt = formatTimestamp(item.registry_created_at);
        }

        if (item.expires_at) {
          expirationAt = formatTimestamp(item.expires_at);
        }

        if (item.data?.issue_date) {
          createdAt = formatTimestamp(item.data.issue_date);
        }

        if (item.data?.expiration_date) {
          expirationAt = formatTimestamp(item.data.expiration_date);
        }

        return {
          cert,
          organization,
          address,
          createdAt,
          expirationAt,
          expiresAtRaw: item.expires_at || null,
        };
      });

      tableData.value = certificates.value;
    } else {
      certificates.value = [];
      tableData.value = [];
      message.value = "没有找到证书信息。";
    }
  } catch (error) {
    console.error("请求用户证书时发生错误:", error);
    message.value = "加载证书数据失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
};

    // 搜索证书功能
    const searchCertificates = () => {
      if (searchQuery.value) {
        const keyword = searchQuery.value.trim().toLowerCase();
        tableData.value = certificates.value.filter((item) =>
          item.cert.toLowerCase().includes(keyword)
        );
      } else {
        tableData.value = certificates.value;
        fetchUserCertificate(userId.value);
      }
    };

    // 查看证书内容
    const viewCertificate = async (certName, certUsage) => {
      try {
        loading.value = true;
        const response = await axios.post(
          "/api/ca/querycerts",
          {
            orgId: "wx-org1.chainmaker.org",
            userId: certName,
            userType: "client",
            certUsage: certUsage,
            country: "CN",
            locality: "BeiJing",
            province: "BeiJing",
          }
        );
        console.log(certName, certUsage, response)
        if (response.status === 200 && response.data.code === 200 && response.data.data.length > 0) {
          certContent.value = response.data.data[0].certContent;
          isCertContentDialogVisible.value = true;
        } else {
          console.error("获取证书详细信息失败:", response.data.msg);
          message.value = "获取证书详细信息失败，请稍后重试。";
        }
      } catch (error) {
        console.error("请求证书详细信息时发生错误:", error);
        message.value = "获取证书详细信息失败，服务器不可用。";
      } finally {
        loading.value = false;
      }
    };

    // 挂载后操作
  /*onMounted(() => {
  const token = localStorage.getItem("token");
  if (token) {
    const payload = parseJwt(token);
    username.value = decodeURIComponent(payload.username);
    fetchUserId(username.value).then(() => {
      if (userId.value) {
        fetchUserCertificate(userId.value); // 获取用户所有证书
      }
    });
  }
});*/
onMounted(async () => {
  const token = localStorage.getItem("token");

  if (token) {
    const payload = parseJwt(token);
    username.value = decodeURIComponent(payload.username);

    await fetchUserId(username.value);

    if (userId.value) {
      await fetchUserCertificate(userId.value);
      await fetchUserProfile();
      await fetchBalance();
    }
  }
});

onBeforeUnmount(() => {
  stopRechargePolling();
});


    return {
      username,
      userId,
      tableData,
      loading,
      searchQuery,
      message,
      form,
      formError,
      isDialogVisible,
      certDialogMode,
      certificateExpired,
      openCertDialog,
      renewCertificate,
      isCertContentDialogVisible,
      certContent,
      searchCertificates,
      submitApplication,
      viewCertificate,
      defaultRegisterCert,
      defaultTradeCert,
      savingDefaultCert,
      fetchDefaultCert,
      saveDefaultCert,
      certificates,
      defaultCertOptions,
      fetchDefaultCertOptions,
      profile,
      stats,
      profileLoading,
      formatProfileDate,
      activeCertificate,
      balance,
      balanceText,
      rechargeVisible,
      rechargeAmount,
      rechargeLoading,
      rechargeError,
      rechargeQr,
      rechargeStatus,
      openRecharge,
      createRecharge,
      stopRechargePolling,
    };
  },
};
</script>
<style scoped>
.personal-center {
  width: 100%;
  height: 100%;
  max-width: 100vw;
  background: #f5f6fa;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  font-family: "IBM Plex Sans", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
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
  background: #fff;
}

.page {
  width: 100%;
  min-height: calc(100vh - 80px);
  padding: 20px 30px 28px;
  background: #fff;
  box-sizing: border-box;
}

.title {
  margin: 0 0 20px;
  padding-top: 10px;
  font-size: 24px;
  font-weight: 600;
  color: #333;
  letter-spacing: -0.01em;
}

.top-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.4fr) minmax(280px, 0.8fr);
  gap: 28px;
  margin-bottom: 24px;
}

.info-panel {
  min-width: 0;
}

.section-title {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 28px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.info-item.span-2 {
  grid-column: 1 / -1;
}

.info-label {
  color: #6b7280;
  font-size: 12px;
}

.info-value {
  color: #111827;
  font-size: 14px;
  font-weight: 500;
  word-break: break-all;
}

.balance-card {
  background: #f7f7f7;
  border-radius: 12px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 150px;
}

.balance-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.balance-label {
  color: #8a8f98;
  font-size: 13px;
}

.balance-value {
  color: #111;
  font-size: 32px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.currency {
  color: #9ca3af;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0;
}

.recharge-qr {
  position: relative;
  width: 220px;
  height: 220px;
  margin: 0 auto;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  padding: 10px;
  box-sizing: content-box;
}

.recharge-qr img {
  width: 100%;
  height: 100%;
  display: block;
}

.recharge-paid {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  color: #047857;
  font-size: 18px;
  font-weight: 600;
  border-radius: 10px;
}

.recharge-amount-line {
  margin-top: 14px;
  text-align: center;
  color: #4b5563;
  font-size: 14px;
}

.recharge-amount-line strong {
  color: #111827;
  font-size: 18px;
}

.recharge-tip {
  margin-top: 6px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

.cert-section {
  border-top: 1px solid #eef2f7;
  padding-top: 22px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-head .section-title {
  margin: 0;
}

.cert-surface {
  background: #f7f7f7;
  border-radius: 12px;
  padding: 20px 22px;
}

.cert-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.cert-name {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.cert-org {
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.cert-badge {
  color: #047857;
  background: #ecfdf5;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
}

.cert-badge.expired {
  color: #b91c1c;
  background: #fef2f2;
}

.cert-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 28px;
}

.cert-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.cert-item.span-2 {
  grid-column: 1 / -1;
}

.cert-item span {
  color: #6b7280;
  font-size: 12px;
}

.cert-item strong {
  color: #111827;
  font-size: 13px;
  font-weight: 500;
  word-break: break-all;
}

.mono {
  font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.page-message {
  margin-top: 12px;
}

@media (max-width: 900px) {
  .top-grid {
    grid-template-columns: 1fr;
  }

  .page {
    padding: 16px 20px 22px;
  }

  .info-grid,
  .cert-grid {
    grid-template-columns: 1fr;
  }

  .info-item.span-2,
  .cert-item.span-2 {
    grid-column: auto;
  }
}
</style>
