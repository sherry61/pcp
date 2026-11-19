const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCompositeCsv,
  mergeGroupedCsv,
  splitFilesIntoSlots,
  mergePartyCsvFiles,
  computeSamples
} = require('../mpc_audit/calculator');
const { buildMpcCompositeEvidence } = require('../mpc_audit/evidence');
const { mapHubStatus } = require('../mpc_audit/routes');
const { JOB_STATUS } = require('../mpc_audit/constants');

test('parseCompositeCsv supports per-row coefficient and computes (a+b)*c', () => {
  const csv = [
    'user_id,a,b,c',
    'u1,100,23,5',
    'u2,200,40,7',
    ''
  ].join('\n');

  const byUser = parseCompositeCsv(csv);
  const samples = computeSamples(byUser, { threshold: 1000n });

  assert.equal(samples.length, 2);
  assert.deepEqual(samples[0], {
    row_index: 1,
    user_id: 'u1',
    a: '100',
    b: '23',
    c: '5',
    y: '615',
    qualified: false
  });
  assert.deepEqual(samples[1], {
    row_index: 2,
    user_id: 'u2',
    a: '200',
    b: '40',
    c: '7',
    y: '1680',
    qualified: true
  });
});

test('parseCompositeCsv falls back to the order coefficient when c column is absent', () => {
  const csv = ['user_id,a,b', 'u1,1,2', ''].join('\n');
  const byUser = parseCompositeCsv(csv, { defaultCoefficient: 10n });
  const samples = computeSamples(byUser);
  assert.equal(samples[0].y, '30');
  assert.equal(samples[0].qualified, null);
});

test('mergeGroupedCsv sums each group per user and applies the coefficient', () => {
  const byUser = mergeGroupedCsv({
    aFiles: [
      { content: 'user_id,a\nu1,10\nu2,5\n' },
      { content: 'user_id,a\nu1,20\n' }
    ],
    bFiles: [{ content: 'user_id,b\nu1,3\n' }],
    coefficient: 2n
  });
  const samples = computeSamples(byUser);
  assert.deepEqual(
    samples.map((item) => [item.user_id, item.a, item.b, item.y]),
    [['u1', '30', '3', '66'], ['u2', '5', '0', '10']]
  );
});

test('splitFilesIntoSlots puts all but the last file into A and the last into B', () => {
  assert.deepEqual(splitFilesIntoSlots([]), { aFiles: [], bFiles: [] });
  assert.deepEqual(splitFilesIntoSlots(['f1']), { aFiles: ['f1'], bFiles: [] });
  assert.deepEqual(splitFilesIntoSlots(['f1', 'f2', 'f3']), {
    aFiles: ['f1', 'f2'],
    bFiles: ['f3']
  });
});

test('mergePartyCsvFiles merges N parties into the two audit slots', () => {
  const byUser = mergePartyCsvFiles({
    parties: [
      { id: 'bank', slot: 'A' },
      { id: 'insurer', slot: 'B' },
      { id: 'bureau', slot: 'A' }
    ],
    files: [
      { fieldname: 'party_bank', content: 'user_id,value\nu1,100\nu2,200\n' },
      { fieldname: 'party_insurer', content: 'user_id,value\nu1,23\nu2,40\n' },
      { fieldname: 'party_bureau', content: 'user_id,value\nu1,77\n' }
    ],
    coefficient: 1n
  });
  const samples = computeSamples(byUser, { threshold: 230n });
  assert.deepEqual(
    samples.map((item) => [item.user_id, item.a, item.b, item.c, item.y, item.qualified]),
    [
      ['u1', '177', '23', '1', '200', false],
      ['u2', '200', '40', '1', '240', true]
    ]
  );
});

test('mergePartyCsvFiles rejects files from unregistered parties', () => {
  assert.throws(
    () => mergePartyCsvFiles({
      parties: [{ id: 'bank', slot: 'A' }],
      files: [{ fieldname: 'party_unknown', content: 'user_id,value\nu1,1\n' }],
      coefficient: 1n
    }),
    /未在 parties 中登记/
  );
});

test('parseCompositeCsv rejects negative and non-integer values', () => {
  assert.throws(
    () => parseCompositeCsv('user_id,a,b\n u1,-1,2\n'),
    /必须是非负整数/
  );
  assert.throws(
    () => parseCompositeCsv('user_id,a,b\n u1,1.5,2\n'),
    /必须是非负整数/
  );
});

test('buildMpcCompositeEvidence emits three seller inputs per row', () => {
  const evidence = buildMpcCompositeEvidence({
    transactionId: 'TX1',
    businessContractId: 'CONTRACT_1',
    sellerId: 'seller',
    buyerId: 'buyer',
    samples: [{ row_index: 1, a: '100', b: '23', c: '5', y: '615' }]
  });

  assert.equal(evidence.schema_version, 'he-evidence-v1');
  assert.equal(evidence.method, 'MPC');
  assert.equal(evidence.he_compute_mode, 'MPC_COMPOSITE');
  assert.deepEqual(evidence.seller_ids, ['seller-A', 'seller-B', 'buyer-C']);
  assert.equal(evidence.samples.length, 1);
  assert.deepEqual(
    evidence.samples[0].seller_inputs.map((item) => item.cipher),
    ['mpc1.100', 'mpc1.23', 'mpc1.5']
  );
  assert.equal(evidence.samples[0].PCC_output, 'mpc1.615');
});

test('mapHubStatus maps consensus to local status', () => {
  assert.equal(
    mapHubStatus({ consensus_status: 'REACHED', consensus_result: 'PASSED' }),
    JOB_STATUS.AUDIT_PASSED
  );
  assert.equal(
    mapHubStatus({ consensus_status: 'REACHED', consensus_result: 'FAILED' }),
    JOB_STATUS.AUDIT_FAILED
  );
  assert.equal(
    mapHubStatus({ consensus_status: 'TIMEOUT' }),
    JOB_STATUS.AUDIT_TIMEOUT
  );
  assert.equal(
    mapHubStatus({ consensus_status: 'COLLECTING' }),
    JOB_STATUS.AUDIT_PENDING
  );
});
