// EDINET CSV is tab-delimited and UTF-16LE. Preserve every context and unit.
export function parseTsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false, hasNonEmpty = false;
  const len = text.length;
  let i = len > 0 && text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let chunkStart = i;
  for (; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code === 34) { // '"'
      if (quoted && text.charCodeAt(i + 1) === 34) {
        const part = text.slice(chunkStart, i + 1);
        field = field ? field + part : part;
        i++;
        chunkStart = i + 1;
      } else {
        if (i > chunkStart) {
          const part = text.slice(chunkStart, i);
          field = field ? field + part : part;
        }
        quoted = !quoted;
        chunkStart = i + 1;
      }
    } else if (!quoted && code === 9) { // '\t'
      if (i > chunkStart) {
        const part = text.slice(chunkStart, i);
        field = field ? field + part : part;
      }
      row.push(field);
      if (field) hasNonEmpty = true;
      field = '';
      chunkStart = i + 1;
    } else if (!quoted && (code === 10 || code === 13)) { // '\n' or '\r'
      if (i > chunkStart) {
        const part = text.slice(chunkStart, i);
        field = field ? field + part : part;
      }
      if (code === 13 && text.charCodeAt(i + 1) === 10) i++;
      row.push(field);
      if (field || hasNonEmpty) rows.push(row);
      row = [];
      field = '';
      hasNonEmpty = false;
      chunkStart = i + 1;
    }
  }
  if (len > chunkStart) {
    const part = text.slice(chunkStart, len);
    field = field ? field + part : part;
  }
  if (quoted) throw new Error('不正な CSV: 引用符が閉じていません');
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  const headerLen = header.length;
  const required = ['要素ID', '項目名', 'コンテキストID', '相対年度', '連結・個別', '期間・時点', 'ユニットID', '値'];
  for (let k = 0; k < required.length; k++) {
    if (!header.includes(required[k])) throw new Error('未知の CSV 列形式');
  }
  const result = new Array(rows.length - 1);
  for (let rIdx = 1; rIdx < rows.length; rIdx++) {
    const r = rows[rIdx];
    const obj = {};
    for (let cIdx = 0; cIdx < headerLen; cIdx++) {
      obj[header[cIdx]] = r[cIdx] ?? '';
    }
    result[rIdx - 1] = obj;
  }
  return result;
}

// Only an exact, uniquely identified fact is returned. Unrecognized dimensions
// and duplicate facts remain unresolved instead of being silently aggregated.
export function selectFact(rows, { elementIds, contextId, scope }) {
  const matches = rows.filter(r => elementIds.includes(r['要素ID']) && r['コンテキストID'] === contextId && r['連結・個別'] === scope);
  if (!matches.length) return { status: 'not_found' };
  if (matches.length !== 1) return { status: 'ambiguous', candidates: matches.length };
  const fact = matches[0];
  if (fact['値'] === '') return { status: 'missing', fact };
  return { status: 'reported', fact };
}
