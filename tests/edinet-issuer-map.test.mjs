import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuerMap } from '../lib/edinet-issuer-map.mjs';

const snapshotDate = '2026-11-01';
const sourceZipSha256 = '9860f4582f637ce9605606f8a889cc8d82052b0ef7252aec57938339a02c2c20';
const headers = ['EDINETコード', '上場区分', '証券コード', '提出者名'];
const quote = value => `"${String(value).replaceAll('"', '""')}"`;
const makeCsv = (rows, { date = '2026年11月01日現在', declared = rows.length,
  columns = headers, newline = '\r\n', bom = false, finalNewline = true } = {}) => {
  const records = [
    ['ダウンロード実行日', date, '件数', `${declared}件`],
    columns,
    ...rows,
  ].map(record => record.map(quote).join(','));
  return `${bom ? '\uFEFF' : ''}${records.join(newline)}${finalNewline ? newline : ''}`;
};

const row = (edinetCode, listing, securityCode, name = '公開名称') =>
  [edinetCode, listing, securityCode, name];

test('parses quoted commas, embedded newlines, escaped quotes, BOM and blank lines; emits only issuer-code mappings', () => {
  const csv = makeCsv([
    row('E12345', '上場', '72030', '名称, "引用"\r\n次の行'),
    row('E54321', '非上場', '82670', '非上場の行'),
  ], { columns: ['ＥＤＩＮＥＴコード', '上場区分', '証券コード', '提出者名'], bom: true }) + '\r\n';
  const result = buildIssuerMap(csv, ['8267', '7203'], { snapshotDate, sourceZipSha256 });
  assert.deepEqual(result, {
    schemaVersion: 1,
    source: 'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip',
    snapshotDate,
    sourceZipSha256,
    masterCodes: ['7203', '8267'],
    entries: { '7203': 'E12345' },
    unmappedCodes: ['8267'],
  });
  assert.doesNotMatch(JSON.stringify(result), /公開名称|引用|次の行|非上場の行/);
});

test('maps A-class four-character master codes and excludes 00000 outside the master and nonzero-ending five-digit securities', () => {
  const csv = makeCsv([
    row('E11111', '上場', '542A0'),
    row('E22222', '上場', '00000'),
    row('E33333', '上場', '12345'),
    row('E44444', '上場', '72030'),
  ]);
  const result = buildIssuerMap(csv, ['542A', '7203'], { snapshotDate, sourceZipSha256 });
  assert.deepEqual(result.entries, { '542A': 'E11111', '7203': 'E44444' });
  assert.deepEqual(result.unmappedCodes, []);
});

test('rejects duplicate security codes, including identical repeated pairs', () => {
  const repeatedPair = makeCsv([row('E12345', '上場', '72030'), row('E12345', '上場', '72030')]);
  assert.throws(() => buildIssuerMap(repeatedPair, ['7203'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_duplicate_security_code/);
  const conflictingIssuer = makeCsv([row('E12345', '上場', '72030'), row('E54321', '上場', '72030')]);
  assert.throws(() => buildIssuerMap(conflictingIssuer, ['7203'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_duplicate_security_code/);
});

test('rejects one EDINET code repeated under different security codes', () => {
  const csv = makeCsv([row('E12345', '上場', '72030'), row('E12345', '上場', '82670')]);
  assert.throws(() => buildIssuerMap(csv, ['7203', '8267'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_duplicate_edinet_code/);
});

test('rejects malformed CSV, missing or ambiguous required columns, and row-width mismatch', () => {
  assert.throws(() => buildIssuerMap('"unterminated', ['7203'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_unclosed_csv_quote/);
  const missing = makeCsv([['E12345', '上場', '72030']], { columns: ['EDINETコード', '上場区分', '提出者名'] });
  assert.throws(() => buildIssuerMap(missing, ['7203'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_missing_or_ambiguous_header/);
  const ambiguous = makeCsv([row('E12345', '上場', '72030')], {
    columns: ['EDINETコード', '上場区分', '証券コード', '証券コード'],
  });
  assert.throws(() => buildIssuerMap(ambiguous, ['7203'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_missing_or_ambiguous_header/);
  const wrongWidth = makeCsv([['E12345', '上場', '72030']], { columns: headers });
  assert.throws(() => buildIssuerMap(wrongWidth, ['7203'], { snapshotDate, sourceZipSha256 }),
    /issuer_map_csv_row_width_mismatch/);
});

test('rejects CSV metadata date/count mismatches and invalid snapshot or master metadata', () => {
  const validRow = row('E12345', '上場', '72030');
  assert.throws(() => buildIssuerMap(makeCsv([validRow], { date: '2026年10月31日現在' }), ['7203'],
    { snapshotDate, sourceZipSha256 }), /issuer_map_metadata_mismatch/);
  assert.throws(() => buildIssuerMap(makeCsv([validRow], { declared: 2 }), ['7203'],
    { snapshotDate, sourceZipSha256 }), /issuer_map_row_count_mismatch/);
  assert.throws(() => buildIssuerMap(makeCsv([validRow]), ['7203'],
    { snapshotDate: '2026-02-30', sourceZipSha256 }), /issuer_map_invalid_snapshot_metadata/);
  assert.throws(() => buildIssuerMap(makeCsv([validRow]), ['7203'],
    { snapshotDate, sourceZipSha256: 'not-a-sha256' }), /issuer_map_invalid_snapshot_metadata/);
  for (const codes of [[], ['7203', '7203'], ['720'], ['72030']]) {
    assert.throws(() => buildIssuerMap(makeCsv([validRow]), codes, { snapshotDate, sourceZipSha256 }),
      /issuer_map_invalid_master_codes/);
  }
});
