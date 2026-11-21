const API = 'https://api.edinet-fsa.go.jp/api/v2';

// Call server-side only. Never expose request URLs or upstream errors: they may
// contain the subscription key. A day is searched independently so a failed
// date can never be mistaken for an empty result.
export async function listDay(date, key, fetcher = fetch) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日付が不正です');
  if (!key) throw new Error('EDINET_API_KEY が未設定です');
  const url = new URL(`${API}/documents.json`);
  url.searchParams.set('date', date); url.searchParams.set('type', '2');
  url.searchParams.set('Subscription-Key', key);
  let response;
  try { response = await fetcher(url.toString()); } catch { throw new Error('EDINET への接続に失敗しました'); }
  if (!response.ok) throw new Error('EDINET 書類一覧の取得に失敗しました');
  let data;
  try { data = await response.json(); } catch { throw new Error('EDINET の応答を読み取れません'); }
  if (String(data.metadata?.status) !== '200' || !Array.isArray(data.results)) throw new Error('EDINET 書類一覧の取得に失敗しました');
  return data.results.filter(d => ['120', '130'].includes(d.docTypeCode) && d.withdrawalStatus === '0' && d.disclosureStatus === '0');
}

// Latest fiscal period first, then latest submission. Corrections are not yet
// folded into the original document and must be explicitly surfaced separately.
export function latestReport(documents, code) {
  return documents.filter(d => d.secCode === `${code}0` && d.docTypeCode === '120' && d.periodEnd && d.submitDateTime)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.submitDateTime.localeCompare(a.submitDateTime))[0] ?? null;
}

export function linkedCorrections(documents, code, reportId) {
  const parents = new Set([reportId]); const found = []; let changed = true;
  while (changed) {
    changed = false;
    for (const d of documents) if (d.secCode === `${code}0` && d.docTypeCode === '130' && d.parentDocID && parents.has(d.parentDocID) && !parents.has(d.docID)) {
      found.push(d); parents.add(d.docID); changed = true;
    }
  }
  return found.sort((a,b)=>a.submitDateTime.localeCompare(b.submitDateTime));
}
