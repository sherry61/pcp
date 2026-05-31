# HE Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current seller/buyer privacy-delivery UI with an HE-only flow, persist PCP HE contracts and public keys, and support buyer-side browser decryption of HE CSV results while keeping the code structure extensible for future PRE/FL methods.

**Architecture:** Keep the existing Vue pages as the user-facing entry points, but move HE-specific behavior into focused helpers so the pages become thin orchestration layers. Add a small PCP integration module under `backend/pcp`, a dedicated HE persistence table, and a thin set of `/api/privacy/he/*` business routes in `backend/main.js` that translate local transaction/contract state into PCP calls.

**Tech Stack:** Vue 3, Element Plus, Axios, Express, MySQL, Multer, Node built-in `crypto`, `node --test`

---

### Task 1: Create the HE persistence and config foundation

**Files:**
- Create: `backend/pcp/index.js`
- Create: `backend/pcp/constants.js`
- Create: `backend/sql/2026-05-30-he-delivery-contracts.sql`
- Create: `backend/tests/he-constants.test.js`
- Modify: `backend/main.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/he-constants.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DELIVERY_METHOD_HE,
  HE_ENC_TYPES,
  HE_OPERATIONS,
  PCP_HE_STATUSES
} = require('../pcp/constants');

test('HE constants expose the only enabled delivery method and supported PCP enums', () => {
  assert.equal(DELIVERY_METHOD_HE, 'he');
  assert.deepEqual(HE_ENC_TYPES, ['Paillier', 'ElGamal']);
  assert.deepEqual(HE_OPERATIONS, ['ADD', 'MUL']);
  assert.ok(PCP_HE_STATUSES.includes('COMPLETED'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/tests/he-constants.test.js`
Expected: FAIL with `Cannot find module '../pcp/constants'`

- [ ] **Step 3: Write minimal implementation**

```js
// backend/pcp/constants.js
const DELIVERY_METHOD_HE = 'he';
const HE_ENC_TYPES = ['Paillier', 'ElGamal'];
const HE_OPERATIONS = ['ADD', 'MUL'];
const PCP_HE_STATUSES = [
  'NOT_EXIST',
  'CREATED',
  'WAITING_INPUT',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'AUDIT_FAILED'
];

module.exports = {
  DELIVERY_METHOD_HE,
  HE_ENC_TYPES,
  HE_OPERATIONS,
  PCP_HE_STATUSES
};
```

```js
// backend/pcp/index.js
module.exports = {
  ...require('./constants')
};
```

```sql
-- backend/sql/2026-05-30-he-delivery-contracts.sql
CREATE TABLE IF NOT EXISTS he_delivery_contracts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  transaction_id VARCHAR(128) NOT NULL,
  business_contract_id VARCHAR(128) NOT NULL,
  pcp_contract_id VARCHAR(128) DEFAULT NULL,
  buyer_id VARCHAR(255) NOT NULL,
  seller_id VARCHAR(255) NOT NULL,
  selected_enc_type VARCHAR(32) DEFAULT NULL,
  selected_operation VARCHAR(16) DEFAULT NULL,
  paillier_public_key_json JSON DEFAULT NULL,
  elgamal_public_key_json JSON DEFAULT NULL,
  pcp_status VARCHAR(32) DEFAULT 'WAITING_INPUT',
  download_token TEXT DEFAULT NULL,
  result_filename VARCHAR(255) DEFAULT NULL,
  result_storage_path TEXT DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_he_tx (transaction_id),
  UNIQUE KEY uniq_he_pcp_contract (pcp_contract_id),
  KEY idx_he_business_contract (business_contract_id)
);
```

```js
// backend/main.js
const pcp = require('./pcp');
void pcp;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/tests/he-constants.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/pcp/index.js backend/pcp/constants.js backend/sql/2026-05-30-he-delivery-contracts.sql backend/tests/he-constants.test.js backend/main.js
git commit -m "feat: add HE constants and schema foundation"
```

### Task 2: Add PCP client and HE repository helpers

**Files:**
- Create: `backend/pcp/client.js`
- Create: `backend/pcp/he.js`
- Create: `backend/tests/he-client.test.js`
- Modify: `backend/pcp/index.js`
- Modify: `backend/main.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/he-client.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHeContractPayload } = require('../pcp/he');

test('buildHeContractPayload maps transaction and business contract data to PCP /he/contract body', () => {
  const payload = buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'ADD'
  });

  assert.deepEqual(payload, {
    buyer_id: 'buyer_addr',
    source_contract_id: 'CONTRACT-001',
    seller_ids: ['seller_addr'],
    operation_type: 'ADD',
    enc_type: 'Paillier',
    data_type_1: 'ciphertext',
    data_type_2: 'ciphertext'
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/tests/he-client.test.js`
Expected: FAIL with `Cannot find module '../pcp/he'`

- [ ] **Step 3: Write minimal implementation**

```js
// backend/pcp/client.js
const axios = require('axios');

function createPcpClient({ baseUrl, timeout = 30000 }) {
  return axios.create({
    baseURL: baseUrl,
    timeout
  });
}

module.exports = { createPcpClient };
```

```js
// backend/pcp/he.js
function buildHeContractPayload({ transaction, businessContractId, encType, operation }) {
  return {
    buyer_id: String(transaction.buyer_address),
    source_contract_id: String(businessContractId),
    seller_ids: [String(transaction.seller_address)],
    operation_type: String(operation).toUpperCase(),
    enc_type: encType,
    data_type_1: 'ciphertext',
    data_type_2: 'ciphertext'
  };
}

module.exports = {
  buildHeContractPayload
};
```

```js
// backend/pcp/index.js
module.exports = {
  ...require('./constants'),
  ...require('./client'),
  ...require('./he')
};
```

```js
// backend/main.js
const {
  buildHeContractPayload,
  createPcpClient
} = require('./pcp');
void buildHeContractPayload;
void createPcpClient;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/tests/he-client.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/pcp/client.js backend/pcp/he.js backend/pcp/index.js backend/tests/he-client.test.js backend/main.js
git commit -m "feat: add PCP HE client helpers"
```

### Task 3: Add HE database access and business routes

**Files:**
- Create: `backend/tests/he-routes.test.js`
- Modify: `backend/pcp/he.js`
- Modify: `backend/pcp/index.js`
- Modify: `backend/main.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/he-routes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeHeRecord } = require('../pcp/he');

test('normalizeHeRecord stores PCP contract id and uploaded public keys in a single HE record', () => {
  const record = normalizeHeRecord({
    transactionId: 'TX-001',
    businessContractId: 'CONTRACT-001',
    buyerId: 'buyer_addr',
    sellerId: 'seller_addr',
    paillierPublicKey: { n: '11', g: '12' },
    elgamalPublicKey: { p: '23', g: '5', y: '9' }
  });

  assert.equal(record.transaction_id, 'TX-001');
  assert.equal(record.business_contract_id, 'CONTRACT-001');
  assert.equal(record.pcp_status, 'WAITING_INPUT');
  assert.match(record.paillier_public_key_json, /"n":"11"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/tests/he-routes.test.js`
Expected: FAIL because `normalizeHeRecord` is missing

- [ ] **Step 3: Write minimal implementation**

```js
// backend/pcp/he.js
function normalizeHeRecord(input) {
  return {
    transaction_id: input.transactionId,
    business_contract_id: input.businessContractId,
    buyer_id: input.buyerId,
    seller_id: input.sellerId,
    paillier_public_key_json: JSON.stringify(input.paillierPublicKey),
    elgamal_public_key_json: JSON.stringify(input.elgamalPublicKey),
    pcp_status: 'WAITING_INPUT'
  };
}

module.exports = {
  buildHeContractPayload,
  normalizeHeRecord
};
```

```js
// backend/main.js
app.get('/api/privacy/he/public-key-status', async (req, res) => {
  return res.status(501).json({ message: 'planned route placeholder' });
});

app.post('/api/privacy/he/public-keys', async (req, res) => {
  return res.status(501).json({ message: 'planned route placeholder' });
});

app.post('/api/privacy/he/submit', upload.fields([{ name: 'file1' }, { name: 'file2' }]), async (req, res) => {
  return res.status(501).json({ message: 'planned route placeholder' });
});

app.get('/api/privacy/he/status', async (req, res) => {
  return res.status(501).json({ message: 'planned route placeholder' });
});

app.get('/api/privacy/he/result', async (req, res) => {
  return res.status(501).json({ message: 'planned route placeholder' });
});
```

Implementation notes for the real route work in this task:

- Replace each placeholder with real route logic, not a second patch task
- Add helper queries in `backend/main.js` or `backend/pcp/he.js` for:
  - loading `transactions` by `transaction_id`
  - loading `digital_contracts` by `transaction_id`
  - upserting `he_delivery_contracts`
  - persisting returned `pcp_contract_id`
- Use `buildHeContractPayload()` when `/api/privacy/he/submit` needs to create a PCP HE contract
- Reject `ElGamal + ADD` before any PCP request

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/tests/he-routes.test.js`
Expected: PASS

Run: `node --check backend/main.js`
Expected: no syntax errors

- [ ] **Step 5: Commit**

```bash
git add backend/pcp/he.js backend/pcp/index.js backend/tests/he-routes.test.js backend/main.js
git commit -m "feat: add HE persistence routes"
```

### Task 4: Extract frontend HE config and key/result utilities

**Files:**
- Create: `frontend/src/utils/heDeliveryConfig.js`
- Create: `frontend/src/utils/heCrypto.js`
- Create: `frontend/src/utils/heCsv.js`
- Create: `frontend/src/utils/heCrypto.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/utils/heCrypto.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPrivateKeyFilename } = require('./heCrypto');

test('buildPrivateKeyFilename creates deterministic filenames per algorithm and transaction', () => {
  assert.equal(
    buildPrivateKeyFilename({ algorithm: 'Paillier', transactionId: 'TX-1' }),
    'he-paillier-private-TX-1.json'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/utils/heCrypto.test.js`
Expected: FAIL with `Cannot find module './heCrypto'`

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/utils/heDeliveryConfig.js
export const ENABLED_DELIVERY_METHODS = ['he'];
export const HE_METHOD_LABEL = 'HE';
export const HE_ENC_TYPE_OPTIONS = ['Paillier', 'ElGamal'];
export const HE_OPERATION_OPTIONS = ['ADD', 'MUL'];
```

```js
// frontend/src/utils/heCrypto.js
function buildPrivateKeyFilename({ algorithm, transactionId }) {
  return `he-${String(algorithm).toLowerCase()}-private-${transactionId}.json`;
}

module.exports = { buildPrivateKeyFilename };
```

```js
// frontend/src/utils/heCsv.js
function downloadCsvBlob({ blob, filename }) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

module.exports = { downloadCsvBlob };
```

Keep follow-up implementation in this task focused on real HE helpers:

- keypair generation wrappers for Paillier and ElGamal
- key serialization and browser download helpers
- result decryption helpers returning CSV text
- config helpers for filtering unsupported algorithm/operation pairs

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/utils/heCrypto.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/heDeliveryConfig.js frontend/src/utils/heCrypto.js frontend/src/utils/heCsv.js frontend/src/utils/heCrypto.test.js
git commit -m "feat: add frontend HE utility layer"
```

### Task 5: Rewrite the seller delivery page around HE-only behavior

**Files:**
- Modify: `frontend/src/views/DeliverySeller2.vue`
- Modify: `frontend/src/utils/heDeliveryConfig.js`
- Modify: `frontend/src/utils/heCrypto.js`

- [ ] **Step 1: Write the failing test**

Create a focused pure helper test before touching the Vue page:

```js
// frontend/src/utils/heCrypto.test.js
const { resolveOperationOptions } = require('./heCrypto');

test('resolveOperationOptions blocks ElGamal ADD', () => {
  assert.deepEqual(resolveOperationOptions('ElGamal'), ['MUL']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/utils/heCrypto.test.js`
Expected: FAIL because `resolveOperationOptions` is missing

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/utils/heCrypto.js
function resolveOperationOptions(encType) {
  return encType === 'ElGamal' ? ['MUL'] : ['ADD', 'MUL'];
}

module.exports = {
  buildPrivateKeyFilename,
  resolveOperationOptions
};
```

Then rewrite `frontend/src/views/DeliverySeller2.vue` to match this shape:

```vue
<el-table-column prop="transaction_id" label="交易ID" />
<el-table-column label="交付状态">
  <template #default="{ row }">
    <el-tag>{{ row.heStatusText }}</el-tag>
  </template>
</el-table-column>
<el-table-column label="交付方法">
  <template #default>HE</template>
</el-table-column>
<el-table-column label="数字合约">
  <template #default="{ row }">
    <el-button size="small" @click="viewContract(row)">查看合约</el-button>
  </template>
</el-table-column>
<el-table-column label="交付">
  <template #default="{ row }">
    <el-button size="small" type="primary" @click="openHeDelivery(row)">交付</el-button>
  </template>
</el-table-column>
```

Real implementation requirements inside the page:

- remove current non-HE delivery method options and VM upload logic
- keep transaction loading and contract viewing logic that still applies
- add HE public-key precheck before opening the delivery dialog
- add HE submit dialog state:
  - `selectedFile1`
  - `selectedFile2`
  - `encType`
  - `operation`
- call `/api/privacy/he/submit`
- poll or refresh `/api/privacy/he/status` after submission

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/utils/heCrypto.test.js`
Expected: PASS

Run: `npm run lint --prefix frontend`
Expected: PASS with the rewritten seller page

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/DeliverySeller2.vue frontend/src/utils/heDeliveryConfig.js frontend/src/utils/heCrypto.js frontend/src/utils/heCrypto.test.js
git commit -m "feat: rebuild seller delivery page for HE flow"
```

### Task 6: Rewrite the buyer delivery page for key upload and browser-side decrypt

**Files:**
- Modify: `frontend/src/views/DeliveryBuyer2.vue`
- Modify: `frontend/src/utils/heCrypto.js`
- Modify: `frontend/src/utils/heCsv.js`
- Modify: `frontend/src/utils/heCrypto.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/utils/heCrypto.test.js
const { shouldRequirePrivateKeyUpload } = require('./heCrypto');

test('buyers must provide a local private key file before HE result decryption', () => {
  assert.equal(shouldRequirePrivateKeyUpload({ deliveryMethod: 'he', status: 'COMPLETED' }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/utils/heCrypto.test.js`
Expected: FAIL because `shouldRequirePrivateKeyUpload` is missing

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/utils/heCrypto.js
function shouldRequirePrivateKeyUpload({ deliveryMethod, status }) {
  return deliveryMethod === 'he' && status === 'COMPLETED';
}

module.exports = {
  buildPrivateKeyFilename,
  resolveOperationOptions,
  shouldRequirePrivateKeyUpload
};
```

Then rewrite `frontend/src/views/DeliveryBuyer2.vue` around these page responsibilities:

```vue
<el-table-column prop="transaction_id" label="交易ID" />
<el-table-column label="交付状态">
  <template #default="{ row }">
    <el-tag>{{ row.heStatusText }}</el-tag>
  </template>
</el-table-column>
<el-table-column label="交付方法">
  <template #default>HE</template>
</el-table-column>
<el-table-column label="操作">
  <template #default="{ row }">
    <el-button size="small" @click="viewContract(row)">查看合约</el-button>
    <el-button size="small" type="primary" @click="uploadHePublicKeys(row)">上传公钥</el-button>
    <el-button size="small" type="success" @click="downloadAndDecrypt(row)">下载结果</el-button>
  </template>
</el-table-column>
```

Real implementation requirements inside the page:

- remove PRE / FL status and download branches
- load buyer-visible HE rows from a dedicated HE endpoint or from the existing result source after the backend starts returning HE-only payloads
- generate Paillier and ElGamal keypairs together on upload
- POST both public keys to `/api/privacy/he/public-keys`
- immediately download both private key JSON files locally
- on completed rows, download the encrypted result from `/api/privacy/he/result`
- prompt user to choose the correct local private key file
- decrypt in browser and export plaintext CSV

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/utils/heCrypto.test.js`
Expected: PASS

Run: `npm run lint --prefix frontend`
Expected: PASS with the rewritten buyer page

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/DeliveryBuyer2.vue frontend/src/utils/heCrypto.js frontend/src/utils/heCsv.js frontend/src/utils/heCrypto.test.js
git commit -m "feat: rebuild buyer delivery page for HE flow"
```

### Task 7: Wire end-to-end verification and remove stale front-end branches

**Files:**
- Modify: `frontend/src/views/DeliverySeller2.vue`
- Modify: `frontend/src/views/DeliveryBuyer2.vue`
- Modify: `backend/main.js`
- Modify: `docs/superpowers/specs/2026-05-30-he-integration-design.md`

- [ ] **Step 1: Write the failing test**

Add one final backend-focused test that protects duplicate PCP contract creation logic:

```js
// backend/tests/he-routes.test.js
const { shouldCreatePcpHeContract } = require('../pcp/he');

test('existing pcp_contract_id is reused instead of creating a second HE contract', () => {
  assert.equal(shouldCreatePcpHeContract({ pcpContractId: 'HE_TASK_1' }), false);
  assert.equal(shouldCreatePcpHeContract({ pcpContractId: '' }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/tests/he-routes.test.js`
Expected: FAIL because `shouldCreatePcpHeContract` is missing

- [ ] **Step 3: Write minimal implementation**

```js
// backend/pcp/he.js
function shouldCreatePcpHeContract({ pcpContractId }) {
  return !pcpContractId;
}

module.exports = {
  buildHeContractPayload,
  normalizeHeRecord,
  shouldCreatePcpHeContract
};
```

Then finish the cleanup and real verification wiring:

- remove dead PRE / FL-only UI branches from the two Vue pages
- ensure seller status text comes from PCP HE statuses, not old delivery counters
- ensure buyer page uses the HE result/decrypt flow only
- ensure `backend/main.js` returns consistent `{ success, item/items, message }` payloads for all new HE routes
- update the spec only if the implemented route names or payloads differ from the approved design

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/tests/he-constants.test.js backend/tests/he-client.test.js backend/tests/he-routes.test.js frontend/src/utils/heCrypto.test.js`
Expected: PASS

Run: `node --check backend/main.js`
Expected: PASS

Run: `npm run lint --prefix frontend`
Expected: PASS

Run: `npm run build --prefix frontend`
Expected: PASS

Manual verification checklist:

1. Apply `backend/sql/2026-05-30-he-delivery-contracts.sql` to the `r01` database.
2. Start the backend and frontend.
3. Open the seller delivery page and confirm only HE is shown.
4. Click seller HE delivery before buyer uploads keys and confirm the gating message appears.
5. Open the buyer page, upload keys, and confirm two private key files download locally.
6. Return to the seller page, submit two CSV files with Paillier + `ADD`, and confirm `pcp_contract_id` is persisted.
7. Refresh buyer status until the task reaches `COMPLETED`.
8. Download the result, choose the matching private key file, and confirm plaintext CSV export succeeds.

- [ ] **Step 5: Commit**

```bash
git add backend/pcp/he.js backend/tests/he-routes.test.js backend/main.js frontend/src/views/DeliverySeller2.vue frontend/src/views/DeliveryBuyer2.vue docs/superpowers/specs/2026-05-30-he-integration-design.md
git commit -m "feat: complete HE delivery integration"
```
