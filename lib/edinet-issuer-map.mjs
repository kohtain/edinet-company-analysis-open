const SOURCE = 'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip';
const MASTER_CODE = /^\d{3}[0-9A-Z]$/;
const EDINET_CODE = /^E\d{5}$/;
const SECURITY_CODE = /^\d{3}[0-9A-Z]0$/;
const SHA256 = /^[0-9a-f]{64}$/;

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function csvRecords(text, { maxRecords = Infinity } = {}) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('issuer_map_empty_csv');
  const len = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let chunkStart = i;
  const records = [];
  let row = [];
  let field = '';
  let state = 'field_start';

  const flush = end => {
    if (end > chunkStart) {
      const part = text.slice(chunkStart, end);
      field = field ? field + part : part;
    }
  };
  const endField = () => {
    row.push(field);
    field = '';
    state = 'field_start';
  };
  const endRecord = () => {
    endField();
    if (!(row.length === 1 && row[0] === '')) records.push(row);
    row = [];
  };

  for (; i < len; i += 1) {
    const code = text.charCodeAt(i);
    if (state === 'quoted') {
      if (code === 34) { // '"'
        if (text.charCodeAt(i + 1) === 34) {
          flush(i + 1);
          i += 1;
          chunkStart = i + 1;
        } else {
          flush(i);
          state = 'after_quote';
          chunkStart = i + 1;
        }
      }
      continue;
    }

    if (state === 'after_quote') {
      if (code === 44) { // ','
        endField();
        chunkStart = i + 1;
      } else if (code === 10 || code === 13) { // '\n' or '\r'
        if (code === 13 && text.charCodeAt(i + 1) === 10) i += 1;
        endRecord();
        if (records.length >= maxRecords) return records;
        chunkStart = i + 1;
      } else {
        throw new Error('issuer_map_invalid_csv_after_quote');
      }
      continue;
    }

    if (state === 'field_start' && code === 34) {
      state = 'quoted';
      chunkStart = i + 1;
    } else if (code === 44) {
      flush(i);
      endField();
      chunkStart = i + 1;
    } else if (code === 10 || code === 13) {
      flush(i);
      if (code === 13 && text.charCodeAt(i + 1) === 10) i += 1;
      endRecord();
      if (records.length >= maxRecords) return records;
      chunkStart = i + 1;
    } else if (code === 34) {
      throw new Error('issuer_map_invalid_csv_quote');
    } else {
      state = 'unquoted';
    }
  }

  if (state === 'quoted') throw new Error('issuer_map_unclosed_csv_quote');
  if (state === 'unquoted') flush(len);
  if (field !== '' || row.length > 0 || state === 'after_quote') endRecord();
  return records;
}

export function parseMetadata(record, snapshotDate) {
  if (record.length !== 4 || record[0].normalize('NFKC') !== 'ダウンロード実行日' ||
      record[2].normalize('NFKC') !== '件数') {
    throw new Error('issuer_map_invalid_metadata');
  }
  const dateMatch = /^([0-9]{4})年([0-9]{2})月([0-9]{2})日現在$/.exec(record[1].normalize('NFKC'));
  const countMatch = /^([0-9,]+)件$/.exec(record[3].normalize('NFKC'));
  if (!dateMatch || !countMatch) throw new Error('issuer_map_invalid_metadata');
  const metadataDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const declaredRows = Number(countMatch[1].replaceAll(',', ''));
  if (!isValidIsoDate(metadataDate) || metadataDate !== snapshotDate ||
      !Number.isSafeInteger(declaredRows) || declaredRows < 1) {
    throw new Error('issuer_map_metadata_mismatch');
  }
  return declaredRows;
}

export function buildIssuerMap(csvText, masterCodes, { snapshotDate, sourceZipSha256 } = {}) {
  if (!Array.isArray(masterCodes) || masterCodes.length === 0 ||
      masterCodes.some(code => typeof code !== 'string' || !MASTER_CODE.test(code)) ||
      new Set(masterCodes).size !== masterCodes.length) {
    throw new Error('issuer_map_invalid_master_codes');
  }
  if (!isValidIsoDate(snapshotDate) || typeof sourceZipSha256 !== 'string' || !SHA256.test(sourceZipSha256)) {
    throw new Error('issuer_map_invalid_snapshot_metadata');
  }

  const records = csvRecords(csvText);
  if (records.length < 2) throw new Error('issuer_map_missing_metadata_or_header');
  const declaredRows = parseMetadata(records[0], snapshotDate);
  const headers = records[1].map(value => value.normalize('NFKC'));
  const required = ['EDINETコード', '上場区分', '証券コード'];
  const indices = {};
  for (const header of required) {
    const matches = [];
    for (let i = 0; i < headers.length; i += 1) if (headers[i] === header) matches.push(i);
    if (matches.length !== 1) throw new Error('issuer_map_missing_or_ambiguous_header');
    indices[header] = matches[0];
  }
  if (headers.length === 0 || records.length - 2 !== declaredRows) {
    throw new Error('issuer_map_row_count_mismatch');
  }

  const master = [...masterCodes].sort();
  const masterSet = new Set(master);
  const sourcePairs = [];
  for (let i = 2; i < records.length; i += 1) {
    const record = records[i];
    if (record.length !== headers.length) throw new Error('issuer_map_csv_row_width_mismatch');
    const edinetCode = record[indices['EDINETコード']];
    const listing = record[indices['上場区分']];
    const securityCode = record[indices['証券コード']];
    if (listing !== '上場' || !EDINET_CODE.test(edinetCode) || !SECURITY_CODE.test(securityCode)) continue;
    sourcePairs.push({ code: securityCode.slice(0, -1), edinetCode });
  }

  const sourceCodeSeen = new Set();
  const sourceEdinetSeen = new Set();
  for (const { code, edinetCode } of sourcePairs) {
    if (sourceCodeSeen.has(code)) throw new Error('issuer_map_duplicate_security_code');
    if (sourceEdinetSeen.has(edinetCode)) throw new Error('issuer_map_duplicate_edinet_code');
    sourceCodeSeen.add(code);
    sourceEdinetSeen.add(edinetCode);
  }

  const entries = {};
  for (const { code, edinetCode } of sourcePairs) {
    if (masterSet.has(code)) entries[code] = edinetCode;
  }
  const sortedEntries = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return {
    schemaVersion: 1,
    source: SOURCE,
    snapshotDate,
    sourceZipSha256,
    masterCodes: master,
    entries: sortedEntries,
    unmappedCodes: master.filter(code => !Object.hasOwn(sortedEntries, code)),
  };
}
