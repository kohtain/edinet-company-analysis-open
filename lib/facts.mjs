// EDINET CSV is tab-delimited and UTF-16LE. Preserve every context and unit.
export function parseTsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c === '\t') { row.push(field); field = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('不正な CSV: 引用符が閉じていません');
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows.shift();
  const required = ['要素ID', '項目名', 'コンテキストID', '相対年度', '連結・個別', '期間・時点', 'ユニットID', '値'];
  if (required.some(k => !header.includes(k))) throw new Error('未知の CSV 列形式');
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
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
