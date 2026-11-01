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

          <el-table :data="pagedUsers" v-loading="loading" stripe style="width: 100%">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="username" label="用户名" min-width="120" />
            <el-table-column prop="email" label="邮箱" min-width="160" />
            <el-table-column label="角色" width="110">
              <template #default="{ row }">
                <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
              </template>
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

          <div class="pagination-row">
            <el-pagination
              background
              layout="total, sizes, prev, pager, next"
              :total="users.length"
              :page-sizes="[10, 20, 50]"
              v-model:current-page="page"
              v-model:page-size="pageSize"
              @size-change="page = 1"
            />
          </div>
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
      editVisible: false,
      editUser: {
        id: null,
        username: '',
        role: 'USER',
        auditor_target: ''
      },
      saving: false,
      page: 1,
      pageSize: 10
    };
  },
  computed: {
    pagedUsers() {
      const start = (this.page - 1) * this.pageSize;
      return this.users.slice(start, start + this.pageSize);
    }
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
      try {
        const response = await axios.get(`${API_BASE}/api/admin/nodes`, { headers: this.headers() });
        this.nodes = response.data?.nodes || [];
      } catch (error) {
        ElMessage.error(error.response?.data?.message || '加载节点失败');
      }
    },
    openEdit(user) {
      this.editUser = {
        id: user.id,
        username: user.username,
        role: user.role || 'USER',
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
    }
  }
};
</script>

<style scoped>
.admin-users-page {
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
  width: 100%;
  padding: 24px 32px;
  box-sizing: border-box;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
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

</style>
