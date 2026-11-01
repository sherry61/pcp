<template>
  <div class="admin-users-page">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="page-title">用户与角色管理</h2>

        <section class="panel">
          <div class="panel-head">
            <h3>用户角色</h3>
            <el-button size="small" :loading="loading" @click="fetchUsers">刷新</el-button>
          </div>

          <el-table :data="users" v-loading="loading" stripe style="width: 100%">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="username" label="用户名" min-width="120" />
            <el-table-column prop="email" label="邮箱" min-width="160" />
            <el-table-column label="角色" width="110">
              <template #default="{ row }">
                <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="交易模式" width="100">
              <template #default="{ row }">{{ tradeLabel(row.trade_role) }}</template>
            </el-table-column>
            <el-table-column label="审计入口" min-width="170">
              <template #default="{ row }">{{ targetLabel(row.auditor_target) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h3>节点查看凭据</h3>
            <el-button size="small" :loading="nodesLoading" @click="fetchNodes">刷新节点</el-button>
          </div>
          <p class="panel-hint">这些凭据只用于演示环境自动进入审计节点，密码加密保存，不会回显。</p>

          <el-table :data="nodes" v-loading="nodesLoading" style="width: 100%">
            <el-table-column prop="node_name" label="节点" min-width="160" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <span :class="['status-dot', row.online ? 'online' : 'offline']">
                  {{ row.online ? '在线' : '离线' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="节点账号" min-width="160">
              <template #default="{ row }">
                <el-input
                  v-model="nodeForms[row.node_id].username"
                  size="small"
                  placeholder="节点查看账号"
                />
              </template>
            </el-table-column>
            <el-table-column label="节点密码" min-width="180">
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

        <el-dialog v-model="editVisible" title="编辑用户角色" width="460px">
          <el-form label-width="90px">
            <el-form-item label="用户名">
              <el-input :model-value="editUser.username" disabled />
            </el-form-item>
            <el-form-item label="角色">
              <el-select v-model="editUser.role" style="width: 100%">
                <el-option label="普通用户" value="USER" />
                <el-option label="监管方" value="REGULATOR" />
                <el-option label="审计方" value="AUDITOR" />
                <el-option label="管理员" value="ADMIN" />
              </el-select>
            </el-form-item>
            <el-form-item label="交易模式">
              <el-select v-model="editUser.trade_role" style="width: 100%">
                <el-option label="买家和卖家" value="BOTH" />
                <el-option label="买家" value="BUYER" />
                <el-option label="卖家" value="SELLER" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="editUser.role === 'AUDITOR'" label="审计入口">
              <el-select v-model="editUser.auditor_target" style="width: 100%" placeholder="请选择审计入口">
                <el-option label="全局审计总览（Hub）" value="HUB" />
                <el-option
                  v-for="node in nodes"
                  :key="node.node_id"
                  :label="`${node.node_name}${node.online ? '' : '（离线）'}`"
                  :value="`NODE:${node.node_id}`"
                />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="editVisible = false">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveRole">保存</el-button>
          </template>
        </el-dialog>
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
  name: 'AdminUsers',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      users: [],
      nodes: [],
      loading: false,
      nodesLoading: false,
      editVisible: false,
      editUser: {
        id: null,
        username: '',
        role: 'USER',
        trade_role: 'BOTH',
        auditor_target: ''
      },
      saving: false,
      nodeForms: {},
      nodeSaving: {}
    };
  },
  mounted() {
    this.fetchUsers();
    this.fetchNodes();
  },
  methods: {
    headers() {
      return {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      };
    },
    roleLabel(role) {
      return {
        USER: '普通用户',
        REGULATOR: '监管方',
        AUDITOR: '审计方',
        ADMIN: '管理员'
      }[role] || role || '普通用户';
    },
    roleTagType(role) {
      return {
        USER: 'info',
        REGULATOR: 'warning',
        AUDITOR: 'success',
        ADMIN: 'danger'
      }[role] || 'info';
    },
    tradeLabel(value) {
      return { BUYER: '买家', SELLER: '卖家', BOTH: '买家/卖家' }[value] || '买家/卖家';
    },
    targetLabel(value) {
      if (!value) return '未分配';
      if (value === 'HUB') return '全局审计总览（Hub）';
      if (String(value).startsWith('NODE:')) {
        const nodeId = String(value).slice(5);
        const node = this.nodes.find((item) => item.node_id === nodeId);
        return node ? node.node_name : nodeId;
      }
      return value;
    },
    async fetchUsers() {
      this.loading = true;
      try {
        const response = await axios.get(`${API_BASE}/api/admin/users`, { headers: this.headers() });
        this.users = response.data?.users || [];
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '加载用户失败');
      } finally {
        this.loading = false;
      }
    },
    async fetchNodes() {
      this.nodesLoading = true;
      try {
        const response = await axios.get(`${API_BASE}/api/admin/nodes`, { headers: this.headers() });
        this.nodes = response.data?.nodes || [];
        const forms = { ...this.nodeForms };
        this.nodes.forEach((node) => {
          if (!forms[node.node_id]) {
            forms[node.node_id] = { username: node.username || '', password: '' };
          } else {
            forms[node.node_id] = {
              username: forms[node.node_id].username || node.username || '',
              password: forms[node.node_id].password || ''
            };
          }
        });
        this.nodeForms = forms;
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '加载节点失败');
      } finally {
        this.nodesLoading = false;
      }
    },
    openEdit(user) {
      this.editUser = {
        id: user.id,
        username: user.username,
        role: user.role || 'USER',
        trade_role: user.trade_role || 'BOTH',
        auditor_target: user.auditor_target || ''
      };
      this.editVisible = true;
    },
    async saveRole() {
      if (this.editUser.role === 'AUDITOR' && !this.editUser.auditor_target) {
        ElMessage.warning('审计方必须选择审计入口');
        return;
      }

      this.saving = true;
      try {
        await axios.patch(
          `${API_BASE}/api/admin/users/${this.editUser.id}/role`,
          {
            role: this.editUser.role,
            trade_role: this.editUser.trade_role,
            auditor_target: this.editUser.role === 'AUDITOR' ? this.editUser.auditor_target : ''
          },
          { headers: this.headers() }
        );
        ElMessage.success('角色已更新');
        this.editVisible = false;
        await this.fetchUsers();
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '保存角色失败');
      } finally {
        this.saving = false;
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
.admin-users-page {
  width: 100%;
  height: 100%;
  background: #f5f7fb;
}

.main-content {
  display: flex;
  min-height: calc(100vh - 64px);
}

.content {
  flex: 1;
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
  margin-bottom: 20px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-head h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.panel-hint {
  margin: 0 0 12px;
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
