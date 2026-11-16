const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_CALLBACK_URL,
  getPccCallbackUrl
} = require('../pcp/callback');
const { buildHeContractPayload } = require('../pcp/he');
const { buildPreContractPayload } = require('../pcp/pre');
const { buildFlContractPayload } = require('../pcp/fl');

const transaction = {
  buyer_address: 'buyer_addr',
  seller_address: 'seller_addr'
};

const FL_BUYER_PUBLIC_KEY =
  '2D2D2D2D2D424547494E205055424C4943204B45592D2D2D2D2D0A544553540A2D2D2D2D2D454E44205055424C4943204B45592D2D2D2D2D0A';

function withCallbackEnv(value, fn) {
  const hadValue = Object.prototype.hasOwnProperty.call(process.env, 'PCC_CALLBACK_URL');
  const previous = process.env.PCC_CALLBACK_URL;

  if (value === undefined) {
    delete process.env.PCC_CALLBACK_URL;
  } else {
    process.env.PCC_CALLBACK_URL = value;
  }

  try {
    fn();
  } finally {
    if (hadValue) {
      process.env.PCC_CALLBACK_URL = previous;
    } else {
      delete process.env.PCC_CALLBACK_URL;
    }
  }
}

test('getPccCallbackUrl falls back to the host-reachable default', () => {
  withCallbackEnv(undefined, () => {
    assert.equal(getPccCallbackUrl(), DEFAULT_CALLBACK_URL);
  });
});

test('getPccCallbackUrl honours PCC_CALLBACK_URL and supports explicit opt-out', () => {
  withCallbackEnv('https://audit.example/pcc/results', () => {
    assert.equal(getPccCallbackUrl(), 'https://audit.example/pcc/results');
  });

  withCallbackEnv('', () => {
    assert.equal(getPccCallbackUrl(), '');
  });
});

test('contract payloads carry callback_url only when one is supplied', () => {
  withCallbackEnv(undefined, () => {
    const heWithout = buildHeContractPayload({
      transaction,
      businessContractId: 'CONTRACT-001',
      encType: 'Paillier',
      operation: 'ADD'
    });
    const preWithout = buildPreContractPayload({
      transaction,
      businessContractId: 'CONTRACT-001'
    });
    const flWithout = buildFlContractPayload({
      transaction,
      businessContractId: 'CONTRACT-001',
      sellerIds: ['seller_a'],
      buyerResultPublicKey: FL_BUYER_PUBLIC_KEY
    });

    assert.equal('callback_url' in heWithout, false);
    assert.equal('callback_url' in preWithout, false);
    assert.equal('callback_url' in flWithout, false);
  });

  const callbackUrl = 'https://audit.example/pcc/results';
  const he = buildHeContractPayload({
    transaction,
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'ADD',
    callbackUrl
  });
  const pre = buildPreContractPayload({
    transaction,
    businessContractId: 'CONTRACT-001',
    callbackUrl
  });
  const fl = buildFlContractPayload({
    transaction,
    businessContractId: 'CONTRACT-001',
    sellerIds: ['seller_a'],
    buyerResultPublicKey: FL_BUYER_PUBLIC_KEY,
    callbackUrl
  });

  assert.equal(he.callback_url, callbackUrl);
  assert.equal(pre.callback_url, callbackUrl);
  assert.equal(fl.callback_url, callbackUrl);
});
