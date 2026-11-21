import test from 'node:test';
import assert from 'node:assert/strict';
import {issuerDirectoryClientPayload,validateIssuerDirectoryManifest,readIssuerDirectoryRelease,
 EDINET_DIRECTORY_POINTER} from '../lib/edinet-directory-release.mjs';
const hash='a'.repeat(64),other='b'.repeat(64);
const source='https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip';
const company=(code,name)=>({code,name,english:'Example Corp',industry:'機械',edinetCode:code==='7203'?'E12345':'E54321',
 market:'',marketSource:'not_available_in_edinet_code_list',industrySource:'edinet_code_list'});
const directory={schemaVersion:1,source,snapshotDate:'2026-11-21',sourceZipSha256:hash,
 companies:[company('542A','企業A'),company('7203','企業B')]};
const manifest={schemaVersion:1,source,snapshotDate:'2026-11-21',sourceZipSha256:hash,
 dataSha256:other,objectKey:'directory/releases/'+other+'.json',count:2,bytes:128};

test('EDINET client directory retains source-provenance and does not invent TSE categories',()=>{
 const rows=issuerDirectoryClientPayload(directory);
 assert.deepEqual(rows.map(x=>x.code),['542A','7203']);
 assert.equal(rows[0].market,'');
 assert.equal(rows[0].marketSource,'not_available_in_edinet_code_list');
 assert.equal(rows[0].industrySource,'edinet_code_list');
 assert.equal(rows[0].edinetCode,'E54321');
 assert.ok(!JSON.stringify(rows).includes('JPX'));
});
test('refuses accidental code duplicates and unverified JPX market labels',()=>{
 assert.throws(()=>issuerDirectoryClientPayload({...directory,companies:[company('7203','A'),company('7203','B')]}),/invalid_company/);
 assert.throws(()=>issuerDirectoryClientPayload({...directory,companies:[{...company('7203','A'),market:'プライム'}]}),/invalid_company/);
 assert.throws(()=>issuerDirectoryClientPayload({...directory,source:'other'}),/invalid_source/);
});
test('R2 manifests cannot point to arbitrary or oversized objects',()=>{
 assert.equal(validateIssuerDirectoryManifest(manifest).objectKey,manifest.objectKey);
 for (const bad of [
  {...manifest,objectKey:'secrets/private.json'},
  {...manifest,objectKey:'directory/releases/../../secrets.json'},
  {...manifest,bytes:3_000_001},
  {...manifest,count:0},
  {...manifest,source:'not-official'},
 ]) assert.throws(()=>validateIssuerDirectoryManifest(bad),/invalid_manifest/);
});
test('R2 reader only dereferences validated active pointer and immutable release',async()=>{
 const calls=[];
 const storage={get:async k=>{
  calls.push(k);
  if(k===EDINET_DIRECTORY_POINTER)return {size:200,json:async()=>manifest};
  if(k===manifest.objectKey)return {size:128,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('[]'));c.close();}})};
  throw Error('unexpected_key');
 }};
 const result=await readIssuerDirectoryRelease(storage);
 assert.equal(result.manifest.count,2);
 assert.deepEqual(calls,[EDINET_DIRECTORY_POINTER,manifest.objectKey]);
});
test('missing/corrupt R2 pointer or release is fail-closed, with no arbitrary reads',async()=>{
 await assert.rejects(readIssuerDirectoryRelease(null),/storage_unavailable/);
 await assert.rejects(readIssuerDirectoryRelease({get:async()=>null}),/pointer_unavailable/);
 const calls=[];
 const corrupted={get:async key=>{calls.push(key);return {size:300,json:async()=>({...manifest,objectKey:'private/secret.json'})};}};
 await assert.rejects(readIssuerDirectoryRelease(corrupted),/invalid_manifest/);
 assert.deepEqual(calls,[EDINET_DIRECTORY_POINTER]);
 const partial={get:async key=>key===EDINET_DIRECTORY_POINTER?{size:300,json:async()=>manifest}:{size:127,body:new ReadableStream()}};
 await assert.rejects(readIssuerDirectoryRelease(partial),/wrong_size/);
});
