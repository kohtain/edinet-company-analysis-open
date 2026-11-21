import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparisonSelection,comparisonWarnings} from '../lib/comparison.mjs';
import {reconcileDuplicateEdinetDocument} from '../lib/edinet-index-reconcile.mjs';

test('comparison selection deduplicates and caps issuer inputs without inventing calendar periods',()=>{
 const p=new URLSearchParams({compare:'7203,7203,8267,invalid,4751,6758,123A,9999',
  compareUnit:'百万円',compareYear:'2026-03-31'});
 const s=comparisonSelection(p,'');
 assert.deepEqual(s.codes,['7203','8267','4751','6758','123A']);
 assert.equal(s.unit,'百万円');assert.equal(s.year,'2026-03-31');
 assert.equal(comparisonSelection(new URLSearchParams({compareYear:'2026-02-30'}),'7203').year,'');
});
test('warnings expose mismatched filing scope, periods, accounting tags and bases',()=>{
 const fact=(scope,tag,end)=>({status:'reported',scope,tag,unit:'円',
  sourceId:'public-source',period:{start:'2025-04-01',end}});
 const flags=comparisonWarnings([
  {fact:fact('連結','sales','2026-03-31')},
  {fact:fact('個別','revenue','2026-06-30')}
 ],[{standard:'IFRS'},{standard:'日本基準'}]);
 assert.ok(flags.some(s=>s.includes('期間')));
 assert.ok(flags.some(s=>s.includes('連結・個別')));
 assert.ok(flags.some(s=>s.includes('会計基準')));
 assert.ok(flags.some(s=>s.includes('タグ')));
});
test('EDINET index deduplication permits presentation-only differences, but not material divergence',()=>{
 const a={docID:'S100AAAA',docTypeCode:'120',periodEnd:'2026-03-31',
  submitDateTime:'2026-06-30',csvFlag:'1',seqNumber:2};
 const b={...a,seqNumber:3,docDescription:'訂正済み表示'};
 assert.equal(reconcileDuplicateEdinetDocument(a,b),a);
 assert.throws(()=>reconcileDuplicateEdinetDocument(a,{...a,periodEnd:'2025-03-31'}),/inconsistent_document/);
 assert.throws(()=>reconcileDuplicateEdinetDocument(a,{...a,docID:'S100BBBB'}),/conflicting_edinet_document_identity/);
});
