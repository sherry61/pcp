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
            <el-form-item label="选择组织">
              <el-select v-model="form.organization" placeholder="请选择组织">
                <el-option label="wx-org1.chainmaker.org" value="wx-org1.chainmaker.org"></el-option>
                <el-option label="wx-org2.chainmaker.org" value="wx-org2.chainmaker.org"></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="选择角色">
              <el-select v-model="form.role" placeholder="请选择角色">
                <el-option label="client" value="client"></el-option>
                <el-option label="admin" value="admin"></el-option>
              </el-select>
            </el-form-item>
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
              <!-- 展开行 -->
              <el-table-column type="expand">
                <template #default="scope">
                  <!-- 子内容（不用表格） -->
                  <div class="details-container">
                    <div v-for="(detail, index) in scope.row.details" :key="index" class="detail-item">
                      <div class="detail-label">用途:</div>
                      <div class="detail-value">{{ detail.purpose }}</div>
                      <div class="detail-label">过期时间:</div>
                      <div class="detail-value">{{ detail.expiry || '未知' }}</div>
                      <div class="detail-label">状态:</div>
                      <div class="detail-value">
                        <span :style="{ color: detail.status === '正常' ? 'green' : 'red' }">
                          {{ detail.status || '未知' }}
                        </span>
                      </div>
                      <div class="detail-label">操作:</div>
                      <div class="detail-value">
                        <el-link type="primary" @click="viewCertificate(scope.row.name, detail.purpose === '签名证书' ? 'sign' : 'tls')">
                          <i class="el-icon-view"></i>
                          查看
                        </el-link>
                      </div>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <!-- 主表格列 -->
              <el-table-column prop="name" label="证书名称" />
              <el-table-column prop="organization" label="所属组织" />
              <el-table-column prop="role" label="证书角色" />
              <el-table-column prop="time" label="申请时间" />
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

    const form = ref({
      certificateName: "",
      organization: "",
      role: "",
    });

    const certContent = ref("");

    const submitApplication = async () => {
      if (!form.value.certificateName) {
        message.value = "证书名称不能为空";
        return;
      }

      // 验证证书名称格式（1-10个字母或数字）
      const certNamePattern = /^[a-zA-Z0-9]{1,10}$/;
      if (!certNamePattern.test(form.value.certificateName)) {
        message.value = "证书名称格式不正确，必须是1-10个字母或数字";
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
            isDialogVisible.value = false;
            form.value.certificateName = "";
            form.value.organization = "";
            form.value.role = "";
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
    const formatDateTime = (date) => {
      if (!(date instanceof Date)) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }


    // 获取用户证书数据
   // 获取用户证书数据
const fetchUserCertificate = async (userId) => {
  try {
    loading.value = true;
    const [response1, response2] = await Promise.all([
      // 获取 org-chainmaker1 的证书
      axios.post("http://10.112.47.214:3000/api/get-certificates", { userId: parseInt(userId) }),
      
      // 获取 org-chainmaker2 的证书
      axios.post("http://10.112.47.214:3000/api/get-certificates2", { userId: parseInt(userId) })
    ]);
    
    // 合并两个组织的证书数据
    const certificates1 = response1.data.certificates || [];
    const certificates2 = response2.data.certificates || [];

    // 合并结果
    const allCertificates = [...certificates1, ...certificates2];

    if (allCertificates.length > 0) {
      // 构建表格数据
      tableData.value = allCertificates.map((item) => {
        const certName = item.cert; // 证书名称
        let organization = item.organization || "未知组织"; // 默认组织为"未知"
        let role = item.role || "未知角色"; // 默认角色为"未知"
        let applyTimeStr = ""; // 申请时间（格式化字符串）
        let expiryTimeStr = ""; // 过期时间（格式化字符串）
        let statusSign = "未知"; // 签名证书状态
        let statusTLS = "未知"; // TLS 证书状态

        // 如果后端返回了 data 对象，表示证书存在可用的参数
        if (item.data) {
          const data = item.data;

          // 如果后端返回了 org_id，可根据需要进行赋值
          if (data.org_id) {
            organization = data.org_id;
          }

          // 解析 created_at 作为申请时间
          if (data.created_at) {
            // created_at 是 Unix 时间戳（秒）
            const applyTime = new Date(data.created_at * 1000);
            applyTimeStr = formatDateTime(applyTime);

            // 过期时间 = created_at + 6个月（此处简单用 6 * 30 天 = 180 天）
            const halfYearSeconds = 180 * 24 * 60 * 60;
            const expireTime = new Date((data.created_at + halfYearSeconds) * 1000);
            expiryTimeStr = formatDateTime(expireTime);

            // 判断是否过期
            const now = new Date();
            if (now < expireTime) {
              statusSign = "正常";
              statusTLS = "正常";
            } else {
              statusSign = "过期";
              statusTLS = "过期";
            }
          }
        } else if (item.message) {
          // 如果后端只返回了 message，表示“证书参数未找到”
          statusSign = "无效";
          statusTLS = "无效";
        }

        return {
          name: certName,
          organization: organization,
          role: role,
          time: applyTimeStr,
          details: [
            {
              purpose: "签名证书",
              expiry: expiryTimeStr,
              status: statusSign,
              link: "查看",
            },
            {
              purpose: "TLS证书",
              expiry: expiryTimeStr,
              status: statusTLS,
              link: "查看",
            },
          ],
        };
      });
    } else {
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
        tableData.value = certificates.value
          .filter((certName) => certName.includes(searchQuery.value))
          .map((certName) => ({
            name: certName,
            organization: "wx-org1.chainmaker.org",
            role: "client",
            time: "2024-07-08 11:10:46",
            details: [
              {
                purpose: "签名证书",
                expiry: "",
                status: "",
                link: "查看",
              },
              {
                purpose: "TLS证书",
                expiry: "",
                status: "",
                link: "查看",
              },
            ],
          }));
      } else {
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
