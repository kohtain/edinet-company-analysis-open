#!/usr/bin/env node
// Offline audit of the newest annual filing for a caller-supplied company universe.
// No EDINET API calls, credential loading, network access or Cloudflare writes.
// Do not assume input-index completeness or unverified issuer-code equivalence.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,extname,resolve} from 'node:path';
import {buildLatestReportCoverage} from '../lib/latest-report-policy.mjs';

const args={};
for(const arg of process.argv.slice(2)){
 const m=/^--(input|companies|output)=(.+)$/.exec(arg);
 if(!m||Object.hasOwn(args,m[1]))throw Error('invalid_audit_arguments');
 args[m[1]]=m[2];
}
if(!args.input||!args.companies)throw Error(
 'Usage: node scripts/audit-latest-report.mjs --input=FILE --companies=FILE [--output=FILE]'
);
function load(file){
 const raw=readFileSync(resolve(file),'utf8');
 if(extname(file)==='.jsonl')return raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const parsed=JSON.parse(raw);
 return Array.isArray(parsed)?parsed:parsed.documents;
}
const docs=load(args.input),companies=load(args.companies);
if(!Array.isArray(docs)||!Array.isArray(companies))throw Error('invalid_audit_input');
const codes=companies.map(c=>typeof c==='string'?c:c?.code);
if(codes.some(c=>typeof c!=='string'||!/^\d{3}[0-9A-Z]$/.test(c))||
 new Set(codes).size!==codes.length)throw Error('invalid_or_duplicate_company_code');
const report=buildLatestReportCoverage(docs,codes);
// Historical IPO filings that have no security code require an independently
// verified EDINET issuer map, not a guessed company-name match. This tool never
// claims that its scoped document input is a complete legal-filing index.
const output=resolve(args.output??'.edinet-runtime/latest-report-audit.json');
mkdirSync(dirname(output),{recursive:true});
const rows=report.rows.map(({code,status,base,corrections,baseCsvDocId,reasons,publishable})=>({
 code,status,latestDocId:base?.docId??null,latestPeriodEnd:base?.periodEnd??null,
 baseCsvDocId,correctionDocIds:corrections.map(c=>c.docId),reasons,publishable
}));
writeFileSync(output,JSON.stringify({
 generatedAt:new Date().toISOString(),
 indexCoverageVerified:false,
 issuerIdentityVerified:false,
 total:report.total,counts:report.counts,companies:rows
},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({total:report.total,counts:report.counts,output}));
