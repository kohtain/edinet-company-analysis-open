import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTsv, selectFact } from '../lib/facts.mjs';

const header = '要素ID\t項目名\tコンテキストID\t相対年度\t連結・個別\t期間・時点\tユニットID\t値\r\n';
const line = 'x:Revenue\t売上\tCurrentYearDuration\t当期\t連結\t期間\tJPY\t"12\t3"\r\n';
const query = { elementIds: ['x:Revenue'], contextId: 'CurrentYearDuration', scope: '連結' };
test('quoted fields and context are preserved', () => {
  const rows = parseTsv(header + line);
  assert.equal(selectFact(rows, query).fact['値'], '12\t3');
  assert.equal(selectFact(rows, { ...query, scope: '個別' }).status, 'not_found');
});
test('duplicate facts cannot be silently selected', () => {
  assert.equal(selectFact(parseTsv(header + line + line), query).status, 'ambiguous');
});
test('invalid input fails closed', () => {
  assert.throws(() => parseTsv('unexpected\tcolumns\n1\t2'));
  assert.throws(() => parseTsv(header + '"unterminated'));
});
