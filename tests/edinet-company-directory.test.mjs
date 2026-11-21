import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEdinetCompanyDirectory,compareEdinetDirectory,edinetCodeListSnapshot} from '../lib/edinet-company-directory.mjs';

const snapshotDate = '2026-11-21', sourceZipSha256 = 'a'.repeat(64);
const columns = ['ＥＤＩＮＥＴコード','提出者種別','上場区分','連結の有無','資本金','決算日',
 '提出者名','提出者名（英字）','提出者名（ヨミ）','所在地','提出者業種','証券コード'];
const row = (edinetCode, code, name='上場法人', issuerType='内国法人・組合', listed='上場', industry='機械') =>
 [edinetCode,issuerType,listed,'有','500','03-31',name,'Example Corp','','東京都',industry,code];
const quote = s=>'"'+String(s).replaceAll('"','""')+'"';
const csv = (rows,{declared=rows.length,headers=columns,date='2026年11月21日現在'}={}) =>
 ['ダウンロード実行日,'+quote(date)+',件数,'+quote(declared+'件'),
  headers.map(quote).join(','),...rows.map(a=>a.map(quote).join(','))].join('\r\n')+'\r\n';
const parse = text => buildEdinetCompanyDirectory(text,{snapshotDate,sourceZipSha256});

test('EDINET official code list becomes a traceable domestic-issuer directory, with no assumed JPX market',()=>{
 const result=parse('\uFEFF'+csv([
  row('E12345','72030','株式会社トヨタ,「事例」'),
  row('E54321','542A0','新興株式会社','内国法人・組合','上場','情報・通信業'),
  row('E22222','82670','非上場','内国法人・組合','非上場'),
  row('E33333','11110','外国法人','外国法人・組合','上場'),
  row('E44444','00000','特殊証券'),
 ]));
 assert.equal(result.snapshotDate,snapshotDate);
 assert.equal(result.sourceZipSha256,sourceZipSha256);
 assert.equal(result.sourceRows,5);
 assert.deepEqual(result.companies.map(c=>c.code),['542A','7203']);
 assert.deepEqual(result.excluded,{notListed:1,notDomestic:1,noFourCharacterSecurityCode:1});
 assert.equal(result.companies[0].edinetCode,'E54321');
 assert.equal(result.companies[1].name,'株式会社トヨタ,「事例」');
 assert.equal(result.companies[1].industry,'機械');
 assert.equal(result.companies[1].market,'');
 assert.equal(result.companies[1].industrySource,'edinet_code_list');
 assert.ok(result.source.includes('disclosure2dl.edinet-fsa.go.jp'));
});

test('reconciliation identifies both asymmetric coverage gaps without claiming delisting',()=>{
 const data=parse(csv([row('E11111','72030'),row('E22222','542A0')]));
 const diff=compareEdinetDirectory(data,[{code:'7203',market:'プライム'},{code:'8267',market:'スタンダード'}]);
 assert.deepEqual([diff.matchingCodes,diff.onlyInEdinet,diff.onlyInPriorMaster,diff.missingMarket],
  [1,['542A'],['8267'],2]);
 assert.match(diff.marketNote,/JPX/);
 assert.match(diff.industryNote,/different classifications/);
});

test('never treats listing status as Prime/Standard/Growth or fills missing fields from a different taxonomy',()=>{
 const data=parse(csv([row('E11111','72030','企業A','内国法人・組合','上場','サービス業')]));
 assert.equal(data.companies[0].market,'');
 assert.equal(data.companies[0].industry,'サービス業');
 assert.equal(data.companies[0].marketSource,'not_available_in_edinet_code_list');
});

test('rejects ambiguous identities rather than silently overriding a company',()=>{
 assert.throws(()=>parse(csv([row('E11111','72030'),row('E22222','72030')])),/duplicate_identity/);
 assert.throws(()=>parse(csv([row('E11111','72030'),row('E11111','82670')])),/duplicate_identity/);
 assert.throws(()=>compareEdinetDirectory({companies:[{code:'7203'}]},[{code:'7203'},{code:'7203'}]),/duplicate_code/);
});

test('rejects malformed source, missing columns, metadata errors and invalid issuer labels',()=>{
 assert.throws(()=>parse(csv([row('E11111','72030')],{declared:2})),/row_count_mismatch/);
 assert.throws(()=>parse(csv([row('E11111','72030')],{date:'2026年11月20日現在'})),/metadata_mismatch/);
 assert.throws(()=>parse(csv([row('E11111','72030')],{headers:columns.map(s=>s==='提出者業種'?'異なる名称':s)})),/missing_or_duplicate_column/);
 assert.throws(()=>parse(csv([row('E11111','72030','')])),/invalid_company_metadata/);
 assert.throws(()=>parse(csv([row('E11111','72030').slice(0,-1)])),/row_width_mismatch/);
 assert.throws(()=>buildEdinetCompanyDirectory(csv([row('E11111','72030')]),{snapshotDate:'2026-02-30',sourceZipSha256}),/invalid_source_metadata/);
 assert.throws(()=>buildEdinetCompanyDirectory(csv([row('E11111','72030')]),{snapshotDate,sourceZipSha256:'bad'}),/invalid_source_metadata/);
});

test('auto-detected official snapshot is sourced from CSV metadata, never from runtime date',()=>{
 const valid=csv([row('E11111','72030')],{date:'2026年11月20日現在'});
 assert.equal(edinetCodeListSnapshot(valid),'2026-11-20');
 assert.throws(()=>edinetCodeListSnapshot(csv([row('E11111','72030')],{date:'2026年02月30日現在'})),/invalid_source_date/);
 assert.throws(()=>edinetCodeListSnapshot('not a metadata header'),/missing_source_date/);
});
