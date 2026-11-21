import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDay, latestReport, linkedCorrections } from '../lib/documents.mjs';

test('filters withdrawn and unrelated filings and selects period before submission date', async () => {
  const docs = [
    { secCode: '72030', docTypeCode: '120', withdrawalStatus: '0', disclosureStatus: '0', periodEnd: '2025-03-31', submitDateTime: '2026-06-01' },
    { secCode: '72030', docTypeCode: '120', withdrawalStatus: '0', disclosureStatus: '0', periodEnd: '2026-03-31', submitDateTime: '2026-05-01' },
    { secCode: '72030', docTypeCode: '120', withdrawalStatus: '1', disclosureStatus: '0', periodEnd: '2027-03-31', submitDateTime: '2027-06-01' },
  ];
  const results = await listDay('2026-06-01', 'secret', async () => ({ ok: true, json: async () => ({ metadata: { status: '200' }, results: docs }) }));
  assert.equal(results.length, 2);
  assert.equal(latestReport(results, '7203').periodEnd, '2026-03-31');
});
test('links corrections by parent, not by a missing period or submission date', () => {
  const base={secCode:'82670',docTypeCode:'120',docID:'A'};
  const correction={secCode:'82670',docTypeCode:'130',docID:'B',parentDocID:'A',periodEnd:null,submitDateTime:'2026-07-21'};
  const other={...correction,docID:'C',parentDocID:'old'};
  assert.deepEqual(linkedCorrections([base,correction,other],'8267','A').map(d=>d.docID),['B']);
});
test('sanitizes errors and distinguishes upstream failure from empty results', async () => {
  await assert.rejects(listDay('2026-01-01', 'secret', async () => { throw new Error('secret'); }), e => !e.message.includes('secret'));
  await assert.rejects(listDay('2026-01-01', 'secret', async () => ({ok: true, json: async () => ({metadata: {status: '403'}})})));
});
