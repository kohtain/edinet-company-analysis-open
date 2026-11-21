#!/usr/bin/env node
// Offline-only EDINET code-list conversion. Never downloads or deploys anything.
// Prerequisites: Node 22+ and the system unzip command.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {buildEdinetCompanyDirectory,compareEdinetDirectory,edinetCodeListSnapshot} from '../lib/edinet-company-directory.mjs';
import {issuerDirectoryClientPayload,validateIssuerDirectoryManifest,EDINET_DIRECTORY_POINTER} from '../lib/edinet-directory-release.mjs';

const args={};
for(const arg of process.argv.slice(2)){
 const m=/^--(zip|snapshot|compare|expected-sha256)=(.+)$/.exec(arg);
 if(!m||Object.hasOwn(args,m[1]))throw Error('Invalid or duplicate argument');
 args[m[1]]=m[2];
}
if(!args.zip||!args.snapshot)throw Error(
 'Usage: npm run build:directory -- --zip=/path/to/Edinetcode.zip --snapshot=auto [--compare=/path/to/local-master.json] [--expected-sha256=HEX]'
);
const input=resolve(args.zip),root=resolve('.edinet-runtime');
const zip=readFileSync(input);
if(zip.length<100||zip.length>2_000_000)throw Error('EDINET ZIP has an unexpected size');
const zipSha256=createHash('sha256').update(zip).digest('hex');
if(args['expected-sha256']&&zipSha256!==args['expected-sha256'])throw Error('EDINET ZIP fingerprint mismatch');
// We only extract the expected CSV. No ZIP entries are written to disk.
const entries=execFileSync('unzip',['-Z','-1',input],{
 encoding:'utf8',timeout:15000,maxBuffer:100_000
}).split(/\r?\n/).filter(Boolean);
const names=entries.filter(p=>p.split('/').at(-1)==='EdinetcodeDlInfo.csv');
if(names.length!==1||names[0].includes('\\')||names[0].split('/').includes('..'))
 throw Error('EDINET ZIP expected a unique code-list CSV');
const contents=execFileSync('unzip',['-p',input,names[0]],{timeout:25000,maxBuffer:10_000_001});
if(contents.length<100||contents.length>10_000_000)throw Error('EDINET CSV has an unexpected size');
const csv=new TextDecoder('shift_jis',{fatal:true}).decode(contents);
const snapshotDate=args.snapshot==='auto'?edinetCodeListSnapshot(csv):args.snapshot;
const directory=buildEdinetCompanyDirectory(csv,{snapshotDate,sourceZipSha256:zipSha256});
const previousMaster=args.compare?JSON.parse(readFileSync(args.compare,'utf8')):null;
const comparison=previousMaster?compareEdinetDirectory(directory,previousMaster):null;
const served=JSON.stringify(issuerDirectoryClientPayload(directory))+'\n';
const dataSha256=createHash('sha256').update(served).digest('hex');
const manifest=validateIssuerDirectoryManifest({
 schemaVersion:1,source:directory.source,snapshotDate,
 sourceZipSha256:zipSha256,dataSha256,
 objectKey:'directory/releases/'+dataSha256+'.json',
 count:directory.companies.length,bytes:Buffer.byteLength(served),
});
mkdirSync(root,{recursive:true});
const save=(name,text)=>writeFileSync(resolve(root,name),text,{mode:0o600});
save('edinet-company-directory-audit.json',JSON.stringify({directory,comparison},null,2)+'\n');
save('directory-release-'+dataSha256+'.json',served);
save('directory-active-manifest.json',JSON.stringify(manifest,null,2)+'\n');
// Deliberately NO uploader and NO pointer activation in this repository.
console.log(JSON.stringify({
 snapshotDate,sourceZipSha256:zipSha256,dataSha256,
 count:directory.companies.length,
 comparison:comparison&&{
  matchingCodes:comparison.matchingCodes,
  onlyInEdinet:comparison.onlyInEdinet.length,
  onlyInPriorMaster:comparison.onlyInPriorMaster.length
 },
 output:root,pointerKey:EDINET_DIRECTORY_POINTER,productionChanged:false
}));
