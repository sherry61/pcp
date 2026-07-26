<template>
  <div class="market-seller">
    <AppHeader :username="username" :userId="userId"/>
    <div class="main-content">
      <AppSidebar/>
      <div class="content">
        <h2 class="page-title">卖家交易中心</h2>
        <div class="seller-dashboard">
          <div class="asset-market">
            <div class="market-header">
              <h3>我的资产市场</h3>
              <div class="search-box">
                <input
                  v-model="searchTerm"
                  placeholder="搜索资产名称"
                  @keyup.enter="searchAssets"
                />
                <button @click="searchAssets">
                  搜索
                </button>
              </div>
            </div>
            <div class="asset-list">
              <div
                class="asset-card"
                v-for="asset in paginatedAssets"
                :key="asset.file_hash"
              >
                <div class="asset-image">
                  <img
                    v-if="asset.picture"
                    :src="`data:image/jpeg;base64,${asset.picture}`"
                    alt="asset"
                  />
                  <div v-else class="no-image">
                    无图片
                  </div>
                </div>
                <div class="asset-info">
                  <h3>
                    {{ asset.asset_name || asset.file_hash }}
                  </h3>
                  <p>
                    {{ asset.description || '暂无描述' }}
                  </p>
                  <div class="asset-row">
                    <span>领域</span>
                    <span>
                      {{ asset.industry_raw_name || '未分类' }}
                    </span>
                  </div>
                  <div class="asset-row">
                    <span>资产类型</span>
                    <span>
                      {{ asset.asset_type || '未知' }}
                    </span>
                  </div>
                  <div class="asset-row">
                    <span>交付方式</span>
                    <span>
                      {{ asset.delivery_method_label || asset.delivery_method || '未设置' }}
                    </span>
                  </div>
                </div>
              </div>
              <div
                v-if="paginatedAssets.length===0"
                class="empty"
              >
                暂无资产
              </div>
            </div>
          </div>
          <div class="order-panel">
            <div class="order-header">
              <h3>
                待处理交易
              </h3>
              <span>
                {{ awaitingAssets.length }}
              </span>
            </div>
            <div
              v-if="awaitingAssets.length===0"
              class="empty"
            >
              暂无购买申请
            </div>
            <div
              v-for="asset in awaitingAssets"
              :key="asset.transaction_id"
              class="order-card"
            >
              <div class="order-title">
                交易 #{{ asset.transaction_id }}
              </div>
              <div class="order-item">
                资产：
                {{ asset.file_hash || asset.asset_id }}
              </div>
              <div class="order-item">
                买家：
                {{ asset.buyer_address }}
              </div>
              <div class="order-item">
                数量：
                {{ asset.quantity || 1 }}
              </div>
              <div class="order-item">
                购买权限：
                {{ asset.quality || '未设置' }}
              </div>
              <div class="order-item">
                交付方式：
                {{ asset.delivery_method_label || asset.delivery_method || '未设置' }}
              </div>
              <div class="order-item">
                状态：
                {{ asset.status }}
              </div>
              <button
                class="confirm-btn"
                v-if="asset.status==='待确认'"
                @click="confirmTransaction(asset)"
              >
                确认交易
              </button>
              <button
                class="disabled-btn"
                v-else
                disabled
              >
                已处理
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import axios from 'axios'
export default{
name:'MarketSeller',
components:{
AppHeader,
AppSidebar
},
data(){
return{
username:'',
userId:'',
address:'',
certificates:[],
assets:[],
displayedAssets:[],
awaitingAssets:[],
searchTerm:'',
currentPage:1,
itemsPerPage:8,
isLoading:false,
selectedAsset:null
}
},
computed:{
paginatedAssets(){
const start=(this.currentPage-1)*this.itemsPerPage;
const end=start+this.itemsPerPage;
return this.displayedAssets.slice(start,end);
}
},
async mounted(){
const token=localStorage.getItem('token');
if(token){
try{
const payload=this.parseJwt(token);
this.username=decodeURIComponent(payload.username||'');
await this.fetchUserId(this.username);
await this.fetchCertificates();
}catch(e){
console.error('解析用户信息失败',e);
}
}
await this.fetchAssets();
await this.fetchPendingAssets();
},
methods:{
parseJwt(token){
try{
return JSON.parse(
decodeURIComponent(
escape(
window.atob(
token.split('.')[1]
.replace(/-/g,'+')
.replace(/_/g,'/')
)
)
)
);
}catch(e){
return {};
}
},
async fetchUserId(username){
try{
const res=await axios.post(
'http://10.112.47.214:3000/api/get-user-id',
{
username:username
}
);
this.userId=String(res.data.id);
}catch(e){
console.error('获取用户ID失败',e);
}
},
async fetchCertificates(){
try{
const res=await axios.post(
'http://10.112.47.214:3000/api/get-certificates',
{
userId:this.userId
}
);
this.certificates=res.data.certificates||[];
if(this.certificates.length>0){
this.address=this.certificates[0].address;
console.log("当前卖家地址:",this.address);
}
}catch(e){
console.error("获取证书失败:",e);
this.certificates=[];
}
},
async fetchAssets(){
try{
const res=await axios.get(
'http://10.112.47.214:3000/api/get-assets'
);
let list=res.data.assets||res.data||[];
list=list.map(item=>{
return{
...item,
delivery_method:item.delivery_method||item.pc_type||'',
delivery_method_label:this.getDeliveryMethodLabel(item.delivery_method||item.pc_type)
};
});
this.assets=list;
this.displayedAssets=list;
console.log("卖家资产:",list);
}catch(e){
console.error('获取资产市场失败',e);
this.assets=[];
this.displayedAssets=[];
}
},
searchAssets(){
const keyword=this.searchTerm.trim().toLowerCase();
if(!keyword){
this.displayedAssets=this.assets;
return;
}
this.displayedAssets=this.assets.filter(item=>{
return(
(item.asset_name||'').toLowerCase().includes(keyword)||
(item.description||'').toLowerCase().includes(keyword)||
(item.industry_raw_name||'').toLowerCase().includes(keyword)
);
});
},
async fetchPendingAssets(){
try{
if(!this.address){
console.error("卖家地址为空");
return;
}
const res=await axios.get(
`http://10.112.47.214:3000/api/seller-pending-transactions/${this.address}`
);
const list=res.data.pendingTransactions||res.data.transactions||[];
this.awaitingAssets=list.map(item=>{
return{
...item,
delivery_method:item.delivery_method||'',
delivery_method_label:this.getDeliveryMethodLabel(item.delivery_method)
};
});
}catch(e){
console.error('获取待确认交易失败',e);
this.awaitingAssets=[];
}
},
getDeliveryMethodLabel(method){
const map={
HE:'同态加密',
PRE:'代理重加密',
FL:'联邦学习',
MPC:'多方安全计算',
TEE:'可信执行环境'
};
return map[String(method||'').toUpperCase()]||'未设置';
},
async confirmTransaction(asset){
try{
const deliveryMethod=asset.delivery_method;
if(!deliveryMethod){
this.$message.error('资产未设置交付方式');
return;
}
const response=await axios.post(
'http://10.112.47.214:3000/api/seller-confirm-transaction',
{
transactionId:asset.transaction_id,
sellerAddress:asset.seller_address,
buyerAddress:asset.buyer_address
}
);
if(!response.data.success){
throw new Error(response.data.message);
}
await this.saveDigitalContract(asset,deliveryMethod);
this.$message.success('交易确认成功');
await this.fetchPendingAssets();
}catch(e){
console.error('确认交易失败:',e);
this.$message.error(
e.response?.data?.message||
e.message||
'确认交易失败'
);
}
},
async saveDigitalContract(asset,deliveryMethod){
try{
await axios.post(
'http://10.112.47.214:3000/api/save-digital-contract',
{
transaction_id:asset.transaction_id,
asset_id:asset.asset_id,
seller_address:asset.seller_address,
buyer_address:asset.buyer_address,
delivery_method:deliveryMethod
}
);
}catch(e){
console.error('保存数字合约失败:',e);
}
},
async transferAsset(asset){
try{
await axios.post(
'http://10.112.47.214:3000/api/transfer-asset',
{
transactionId:asset.transaction_id
}
);
}catch(e){
console.error('资产转移失败:',e);
}
}
}
}
</script>
<style scoped>
.market-seller{
width:100%;
height:100%;
background:#f5f6fa;
}
.main-content{
display:flex;
height:calc(100vh - 70px);
background:#f5f6fa;
}
.content{
flex:1;
padding:20px 30px;
overflow:auto;
}
.page-title{
font-size:24px;
font-weight:600;
color:#333;
margin:10px 0 20px;
}
.seller-dashboard{
display:grid;
grid-template-columns:3fr 1fr;
gap:20px;
align-items:stretch;
}
.asset-market{
background:#fff;
border-radius:12px;
padding:20px;
box-shadow:0 2px 10px rgba(0,0,0,.06);
min-height:700px;
}
.market-header{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:20px;
border-bottom:1px solid #edf0f5;
padding-bottom:15px;
}
.market-header h3{
margin:0;
font-size:18px;
color:#222;
}
.search-box{
display:flex;
align-items:center;
gap:10px;
}
.search-box input{
width:260px;
height:36px;
border:1px solid #dcdfe6;
border-radius:8px;
padding:0 12px;
font-size:14px;
outline:none;
}
.search-box input:focus{
border-color:#409eff;
}
.search-box button{
height:36px;
padding:0 18px;
background:#409eff;
border:none;
border-radius:8px;
color:#fff;
cursor:pointer;
}
.asset-list{
display:grid;
grid-template-columns:repeat(3,minmax(0,1fr));
gap:16px;
}
.asset-card{
background:#fff;
border:1px solid #edf0f5;
border-radius:10px;
overflow:hidden;
transition:.2s;
}
.asset-card:hover{
box-shadow:0 5px 15px rgba(0,0,0,.08);
transform:translateY(-2px);
}
.asset-image{
height:120px;
background:#f6f8fc;
display:flex;
justify-content:center;
align-items:center;
}
.asset-image img{
width:100%;
height:100%;
object-fit:cover;
}
.no-image{
font-size:13px;
color:#999;
}
.asset-info{
padding:15px;
}
.asset-info h3{
font-size:16px;
margin:0 0 10px;
color:#222;
white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
}
.asset-info p{
height:40px;
font-size:13px;
color:#666;
line-height:20px;
overflow:hidden;
margin:0 0 12px;
}
.asset-row{
display:flex;
justify-content:space-between;
font-size:13px;
color:#666;
margin-top:8px;
}
.asset-row span:last-child{
color:#333;
font-weight:500;
}
.order-panel{
background:#fff;
border-radius:12px;
padding:20px;
box-shadow:0 2px 10px rgba(0,0,0,.06);
min-height:700px;
max-height:700px;
overflow-y:auto;
}
.order-header{
display:flex;
justify-content:space-between;
align-items:center;
border-bottom:1px solid #edf0f5;
padding-bottom:15px;
margin-bottom:15px;
}
.order-header h3{
margin:0;
font-size:18px;
color:#222;
}
.order-header span{
background:#409eff;
color:#fff;
font-size:12px;
padding:3px 10px;
border-radius:20px;
}
.order-card{
background:#f8fafc;
border-radius:10px;
padding:15px;
margin-bottom:15px;
border:1px solid #edf0f5;
}
.order-title{
font-size:15px;
font-weight:600;
color:#222;
margin-bottom:12px;
}
.order-item{
font-size:13px;
color:#666;
line-height:22px;
word-break:break-all;
}
.confirm-btn{
width:100%;
height:36px;
margin-top:15px;
border:none;
border-radius:8px;
background:#409eff;
color:#fff;
font-size:14px;
cursor:pointer;
}
.confirm-btn:hover{
background:#337ecc;
}
.disabled-btn{
width:100%;
height:36px;
margin-top:15px;
border:none;
border-radius:8px;
background:#dcdfe6;
color:#999;
}
.empty{
text-align:center;
padding:50px 0;
color:#999;
font-size:14px;
}
@media(max-width:1400px){
.seller-dashboard{
grid-template-columns:1fr;
}
.asset-list{
grid-template-columns:repeat(2,minmax(0,1fr));
}
}
@media(max-width:900px){
.asset-list{
grid-template-columns:1fr;
}
.search-box input{
width:160px;
}
}
</style>