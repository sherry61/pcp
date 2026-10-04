const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { AlipaySdk } = require('alipay-sdk');

const APP_ID = process.env.ALIPAY_APP_ID || '';
const GATEWAY =
  process.env.ALIPAY_GATEWAY || 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';
const PRIVATE_KEY = process.env.ALIPAY_PRIVATE_KEY || '';
const ALIPAY_PUBLIC_KEY = process.env.ALIPAY_ALIPAY_PUBLIC_KEY || '';
const NOTIFY_URL = process.env.ALIPAY_NOTIFY_URL || '';

const enabled = Boolean(APP_ID && PRIVATE_KEY && ALIPAY_PUBLIC_KEY);

let sdk = null;
if (enabled) {
  sdk = new AlipaySdk({
    appId: APP_ID,
    privateKey: PRIVATE_KEY,
    alipayPublicKey: ALIPAY_PUBLIC_KEY,
    gateway: GATEWAY,
    signType: 'RSA2'
  });
}

module.exports = {
  enabled,
  sdk,
  appId: APP_ID,
  gateway: GATEWAY,
  notifyUrl: NOTIFY_URL
};
