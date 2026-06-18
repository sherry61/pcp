<template>
  <div class="personal-center">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">证书管理</h2>

        <!-- 用户信息展示 -->
        <el-card class="personal-info-container">
          <div class="info-container">
            <!-- 输入框 -->
            <input v-model="searchQuery" type="text" placeholder="请输入证书名称" class="input-box" />

            <!-- 按钮组 -->
            <div class="btn-group-container">
              <div class="btn-group">
                <el-button type="primary" @click="isDialogVisible = true">申请</el-button>
              </div>

              <div class="btn-group">
                <el-button type="primary" @click="searchCertificates">搜索</el-button>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 申请证书对话框 -->
        <el-dialog title="申请证书" v-model="isDialogVisible" width="500px">
          <el-form :model="form">
            <el-form-item label="证书名称" :rules="{ required: true, message: '请输入证书名称', trigger: 'blur' }">
              <el-input v-model="form.certificateName" placeholder="输入不超过10位的字母和数字组合" />
            </el-form-item>
            <el-form-item label="选择组织" :rules="{ required: true, message: '请选择组织', trigger: 'change' }">
              <el-select v-model="form.organization" placeholder="请选择组织">
                <el-option label="wx-org1.chainmaker.org" value="wx-org1.chainmaker.org"></el-option>
                <el-option label="wx-org2.chainmaker.org" value="wx-org2.chainmaker.org"></el-option>
              </el-select>
            </el-form-item>
            <el-alert v-if="formError" :title="formError" type="error" show-icon :closable="false" />
            <el-alert title="证书有效期暂定为6个月，到期后可联系官方续期。" type="info" show-icon />
          </el-form>
          <template #footer>
            <div class="dialog-footer">
              <el-button @click="isDialogVisible = false">取消</el-button>
              <el-button type="primary" @click="submitApplication">确认</el-button>
            </div>
          </template>
        </el-dialog>

        <!-- 证书内容弹窗 -->
        <el-dialog title="证书内容" v-model="isCertContentDialogVisible" width="600px">
          <pre>{{ certContent }}</pre>
          <template #footer>
            <div class="dialog-footer">
              <el-button @click="isCertContentDialogVisible = false">关闭</el-button>
            </div>
          </template>
        </el-dialog>

        <!-- 表格展示 -->
        <el-card>
          <div class="table">
            <!-- 主表格 -->
            <el-table :data="tableData" border style="width: 100%" v-loading="loading" empty-text="暂无数据">
              <el-table-column prop="cert" label="证书名称" />
              <el-table-column prop="organization" label="所属组织" />
              <el-table-column prop="createdAt" label="创建时间" />
              <el-table-column prop="expirationAt" label="过期时间" />
            </el-table>
          </div>
        </el-card>

        <!-- 提示信息 -->
        <el-alert v-if="message" :title="message" type="info" show-icon></el-alert>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";
import axios from "axios";

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
    const isCertContentDialogVisible = ref(false);
    const searchQuery = ref(""); // 搜索关键词
    const message = ref(""); // 提示信息
    const formError = ref("");

    const form = ref({
      certificateName: "",
      organization: "",
    });

    const certContent = ref("");

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

      console.log(form.value.certificateName);

      try {
        loading.value = true;

        // 第一步：调用 /generate 接口生成证书
        const generateResponse = await axios.post('/generate', {
          client_number: form.value.certificateName, 
          org: form.value.organization.split(".")[0] 
        });

        console.log(generateResponse)

        if (generateResponse.status === 200 && generateResponse.data.status === "success") {
          // 第二步：调用 /api/add-certificate 接口添加证书
          const addCertResponse = await axios.post('http://10.112.47.214:3000/api/add-certificate', {
            userId: parseInt(userId.value),
            certificateName: form.value.certificateName,
            org: form.value.organization.split(".")[0] 
          });

          console.log("添加证书响应:", addCertResponse);  // 打印响应数据
          if (addCertResponse.status === 200) {
            message.value = "证书申请成功";
            formError.value = "";
            isDialogVisible.value = false;
            form.value.certificateName = "";
            form.value.organization = "";
            fetchUserCertificate(userId.value);

          } else {
            console.error("申请证书失败:", addCertResponse.data);
            message.value = addCertResponse.data.msg || "证书申请失败";
          }
        } else {
          console.error("证书生成失败:", generateResponse.data.msg);
          message.value = generateResponse.data.msg || "证书生成失败";
 
        }

      } catch (error) {
        console.error("申请证书时发生错误:", error);
        message.value = "申请证书失败，服务器不可用。";

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
          "http://10.112.47.214:3000/api/get-user-id",
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
      axios.post("http://10.112.47.214:3000/api/get-certificates", { userId: parseInt(userId) }),
      
      // 获取 org-chainmaker2 的证书
      axios.post("http://10.112.47.214:3000/api/get-certificates2", { userId: parseInt(userId) })
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
          createdAt,
          expirationAt,
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
  onMounted(() => {
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
      isCertContentDialogVisible,
      certContent,
      searchCertificates,
      submitApplication,
      viewCertificate,
    };
  },
};
</script>
<style scoped>

.personal-center {
  width: 100%;
  height: 100%;
  max-width: 100vw;
  max-height: 100vh;
  background: #f5f6fa;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.info-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-box {
  flex: 1;
  max-width: 300px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.btn-group-container {
  margin-left: auto;
  display: flex;
  gap: 10px;
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
  font-size: 36px;
  font-weight: bold;
  color: #1a2a6c;
  margin-bottom: 30px;
  text-align: left;
}

.personal-info-container {
  margin-bottom: 50px;
}

.buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.el-alert {
  margin-top: 20px;
}

.info-item {
  margin-bottom: 10px;
}

.table {
  width: 100%;
  box-sizing: border-box;
}

/* 子内容样式 */
.details-container {
  padding: 10px 20px;
  background-color: #fafafa;
  border: 1px solid #eaeaea;
  border-radius: 4px;
}

.detail-item {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.detail-label {
  font-weight: bold;
  width: 100px;
  color: #606266;
}

.detail-value {
  flex: 1;
  margin-left: 10px;
  color: #303133;
  line-height: 1.5;
}

.detail-item:not(:last-child) {
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.detail-value span {
  font-weight: bold;
}

.title:hover {
  animation-play-state: paused;
}
</style>
