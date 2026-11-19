const test = require('node:test');
const assert = require('node:assert/strict');
const { modelReturnLocation } = require('./assetModelNavigation');

test('model selection preserves the product, auction and delegation context', () => {
  const path = modelReturnLocation('/asset/product-id?auctionWinner=1&delegationId=5#details', 'asset:225');
  const url = new URL(path, 'http://local');
  assert.equal(url.pathname, '/asset/product-id');
  assert.equal(url.searchParams.get('auctionWinner'), '1');
  assert.equal(url.searchParams.get('delegationId'), '5');
  assert.equal(url.searchParams.get('modelAssetId'), 'asset:225');
  assert.equal(url.searchParams.get('openPurchase'), '1');
  assert.equal(url.hash, '#details');
});

test('model return cannot navigate outside the product flow or to another origin', () => {
  for (const invalid of [null, '//evil/asset/a', 'https://evil/asset/a', '/login', '/asset/a/../../login', '/asset/%2e%2e', '/asset/a\\b', '/asset/a\n']) {
    assert.equal(modelReturnLocation(invalid, 'asset:225'), null, `invalid return: ${invalid}`);
  }
  assert.equal(modelReturnLocation('/asset/a', 'forged-id'), null);
});
