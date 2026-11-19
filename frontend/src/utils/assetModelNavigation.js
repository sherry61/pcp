function modelReturnLocation(returnTo, modelId) {
  if (typeof returnTo !== 'string' || !/^asset:[1-9][0-9]*$/.test(String(modelId || ''))) return null;
  // Only return to the local product page that opened this selection flow.
  if (!/^\/asset\/[^/?#]+(?:[?#]|$)/.test(returnTo) || /[\\\r\n]/.test(returnTo)) return null;
  const url = new URL(returnTo, 'http://local');
  if (!/^\/asset\/[^/]+$/.test(url.pathname)) return null;
  url.searchParams.set('modelAssetId', modelId);
  url.searchParams.set('openPurchase', '1');
  return `${url.pathname}${url.search}${url.hash}`;
}

module.exports = { modelReturnLocation };
