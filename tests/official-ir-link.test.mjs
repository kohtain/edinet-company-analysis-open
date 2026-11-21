import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOfficialIrUrl} from '../lib/official-ir-link.mjs';

test('existing issuer IR website is an optional secure external link', () => {
 assert.equal(normalizeOfficialIrUrl('https://example.co.jp/ir/'), 'https://example.co.jp/ir/');
 assert.equal(normalizeOfficialIrUrl('https://example.co.jp/ir/?lang=ja'), 'https://example.co.jp/ir/?lang=ja');
 assert.equal(normalizeOfficialIrUrl(undefined), null);
 assert.equal(normalizeOfficialIrUrl(''), null);
});
test('untrusted company metadata never creates an executable or credential-bearing URL', () => {
 for (const candidate of [
  'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
  'http://example.co.jp/ir/', '//example.co.jp/ir/',
  'https://user:pass@example.co.jp/ir', 'https://localhost/ir/',
  'https://127.0.0.1/ir/', 'https://[::1]/ir/', 'https://intranet/ir/',
  'https://example.co.jp:8443/ir', 'https://example.co.jp/ir#fragment',
  ' https://example.co.jp/ir/', 'https://example.co.jp/ir/ ',
  'https://example.co.jp/'+'x'.repeat(2049)
 ]) assert.equal(normalizeOfficialIrUrl(candidate),null,candidate.slice(0,80));
});
