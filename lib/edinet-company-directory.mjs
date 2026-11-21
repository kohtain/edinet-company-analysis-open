import {csvRecords, parseMetadata} from './edinet-issuer-map.mjs';

// Official EDINET CODE LIST (not the EDINET documents API).
// This file deliberately does not bake any downloaded issuer records into Git.
export const EDINET_DIRECTORY_SOURCE =
  'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip';

const CODE = /^\d{3}[0-9A-Z]$/;
const SEC_CODE = /^\d{3}[0-9A-Z]0$/;
const EDINET_CODE = /^E\d{5}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED = [
  'EDINETコード', '提出者種別', '上場区分', '提出者名',
  '提出者名(英字)', '提出者業種', '証券コード',
];
const isoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

const validatedCodes = (rows, label) => {
  if (!Array.isArray(rows)) throw Error(label + '_not_an_array');
  const map = new Map();
  for (const item of rows) {
    if (!item || !CODE.test(item.code) || map.has(item.code)) throw Error(label + '_invalid_or_duplicate_code');
    map.set(item.code, item);
  }
  return map;
};

// Date embedded in the downloaded EDINET list, not the local clock.
export function edinetCodeListSnapshot(csvText) {
 const [metadata] = csvRecords(csvText);
 if (!Array.isArray(metadata) || metadata.length !== 4) throw Error('edinet_directory_missing_source_date');
 const match=/^(\d{4})年(\d{2})月(\d{2})日現在$/.exec(String(metadata[1]).normalize('NFKC'));
 if (!match) throw Error('edinet_directory_invalid_source_date');
 const snapshotDate=match.slice(1).join('-');
 if (!isoDate(snapshotDate)) throw Error('edinet_directory_invalid_source_date');
 parseMetadata(metadata,snapshotDate);
 return snapshotDate;
}

export function buildEdinetCompanyDirectory(csvText, {snapshotDate, sourceZipSha256} = {}) {
  if (!isoDate(snapshotDate) || !SHA256.test(sourceZipSha256 ?? '')) {
    throw Error('edinet_directory_invalid_source_metadata');
  }
  const records = csvRecords(csvText);
  if (records.length < 2 || records.length > 150000) throw Error('edinet_directory_invalid_record_count');
  const declared = parseMetadata(records[0], snapshotDate);
  const headers = records[1].map(v => v.normalize('NFKC').trim());
  if (declared !== records.length - 2) throw Error('edinet_directory_row_count_mismatch');
  const indexes = {};
  for (const name of REQUIRED) {
    const matches = headers.map((value, index) => value === name ? index : -1).filter(i => i >= 0);
    if (matches.length !== 1) throw Error('edinet_directory_missing_or_duplicate_column:' + name);
    indexes[name] = matches[0];
  }
  const companies = [];
  const byCode = new Set(), byEdinet = new Set();
  const excluded = {notListed:0, notDomestic:0, noFourCharacterSecurityCode:0};
  for (const record of records.slice(2)) {
    if (record.length !== headers.length) throw Error('edinet_directory_row_width_mismatch');
    const field = name => record[indexes[name]].trim();
    if (field('上場区分') !== '上場') { excluded.notListed++; continue; }
    if (field('提出者種別') !== '内国法人・組合') { excluded.notDomestic++; continue; }
    const security = field('証券コード'), edinetCode = field('EDINETコード');
    if (!SEC_CODE.test(security) || security === '00000' || !EDINET_CODE.test(edinetCode)) {
      excluded.noFourCharacterSecurityCode++; continue;
    }
    const code = security.slice(0, 4), name = field('提出者名');
    const english = field('提出者名(英字)'), industry = field('提出者業種');
    if (!name || name.length > 300 || english.length > 300 || industry.length > 200) {
      throw Error('edinet_directory_invalid_company_metadata');
    }
    if (byCode.has(code) || byEdinet.has(edinetCode)) throw Error('edinet_directory_duplicate_identity');
    byCode.add(code); byEdinet.add(edinetCode);
    companies.push({
      code, name, english, industry, edinetCode,
      // EDINET's "上場" is NOT TSE Prime, Standard, or Growth.
      market:'', marketSource:'not_available_in_edinet_code_list',
      industrySource:'edinet_code_list',
    });
  }
  companies.sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
  if (companies.length === 0) throw Error('edinet_directory_no_listed_domestic_issuers');
  return {
    schemaVersion:1, source:EDINET_DIRECTORY_SOURCE,
    snapshotDate, sourceZipSha256,
    scope:'edinet_listed_domestic_issuers_with_four_character_security_code',
    sourceRows:declared, excluded, companies,
  };
}

// A coverage gap is not automatically a delisting or an incorrect issuer name.
// This comparison only matches company/security codes; industry taxonomies differ.
export function compareEdinetDirectory(directory, previousMaster) {
  const current = validatedCodes(directory?.companies, 'edinet_directory');
  const previous = validatedCodes(previousMaster, 'prior_master');
  const onlyInEdinet = [...current.keys()].filter(code=>!previous.has(code)).sort();
  const onlyInPriorMaster = [...previous.keys()].filter(code=>!current.has(code)).sort();
  const missingMarket = [...current.values()].filter(c=>!c.market).length;
  return {
    edinetCount:current.size, priorMasterCount:previous.size,
    matchingCodes:current.size-onlyInEdinet.length,
    onlyInEdinet, onlyInPriorMaster, missingMarket,
    marketNote:'EDINET 上場区分 does not identify JPX Prime/Standard/Growth.',
    industryNote:'EDINET 提出者業種 and JPX 33業種 are different classifications.',
  };
}
