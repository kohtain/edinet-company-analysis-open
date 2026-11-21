import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchCompanies,formatMoney,moneyUnit} from '../lib/research.mjs';
test('company search handles full width codes, kana, English, multiple tokens and filters',()=>{
 const companies=[{code:'7203',name:'トヨタ自動車',english:'Toyota Motor Corporation',market:'プライム',industry:'輸送用機器'},{code:'7201',name:'日産自動車',english:'Nissan Motor',market:'プライム',industry:'輸送用機器'}];
 assert.equal(searchCompanies(companies,'７２０３')[0].code,'7203');
 assert.equal(searchCompanies(companies,'とよた')[0].code,'7203');
 assert.equal(searchCompanies(companies,'TOYOTA Motor')[0].code,'7203');
 assert.equal(searchCompanies(companies,'自動車').length,2);
 assert.equal(searchCompanies(companies,'Toyota','グロース').length,0);
});
test('integer money display rounds exact integers without losing large-number precision',()=>{
 assert.equal(formatMoney('150000000'),'2');assert.equal(formatMoney('-150000000'),'-2');
 assert.equal(formatMoney('149999999'),'1');assert.equal(formatMoney('999500000','百万円'),'1,000');
 assert.equal(formatMoney('invalid'),'—');
 assert.equal(moneyUnit([{'単位':'円','コンテキストID':'CurrentYearDuration','要素ID':'jppfs_cor:NetSales','値':'100000000000'}]),'10億円');
 assert.equal(moneyUnit([{'単位':'円','コンテキストID':'CurrentYearDuration','要素ID':'jppfs_cor:NetSales','値':'99999999999'}]),'百万円');
});
