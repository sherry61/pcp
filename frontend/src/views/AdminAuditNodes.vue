<template>
  <div class="admin-audit-nodes-page">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="page-title">审计节点配置</h2>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h3>节点查看凭据</h3>
              <p class="panel-hint">
                这些凭据只用于演示环境自动进入审计节点，密码加密保存，不会回显。
              </p>
            </div>
            <el-button size="small" :loading="loading" @click="fetchNodes">刷新节点</el-button>
          </div>

          <el-table :data="nodes" v-loading="loading" style="width: 100%">
            <el-table-column prop="node_name" label="节点" min-width="160" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <span :class="['status-dot', row.online ? 'online' : 'offline']">
                  {{ row.online ? '在线' : '离线' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="节点账号" min-width="170">
              <template #default="{ row }">
                <el-input
                  v-model="nodeForms[row.node_id].username"
                  size="small"
                  placeholder="节点查看账号"
                />
              </template>
            </el-table-column>
            <el-table-column label="节点密码" min-width="190">
              <template #default="{ row }">
                <el-input
                  v-model="nodeForms[row.node_id].password"
                  size="small"
                  type="password"
                  show-password
                  :placeholder="row.has_credentials ? '不修改则留空' : '请输入节点密码'"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button
                  size="small"
                  type="primary"
                  :loading="Boolean(nodeSaving[row.node_id])"
                  @click="saveNodeCredentials(row)"
                >保存</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { ElMessage } from 'element-plus';
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';

const API_BASE = 'http://10.112.191.163:3000';

export default {
  name: 'AdminAuditNodes',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      nodes: [],
      loading: false,
      nodeForms: {},
      nodeSaving: {}
    };
  },
  mounted() {
    this.fetchNodes();
  },
  methods: {
    headers() {
      return {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      };
    },
    async fetchNodes() {
      this.loading = true;
      try {
        const response = await axios.get(`${API_BASE}/api/admin/nodes`, { headers: this.headers() });
        this.nodes = response.data?.nodes || [];
        const forms = { ...this.nodeForms };
        this.nodes.forEach((node) => {
          forms[node.node_id] = {
            username: node.username || forms[node.node_id]?.username || '',
            password: forms[node.node_id]?.password || ''
          };
        });
        this.nodeForms = forms;
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '加载节点失败');
      } finally {
        this.loading = false;
      }
    },
    async saveNodeCredentials(node) {
      const form = this.nodeForms[node.node_id] || { username: '', password: '' };
      if (!form.username) {
        ElMessage.warning('请填写节点账号');
        return;
      }
      if (!node.has_credentials && !form.password) {
        ElMessage.warning('首次配置必须填写节点密码');
        return;
      }

      this.nodeSaving = { ...this.nodeSaving, [node.node_id]: true };
      try {
        await axios.post(
          `${API_BASE}/api/admin/nodes/${encodeURIComponent(node.node_id)}/credentials`,
          { username: form.username, password: form.password },
          { headers: this.headers() }
        );
        ElMessage.success('节点凭据已保存');
        await this.fetchNodes();
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '保存节点凭据失败');
      } finally {
        this.nodeSaving = { ...this.nodeSaving, [node.node_id]: false };
      }
    }
  }
};
</script>

<style scoped>
.admin-audit-nodes-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f5f7fb;
}

.main-content {
  display: flex;
  height: calc(100vh - 64px);
  min-height: 0;
  overflow-y: auto;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 24px 28px;
  max-width: 1280px;
  box-sizing: border-box;
}

.page-title {
  margin: 0 0 20px;
  font-size: 22px;
  color: #1f2937;
}

.panel {
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 12px;
  padding: 18px 20px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.panel-hint {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 12px;
}

.status-dot {
  color: #6b7280;
  font-size: 12px;
}

.status-dot.online {
  color: #047857;
}

.status-dot.offline {
  color: #b91c1c;
}
</style>
