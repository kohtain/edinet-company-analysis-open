export const EDINET_DIRECTORY_POINTER = 'directory/active.json';
const SHA = /^[a-f0-9]{64}$/;
const CODE = /^\d{3}[0-9A-Z]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE = 'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip';

// The client response is deliberately a small, source-specific projection.
// This is a new EDINET universe, not an assertion of JPX market membership.
export function issuerDirectoryClientPayload(directory) {
 if (!directory || directory.schemaVersion !== 1 || directory.source !== SOURCE ||
     !DATE.test(directory.snapshotDate ?? '') ||
     !SHA.test(directory.sourceZipSha256 ?? '') ||
     !Array.isArray(directory.companies) || directory.companies.length < 1 ||
     directory.companies.length > 10000) throw Error('issuer_directory_invalid_source');
 const seen = new Set();
 return directory.companies.map(c => {
  if (!c || !CODE.test(c.code ?? '') || seen.has(c.code) ||
      typeof c.name !== 'string' || !c.name.trim() || c.name.length > 300 ||
      typeof c.english !== 'string' || c.english.length > 300 ||
      typeof c.industry !== 'string' || c.industry.length > 200 ||
      !/^E\d{5}$/.test(c.edinetCode ?? '') ||
      c.market !== '' || c.marketSource !== 'not_available_in_edinet_code_list' ||
      c.industrySource !== 'edinet_code_list') throw Error('issuer_directory_invalid_company');
  seen.add(c.code);
  return {code:c.code,name:c.name,english:c.english,industry:c.industry,
   market:'',edinetCode:c.edinetCode,marketSource:c.marketSource,
   industrySource:c.industrySource};
 });
}

// Small immutable pointer; never read an R2 key controlled by HTTP input.
export function validateIssuerDirectoryManifest(m) {
 if (!m || m.schemaVersion !== 1 || m.source !== SOURCE ||
     !DATE.test(m.snapshotDate ?? '') || !SHA.test(m.sourceZipSha256 ?? '') ||
     !SHA.test(m.dataSha256 ?? '') ||
     m.objectKey !== 'directory/releases/' + m.dataSha256 + '.json' ||
     !Number.isInteger(m.count) || m.count < 1 || m.count > 10000 ||
     !Number.isInteger(m.bytes) || m.bytes < 20 || m.bytes > 3_000_000) {
  throw Error('issuer_directory_invalid_manifest');
 }
 return m;
}
export async function readIssuerDirectoryRelease(bucket) {
 if (!bucket || typeof bucket.get !== 'function') throw Error('issuer_directory_storage_unavailable');
 const pointer = await bucket.get(EDINET_DIRECTORY_POINTER);
 if (!pointer || typeof pointer.size !== 'number' || pointer.size > 4096 ||
     typeof pointer.json !== 'function') throw Error('issuer_directory_pointer_unavailable');
 const manifest = validateIssuerDirectoryManifest(await pointer.json());
 const object = await bucket.get(manifest.objectKey);
 if (!object || !object.body || object.size !== manifest.bytes) {
  throw Error('issuer_directory_release_missing_or_wrong_size');
 }
 return {manifest,object};
}
