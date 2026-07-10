import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ChainRegistrationView from '@/views/ChainRegistrationView.vue'
import ValuationPricingView from '@/views/ValuationPricingView.vue'
import AssetManagementView from '@/views/AssetManagementView.vue'
import AssetManagementView2 from '@/views/AssetManagementView2.vue'
import MarketView from '@/views/MarketView.vue'
import MarketList from '@/views/MarketList.vue'
import MarketDetails from '@/views/MarketDetails.vue'
import PermissionManagementView from '@/views/PermissionManagementView.vue'
import AdminDashboard from '@/views/AdminDashboard.vue'
import Login from '@/views/Login.vue'
import Register from '@/views/Register.vue'
import UserManagement from './views/UserManagement.vue' 
import UserCenter from './views/UserCenter.vue'
import AssetPictureView from './views/AssetPictureView.vue'
import AssetDetail from './views/AssetDetail1.vue'
//import DeliveryPage from './views/Delivery.vue'
import DeliverySeller2 from './views/DeliverySeller2.vue'
import DeliveryBuyer from './views/DeliveryBuyer2.vue'
import DigitalContract from './views/DigitalContract.vue'
import PenetrableSupervision from './views/PenetrableSupervision.vue'
import ServiceManagement from './views/ServiceManagement.vue'
import MarketSeller from './views/MarketSeller1.vue'

const routes = [
  { path: '/home', name: 'Home', component: HomeView, meta: { requiresAuth: true, roles: ['buyer','seller','auditor'] } },

{ path: '/chain-registration', component: ChainRegistrationView, meta: { requiresAuth: true, roles: ['seller'] } },
{ path: '/asset-management2', component: AssetManagementView2, meta: { requiresAuth: true, roles: ['buyer','seller','auditor'] } },

{ path: '/market', component: MarketView, meta: { requiresAuth: true, roles: ['buyer'] } },
{ path: '/market/list', component: MarketList, meta: { requiresAuth: true, roles: ['buyer'] } },
{ path: '/market/details', component: MarketDetails, meta: { requiresAuth: true, roles: ['buyer'] } },

{ path: '/delivery/seller', name: 'DeliverySeller2', component: DeliverySeller2, meta: { requiresAuth: true, roles: ['seller'] } },
{ path: '/delivery/buyer', name: 'DeliveryBuyer', component: DeliveryBuyer, meta: { requiresAuth: true, roles: ['buyer'] } },

{ path: '/market/seller', name: 'MarketSeller', component: MarketSeller, meta: { requiresAuth: true, roles: ['seller'] } },

{ path: '/user-center', component:UserCenter, meta: { requiresAuth: true, roles: ['buyer','seller','auditor'] } },

  //{ path: '/', component: HomeView },
  { path: '/', redirect: '/login' },
  //{ path: '/home', name: 'Home', component: HomeView, meta: { requiresAuth: true } },
  { path: '/login', name: "Login", component: Login},
  { path: '/register', component: Register},
  //{ path: '/chain-registration', component: ChainRegistrationView, meta: { requiresAuth: true } },
  { path: '/valuation-pricing', component: ValuationPricingView, meta: { requiresAuth: true } },
  { path: '/asset-management', component: AssetManagementView, meta: { requiresAuth: true } },
  //{ path: '/asset-management2', component: AssetManagementView2, meta: { requiresAuth: true } },
  //{ path: '/market', component: MarketView, meta: { requiresAuth: true } },
  //{ path: '/market/list', component: MarketList, meta: { requiresAuth: true } },
  //{ path: '/market/details', component: MarketDetails, meta: { requiresAuth: true } },
  { path: '/permission-management', component: PermissionManagementView, meta: { requiresAuth: true } },
  { path: '/admin-dashboard', component: AdminDashboard, meta: { requiresAuth: true } },
  { path: '/user-management', component: UserManagement, meta: { requiresAuth: true } },
  //{ path: '/user-center', component:UserCenter, meta: { requiresAuth: true } },
  { path: '/asset-picture', component: AssetPictureView, meta: { requiresAuth: true } },
  { path: '/asset/:id', name: 'AssetDetail', component: AssetDetail, meta: { requiresAuth: true }, props: true },
  //{ path: '/delivery', name: 'DeliveryPage', component: DeliveryPage, meta: { requiresAuth: true }},
  //{ path: '/delivery/seller', name: 'DeliverySeller', component: DeliverySeller, meta: { requiresAuth: true } },
  //{ path: '/delivery/buyer', name: 'DeliveryBuyer', component: DeliveryBuyer, meta: { requiresAuth: true } },
  { path: '/contract', name: 'DigitalContract', component: DigitalContract, meta: { requiresAuth: true }},
  { path: '/supervision', name: 'Supervision', component: PenetrableSupervision, meta: { requiresAuth: false }},
  { path: '/services', name: 'ServiceManagement', component: ServiceManagement, meta: { requiresAuth: false }},
  {
  path: '/delivery',
  /*redirect: () => {
    const role = localStorage.getItem('user_role') || 'seller';
    
    return role === 'seller' ? '/delivery/seller' : '/delivery/buyer';
  },
  meta: { requiresAuth: true, roles: ['buyer','seller'] }
  */
 redirect: () => {
    const role = localStorage.getItem('user_role') || 'seller';

    if (role === 'auditor') {
      window.location.href = 'http://10.112.47.214:8081';
      return '/login';
    }

    return role === 'seller' ? '/delivery/seller' : '/delivery/buyer';
  },
  meta: { requiresAuth: true, roles: ['buyer','seller','auditor'] }

},
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 在 router.js 中添加路由守卫
/*router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token');
  
  if (to.matched.some(record => record.meta.requiresAuth)) {
    // 需要登录的页面
    if (!token) {
      next({ name: 'Login' }); // 如果没有 token，跳转到登录页
    } else {
      next(); // 继续导航
    }
  } else {
    next(); // 继续导航
  }
});*/

router.beforeEach((to, from, next) => {
  let role = localStorage.getItem('user_role');
  if (!role) {
    role = 'seller';
    localStorage.setItem('user_role', role);
  }
  const token = localStorage.getItem('token');
  //const role = localStorage.getItem('user_role') || 'buyer';

  // 需要登录
  if (to.matched.some(r => r.meta.requiresAuth)) {
    if (!token) return next('/login');
  }

  // 角色校验：如果路由配置了 roles，就必须命中
  const matchedRoles = to.matched
    .map(r => r.meta.roles)
    .filter(Boolean)
    .flat();

  if (matchedRoles.length > 0 && !matchedRoles.includes(role)) {
    // ✅ 不允许访问就踢回 home（或你想踢到 market）
    return next('/home');
  }

  next();
});




export default router
