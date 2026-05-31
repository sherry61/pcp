const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
const JSON_MIME_TYPE = 'application/json;charset=utf-8';
const TEXT_MIME_TYPE = 'text/plain;charset=utf-8';

function ensureFilenameExtension(filename, extension) {
  const normalizedFilename = String(filename || '').trim() || 'download';
  const normalizedExtension = String(extension || '').trim().replace(/^\./, '');

  if (!normalizedExtension) {
    return normalizedFilename;
  }

  const suffix = `.${normalizedExtension}`;
  return normalizedFilename.toLowerCase().endsWith(suffix.toLowerCase())
    ? normalizedFilename
    : `${normalizedFilename}${suffix}`;
}

function resolveBrowserApis(browserOptions = {}) {
  const runtimeWindow =
    browserOptions.windowRef || (typeof window !== 'undefined' ? window : null);
  const runtimeDocument =
    browserOptions.documentRef || (typeof document !== 'undefined' ? document : null);

  if (!runtimeWindow || !runtimeWindow.URL || typeof runtimeWindow.URL.createObjectURL !== 'function') {
    throw new Error('Browser URL APIs are unavailable in the current environment.');
  }

  if (!runtimeDocument || typeof runtimeDocument.createElement !== 'function') {
    throw new Error('Browser document APIs are unavailable in the current environment.');
  }

  return {
    runtimeWindow,
    runtimeDocument,
  };
}

function downloadBlobFile({ blob, filename, browserOptions } = {}) {
  if (!blob) {
    throw new Error('A Blob instance is required for download.');
  }

  const { runtimeWindow, runtimeDocument } = resolveBrowserApis(browserOptions);
  const objectUrl = runtimeWindow.URL.createObjectURL(blob);
  const link = runtimeDocument.createElement('a');

  link.href = objectUrl;
  link.download = String(filename || 'download');
  link.style.display = 'none';

  const parent = runtimeDocument.body || runtimeDocument.documentElement;
  if (parent && typeof parent.appendChild === 'function') {
    parent.appendChild(link);
  }

  link.click();

  if (link.parentNode && typeof link.parentNode.removeChild === 'function') {
    link.parentNode.removeChild(link);
  }

  runtimeWindow.URL.revokeObjectURL(objectUrl);
}

function downloadTextFile({ text, filename, mimeType = TEXT_MIME_TYPE, browserOptions } = {}) {
  const payload = typeof text === 'string' ? text : String(text ?? '');
  const blob = new Blob([payload], { type: mimeType });

  return downloadBlobFile({
    blob,
    filename,
    browserOptions,
  });
}

function downloadCsvText({ csvText, filename, browserOptions } = {}) {
  return downloadTextFile({
    text: csvText,
    filename: ensureFilenameExtension(filename || 'he-result', 'csv'),
    mimeType: CSV_MIME_TYPE,
    browserOptions,
  });
}

async function blobToText(blob) {
  if (!blob) {
    return '';
  }

  if (typeof blob.text === 'function') {
    return blob.text();
  }

  if (typeof Response !== 'undefined') {
    return new Response(blob).text();
  }

  throw new Error('Blob text conversion is unavailable in the current environment.');
}

module.exports = {
  CSV_MIME_TYPE,
  JSON_MIME_TYPE,
  TEXT_MIME_TYPE,
  ensureFilenameExtension,
  downloadBlobFile,
  downloadTextFile,
  downloadCsvText,
  blobToText,
};

module.exports.default = module.exports;
