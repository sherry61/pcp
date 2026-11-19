<template><span hidden aria-hidden="true"></span></template>

<script>
import { h } from 'vue'
import { ElNotification } from 'element-plus'
import { getDeliveryNotifications } from '@/utils/deliveryNotificationsApi'
import { createDeliveryNotificationMonitor, noticeContent, deliveryDestination } from '@/utils/globalDeliveryNotifications'

export default {
  name: 'GlobalDeliveryNotifications',
  watch: { '$route.fullPath'() { this.monitor?.refresh() } },
  mounted() {
    this.monitor = createDeliveryNotificationMonitor({
      storage: window.localStorage,
      getContext: () => this.notificationContext(),
      fetchNotifications: getDeliveryNotifications,
      showNotice: (notice, onClose) => {
        const content = noticeContent(notice)
        const target = deliveryDestination(notice)
        let handle
        handle = ElNotification({ ...content, duration: 0, showClose: true, position: 'top-right',
          customClass: 'global-delivery-notice', onClose,
          message: h('div', [h('p', content.message), h('button', {
            class: 'delivery-notice-link', type: 'button', onClick: () => {
              handle.close()
              this.$router.push(target).catch(() => {})
            }
          }, '前往资产交付')]) })
        return handle
      }
    })
    this.refreshNotifications = () => this.monitor.refresh()
    window.addEventListener('role-changed', this.refreshNotifications)
    window.addEventListener('storage', this.refreshNotifications)
    window.addEventListener('focus', this.refreshNotifications)
    this.monitor.start()
  },
  beforeUnmount() {
    this.monitor?.stop()
    window.removeEventListener('role-changed', this.refreshNotifications)
    window.removeEventListener('storage', this.refreshNotifications)
    window.removeEventListener('focus', this.refreshNotifications)
  },
  methods: {
    notificationContext() {
      if (['/login', '/register'].includes(this.$route.path)) return null
      const token = localStorage.getItem('token')
      const role = localStorage.getItem('user_role') || 'buyer'
      if (!token || !['buyer', 'seller'].includes(role) || ['admin', 'auditor', 'regulator'].includes(localStorage.getItem('login_role'))) return null
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (!payload.id || payload.exp * 1000 <= Date.now()) return null
        return { token, role, identity: String(payload.id) }
      } catch (_) { return null }
    }
  }
}
</script>

<style>
.global-delivery-notice .el-notification__content p { margin: 0 0 10px; }
.delivery-notice-link { padding: 0; border: 0; background: transparent; color: #337ecc; text-decoration: underline; cursor: pointer; font: inherit; }
.delivery-notice-link:focus-visible { outline: 2px solid #409eff; outline-offset: 3px; }
</style>
