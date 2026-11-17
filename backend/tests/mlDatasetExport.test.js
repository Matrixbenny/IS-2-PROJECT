const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  approvalFilePath,
  buildIncidentGroupIds,
  createCsv,
  parseApprovalManifest,
  parseArguments,
  resolveApprovedLabel
} = require('../../ml/scripts/export-reviewed-dataset');

test('approval manifest accepts only unique Mongo object ids', () => {
  const ids = parseApprovalManifest(
    '# approved after privacy and research review\r\n0123456789abcdef01234567\r\nabcdef0123456789abcdef01\r\n'
  );
  assert.deepStrictEqual(ids, ['0123456789abcdef01234567', 'abcdef0123456789abcdef01']);
  assert.throws(() => parseApprovalManifest('not-an-object-id'), /invalid report ID/);
  assert.throws(
    () => parseApprovalManifest('0123456789abcdef01234567\n0123456789abcdef01234567'),
    /duplicate report IDs/
  );
});

test('approval manifest must be stored in ignored local approved-data directory', () => {
  const manifestPath = path.resolve(
    __dirname,
    '..',
    '..',
    'ml',
    'data',
    'approved',
    'report_ids.txt'
  );
  assert.strictEqual(approvalFilePath(manifestPath), manifestPath);
  assert.throws(() => approvalFilePath(path.resolve(__dirname, 'reports.txt')), /must be stored inside/);
});

test('raw exports require an explicit sensitive-data confirmation', () => {
  assert.throws(
    () => parseArguments(['--approval-file', 'ml/data/approved/report_ids.txt', '--write-raw']),
    /requires both/
  );
  assert.throws(
    () => parseArguments(['--approval-file', 'ml/data/approved/report_ids.txt', '--confirm-sensitive-export']),
    /only valid/
  );
  assert.deepStrictEqual(
    parseArguments([
      '--approval-file',
      'ml/data/approved/report_ids.txt',
      '--write-raw',
      '--confirm-sensitive-export'
    ]),
    {
      approvalFile: 'ml/data/approved/report_ids.txt',
      writeRaw: true,
      confirmed: true
    }
  );
});

test('only finalized reviewed category outcomes are exportable', () => {
  assert.strictEqual(
    resolveApprovedLabel({
      categoryReview: {
        status: 'agreed',
        adjudicatedDecision: 'category',
        adjudicatedCategory: 'Bribery'
      }
    }),
    'Bribery'
  );
  assert.strictEqual(
    resolveApprovedLabel({
      categoryReview: {
        status: 'adjudicated',
        adjudicatedDecision: 'insufficient_information',
        adjudicatedCategory: null
      }
    }),
    null
  );
  assert.strictEqual(
    resolveApprovedLabel({
      categoryReview: { status: 'awaiting_second_review', adjudicatedCategory: 'Bribery' }
    }),
    null
  );
  assert.strictEqual(
    resolveApprovedLabel({
      categoryReview: { status: 'adjudicated', adjudicatedCategory: 'Invalid' }
    }),
    null
  );
});

test('incident-linked reports receive one keyed pseudonymous group id', () => {
  const reports = [
    { _id: 'report-a', relatedCaseLinks: ['report-b'] },
    { _id: 'report-b', relatedCaseLinks: [] },
    { _id: 'report-c', relatedCaseLinks: [] }
  ];
  const groups = buildIncidentGroupIds(reports, 'test-secret');
  assert.strictEqual(groups.get('report-a'), groups.get('report-b'));
  assert.notStrictEqual(groups.get('report-a'), groups.get('report-c'));
  assert.match(groups.get('report-a'), /^incident-[a-f\d]{24}$/);
  assert.notStrictEqual(
    groups.get('report-a'),
    buildIncidentGroupIds(reports, 'different-secret').get('report-a')
  );
});

test('CSV writer quotes narrative fields and does not append report identifiers', () => {
  const csv = createCsv([{
    text: 'A report, with "quoted" text\nand another line.',
    label: 'Bribery',
    group_id: 'incident-a'
  }]);
  assert.match(csv, /"A report, with ""quoted"" text\nand another line\."/);
  assert.match(csv, /"Bribery","incident-a"/);
  assert.doesNotMatch(csv, /report-id/);
});
