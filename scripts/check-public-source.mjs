#!/usr/bin/env node
// Public CI guard: inspect every tracked file, not only the modified paths.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const paths=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const bannedPath=[
 /(^|\/)(?:\.env|\.edinet-runtime|\.wrangler|node_modules)(?:\/|$|\.)/i,
 /^(?:data|public\/data|docs\/audits|backups|secrets)\//i,
 /\.(?:zip|csv|xlsx?|sqlite|db|pdf|png|jpe?g|webp|pem|p12|key)$/i
];
const bannedContents=[
 /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,})/,
 /(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16})/,
 /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
 /(?:\.workers\.dev|r2\.cloudflarestorage\.com|appgprj_)/i,
 /(?:EDINET_STATE_R2_SECRET_ACCESS_KEY|edinet-company-analysis-data)/,
 /(?:^|\n)\s*pull_request_target\s*:/,
 /(?:^|\n)\s*workflow_run\s*:/
];
let errors=[];
for(const path of paths){
 if(bannedPath.some(pattern=>pattern.test(path))){errors.push('forbidden path '+path);continue;}
 const bytes=readFileSync(path);
 if(bytes.length>300_000){errors.push('oversized file '+path);continue;}
 if(bytes.includes(0)){errors.push('binary file '+path);continue;}
 const content=bytes.toString('utf8');
 for(const pattern of bannedContents)if(pattern.test(content))errors.push('forbidden literal in '+path);
}
if(errors.length){for(const e of errors)console.error(e);process.exitCode=1;}
else console.log('Public-source audit passed: '+paths.length+' tracked text files; no data archives, secrets or privileged workflows.');
