'use strict';

// 生成“个人跨银行存款联合核验”演示数据。
//
// 三家脱敏银行各 100 行，客户存在跨行重叠：
//   BANK_A: 客户 001-100
//   BANK_B: 客户 031-130
//   BANK_C: 客户 061-160
//
// 只有 total_assets（存款余额，元）参与 MPC 计算，其余列均为真实感噪声。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT_DIR = __dirname;
const SNAPSHOT_DATE = '2026-11-16';
const THRESHOLD = 100000;

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗'];
const GIVEN_CHARS = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '霞', '平', '刚'];
const CITIES = ['北京', '上海', '深圳', '广州', '杭州', '成都', '武汉', '南京', '苏州', '西安'];
const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const ACCOUNT_TYPES = ['活期储蓄', '定期存款', '大额存单', '通知存款', '结构性存款'];

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function seededRandom(seedText) {
  let a = parseInt(sha256(seedText).slice(0, 8), 16) >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

function buildCustomer(index) {
  const id = String(index).padStart(3, '0');
  const random = seededRandom(`customer-${id}`);

  const surname = pick(SURNAMES, random);
  const given = pick(GIVEN_CHARS, random);
  const name = `${surname}*${given}`;
  const userId = `UID_${sha256(`uid-${id}`).slice(0, 8).toUpperCase()}`;
  const idHash = sha256(`id-card-${id}`);
  const city = pick(CITIES, random);
  const ageBand = pick(AGE_BANDS, random);

  // 客户分层：低 60 人、中 60 人、高 40 人。
  // 结合跨行重叠，使阈值 100000 附近有达标/不达标两类样本。
  let tier = 'mid';
  if (index <= 60) tier = 'low';
  else if (index <= 120) tier = 'mid';
  else tier = 'high';

  return { index, id, name, userId, idHash, city, ageBand, tier };
}

function balanceFor(customer, bankCode) {
  const random = seededRandom(`balance-${customer.id}-${bankCode}`);
  const ranges = {
    low: [5000, 25000],
    mid: [25000, 60000],
    high: [60000, 250000]
  };
  const [min, max] = ranges[customer.tier];
  return roundTo(min + random() * (max - min), 100);
}

function levelFor(balance) {
  if (balance < 30000) return '普通';
  if (balance < 80000) return '金卡';
  if (balance < 200000) return '白金';
  return '私行';
}

function accountFor(customer, bankCode) {
  const random = seededRandom(`account-${customer.id}-${bankCode}`);
  const tail = String(Math.floor(random() * 10000)).padStart(4, '0');
  return `6222 **** **** ${tail}`;
}

function loanFor(customer, bankCode) {
  const random = seededRandom(`loan-${customer.id}-${bankCode}`);
  if (random() > 0.3) return 0;
  return roundTo(10000 + random() * 490000, 1000);
}

function accountTypeFor(customer, bankCode) {
  const random = seededRandom(`type-${customer.id}-${bankCode}`);
  return pick(ACCOUNT_TYPES, random);
}

const BANKS = [
  // seed 用于生成随机数据（保持改名前后数据不变），code 写入 bank_code 列。
  { seed: 'BANK_A', code: 'ICBC', file: 'ICBC_个人存款余额明细.csv', from: 1, to: 100 },
  { seed: 'BANK_B', code: 'CCB', file: 'CCB_个人存款余额明细.csv', from: 31, to: 130 },
  { seed: 'BANK_C', code: 'CMB', file: 'CMB_个人存款余额明细.csv', from: 61, to: 160 }
];

const HEADER = [
  'user_id',
  'customer_name',
  'id_hash',
  'bank_code',
  'account_no',
  'account_type',
  'customer_level',
  'city',
  'age_band',
  'total_assets',
  'loan_balance',
  'snapshot_date'
];

const customers = new Map();
for (let i = 1; i <= 160; i += 1) {
  customers.set(i, buildCustomer(i));
}

const crossBankTotals = new Map();
for (const bank of BANKS) {
  const lines = [HEADER.join(',')];
  for (let i = bank.from; i <= bank.to; i += 1) {
    const customer = customers.get(i);
    const balance = balanceFor(customer, bank.seed);
    crossBankTotals.set(
      customer.userId,
      (crossBankTotals.get(customer.userId) || 0) + balance
    );
    lines.push([
      customer.userId,
      customer.name,
      customer.idHash,
      bank.code,
      accountFor(customer, bank.seed),
      accountTypeFor(customer, bank.seed),
      levelFor(balance),
      customer.city,
      customer.ageBand,
      balance,
      loanFor(customer, bank.seed),
      SNAPSHOT_DATE
    ].join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, bank.file), `${lines.join('\n')}\n`, 'utf8');
  console.log(`${bank.file}: ${lines.length - 1} 行 (${bank.code})`);
}

const totals = Array.from(crossBankTotals.values());
const qualified = totals.filter((value) => value >= THRESHOLD).length;
console.log(`\n唯一客户: ${totals.length}`);
console.log(`阈值: ${THRESHOLD}`);
console.log(`达标: ${qualified} / ${totals.length}`);
console.log(`合计余额范围: ${Math.min(...totals)} ~ ${Math.max(...totals)}`);
