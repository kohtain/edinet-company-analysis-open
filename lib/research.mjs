import {decimal, documentSetting, factFromRow, financialFact, integer, isYen, periodPrefix, reportingScope, rowsIndex, uniqueFact} from './dashboard.mjs';

export const normalizeSearch = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).replace(/[\s・･,，.．\-ー]/g,'');
const companySearchCache = new WeakMap();
function searchFields(c) {
 let cached = companySearchCache.get(c);
 if (!cached) {
  cached = {
   codeLower: String(c.code || '').toLowerCase(),
   nameNorm: normalizeSearch(c.name),
   haystack: normalizeSearch(`${c.code} ${c.name} ${c.english || ''}`),
  };
  companySearchCache.set(c, cached);
 }
 return cached;
}
export function searchCompanies(companies, query, market='', industry='') {
 const q = normalizeSearch(query);
 const terms = String(query).trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
 const scored = [];
 for (const c of companies) {
  if ((market && c.market !== market) || (industry && c.industry !== industry)) continue;
  const info = searchFields(c);
  if (terms.length && !terms.every(t => info.haystack.includes(t))) continue;
  const s = info.codeLower === q ? 0 : info.nameNorm === q ? 1 : info.codeLower.startsWith(q) ? 2 : info.nameNorm.startsWith(q) ? 3 : 4;
  scored.push([s, c]);
 }
 scored.sort((a, b) => a[0] - b[0] || (a[1].code < b[1].code ? -1 : a[1].code > b[1].code ? 1 : 0));
 return scored.map(entry => entry[1]);
}
export function moneyUnit(rows) {
 const values=rows.filter(r=>r['単位']==='円'&&/^CurrentYear(?:Duration|Instant)$/.test(r['コンテキストID']||'')&&/(?:NetSales|Revenue|TotalAssets)/i.test(r['要素ID']||'')).map(r=>Math.abs(Number(r['値']))).filter(Number.isFinite);
 return values.some(value=>value>=100_000_000_000)?'10億円':'百万円';
}
export const moneyDisplayNote = unit => unit === '10億円' ? '金額は10億円単位の概数（絶対値を切り上げ、負数は符号を保持）。原数値は出典で確認できます。' : '金額は百万円単位、小数なし（四捨五入）。原数値は出典で確認できます。';
export function formatMoney(value,unit='億円') {
 if(!/^-?\d+$/.test(String(value)))return '—';
 const n=BigInt(value),d=unit==='億円'?100000000n:1000000n;const a=n<0n?-n:n;const rounded=(a+d/2n)/d;
 return ((n<0n&&rounded!==0n?-rounded:rounded)).toLocaleString('ja-JP');
}
export const metrics = [
 ['revenue','売上高・営業収益','損益'], ['operating','営業利益','損益'], ['profit','親会社に帰属する利益','損益'],
 ['assets','総資産','財政状態'], ['netAssets','純資産','財政状態'], ['ownCapital','自己資本','財政状態'],
 ['parentEquity','親会社の所有者に帰属する持分','財政状態'], ['cash','現金及び現金同等物','財政状態'],
 ['operatingCF','営業キャッシュフロー','キャッシュフロー'], ['investingCF','投資キャッシュフロー','キャッシュフロー'],
 ['financingCF','財務キャッシュフロー','キャッシュフロー'], ['rd','研究開発費','経営資源'], ['capex','設備投資額','経営資源'],
 ['ordinaryRevenue','経常収益','損益'], ['ordinaryProfit','経常利益・損失','損益'],
];
export const people = [
 ['employees','従業員数','人'], ['salary','平均年間給与','万円'],
 ['age','平均年齢','歳'], ['tenure','平均勤続年数','年'],
];
const extraTags = {
 ordinaryRevenue:['jpcrp_cor:OrdinaryIncomeSummaryOfBusinessResults','jppfs_cor:OrdinaryIncomeBNK'],
 ordinaryProfit:['jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults','jppfs_cor:OrdinaryIncome'],
 netAssets:['jpcrp_cor:NetAssetsSummaryOfBusinessResults','jppfs_cor:NetAssets'],
 ownCapital:['jpcrp_cor:EquitySummaryOfBusinessResults'],
 parentEquity:['jpcrp_cor:EquityAttributableToOwnersOfParentIFRSSummaryOfBusinessResults','jpigp_cor:EquityAttributableToOwnersOfParentIFRS'],
 cash:['jppfs_cor:CashAndCashEquivalents','jpigp_cor:CashAndCashEquivalentsIFRS','jpcrp_cor:CashAndCashEquivalentsSummaryOfBusinessResults','jpcrp_cor:CashAndCashEquivalentsIFRSSummaryOfBusinessResults'],
 operatingCF:['jppfs_cor:NetCashProvidedByUsedInOperatingActivities','jpigp_cor:CashFlowsFromUsedInOperatingActivitiesIFRS','jpcrp_cor:NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults','jpcrp_cor:CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults'],
 investingCF:['jppfs_cor:NetCashProvidedByUsedInInvestingActivities','jpigp_cor:CashFlowsFromUsedInInvestingActivitiesIFRS','jpcrp_cor:NetCashProvidedByUsedInInvestingActivitiesSummaryOfBusinessResults','jpcrp_cor:CashFlowsFromUsedInInvestingActivitiesIFRSSummaryOfBusinessResults'],
 financingCF:['jppfs_cor:NetCashProvidedByUsedInFinancingActivities','jpigp_cor:CashFlowsFromUsedInFinancingActivitiesIFRS','jpcrp_cor:NetCashProvidedByUsedInFinancingActivitiesSummaryOfBusinessResults','jpcrp_cor:CashFlowsFromUsedInFinancingActivitiesIFRSSummaryOfBusinessResults'],
 rd:['jpcrp_cor:ResearchAndDevelopmentExpensesResearchAndDevelopmentActivities'],
 capex:['jpcrp_cor:CapitalExpendituresOverviewOfCapitalExpendituresEtc'],
 employees:['jpcrp_cor:NumberOfEmployees','jpcrp_cor:NumberOfEmployeesSummaryOfBusinessResults','jpcrp_cor:NumberOfEmployeesIFRSSummaryOfBusinessResults'],
 salary:['jpcrp_cor:AverageAnnualSalaryInformationAboutReportingCompanyInformationAboutEmployees'],
 age:['jpcrp_cor:AverageAgeYearsInformationAboutReportingCompanyInformationAboutEmployees'],
 tenure:['jpcrp_cor:AverageLengthOfServiceYearsInformationAboutReportingCompanyInformationAboutEmployees'],
};
const instant = new Set(['netAssets','ownCapital','parentEquity','cash','employees','salary','age','tenure']);
const issuerOnly = new Set(['salary','age','tenure']);
const pureUnitKeys = new Set(['employees','age','tenure']);
export function extraFact(rows,key,period='current') {
 if (!Object.hasOwn(periodPrefix,period) || !Object.hasOwn(extraTags,key)) return {status:'unavailable'};
 const context = periodPrefix[period] + (instant.has(key) ? 'Instant' : 'Duration');
 const scope = issuerOnly.has(key) ? '個別' : reportingScope(rows);
 const isPure = pureUnitKeys.has(key);
 const byElement = rowsIndex(rows).byElement;
 const main = [];
 const standalone = [];
 const standaloneContext = context + '_NonConsolidatedMember';
 const forbiddenMainScope = scope === '個別' ? '連結' : '個別';
 const tags = extraTags[key];
 for (const tag of tags) {
  const bucket = byElement.get(tag);
  if (!bucket) continue;
  for (const row of bucket) {
   if (!(isPure ? row['ユニットID'] === 'pure' : isYen(row))) continue;
   const rowCtx = row['コンテキストID'];
   if (rowCtx === context && row['連結・個別'] !== forbiddenMainScope) main.push(row);
   else if (rowCtx === standaloneContext && row['連結・個別'] !== '連結') standalone.push(row);
  }
 }
 const selected = scope === '個別' && (standalone.length || issuerOnly.has(key)) ? standalone : main;
 const factScope = issuerOnly.has(key) ? '提出会社（個別）' : scope ?? selected[0]?.['連結・個別'];
 // These are explicit aliases of this metric. Check every candidate before
 // preferring the first taxonomy entry (typically the summary disclosure).
 const matchingTag = tags.find(tag => selected.some(row => row['要素ID'] === tag));
 const aliases = new Set(selected.map(row => JSON.stringify([
  row['値'], row['連結・個別'] === 'その他' && scope ? scope : row['連結・個別'],
  row['ユニットID'], row['単位'], row.sourceDocId, row.sourceFile,
 ])));
 if (aliases.size > 1) return {status:'conflict'};
 return uniqueFact(selected.filter(row => row['要素ID'] === matchingTag), factScope);
}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') &&
 Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const reviewedToyotaPeriods = {
 Prior4Year:['2021-04-01','2022-03-31'],
 Prior3Year:['2022-04-01','2023-03-31'],
 Prior2Year:['2023-04-01','2024-03-31'],
};
export function periodFor(rows, context, indexedEnd, docId) {
 const dei = rowsIndex(rows).dei;
 const docTypeValues = dei.get('jpdei_cor:DocumentTypeDEI');
 const documentType = docTypeValues?.size === 1 ? docTypeValues.values().next().value : undefined;
 // Fourth-form annual reports can use Prior1Year for the fiscal year in DEI.
 // They need instance-context dates before any relative period can be adopted.
 if (docTypeValues && documentType !== '第三号様式') return undefined;
 // The CSV provides relative IDs. Older years require independent date
 // evidence, even when the numerical values themselves are present.
 const match = /^(CurrentYear|Prior[1-4]Year)(Duration|Instant)(?:_NonConsolidatedMember)?$/.exec(context ?? '');
 if (!match) return undefined;
 if (Object.hasOwn(reviewedToyotaPeriods,match[1])) {
  // Toyota's five-year summary (2026-03 filing, PDF p. 5) and the
  // 2022/2023/2024 filing covers establish these fiscal periods.
  if (docId !== 'S100Y8NY' || periodFor(rows,'CurrentYearInstant',indexedEnd)?.end !== '2026-03-31') return undefined;
  const [start,end] = reviewedToyotaPeriods[match[1]];
  const basis = 'https://global.toyota/pages/global_toyota/ir/library/securities-report/archives/archives_'+end.slice(0,4)+'_03.pdf#page=1';
  return match[2] === 'Instant' ? {end,basis} : {start,end,basis};
 }
 const current = match[1] === 'CurrentYear';
 const start = documentSetting(rows, (current ? 'Current' : 'Previous')+'FiscalYearStartDateDEI');
 const end = documentSetting(rows, (current ? 'Current' : 'Previous')+'FiscalYearEndDateDEI');
 const reportedEndTag = current ? 'CurrentPeriodEndDateDEI' : 'ComparativePeriodEndDateDEI';
 const reportedEndValues = dei.get('jpdei_cor:'+reportedEndTag);
 const reportedEnd = reportedEndValues?.size === 1 ? reportedEndValues.values().next().value : undefined;
 if (reportedEndValues && !validDate(reportedEnd)) return undefined;
 if (!validDate(end) || (reportedEnd && reportedEnd !== end) || (current && indexedEnd && indexedEnd !== end)) return undefined;
 if (match[2] === 'Instant') return {end};
 if (!validDate(start) || start > end) return undefined;
 return {start,end};
}
export function pdfUrl(id) {
 return /^S[A-Z0-9]{7}$/.test(id ?? '') ? 'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/pdf/'+id+'.pdf' : '';
}
const core = new Set(['revenue','operating','profit','assets']);
export function researchFact(report, code, key, period='current') {
 const rows = report.rows ?? [];
 const found = core.has(key) ? financialFact(rows,code,key,period) : extraFact(rows,key,period);
 if (found.status !== 'reported') return found;
 const evidence = withEvidence(report,found);
 return evidence.docId === report.id && evidence.period && /^(連結|個別|提出会社（個別）)$/.test(evidence.scope ?? '') && evidence.sourceId ?
  evidence : {status:'needs_review'};
}
export function withEvidence(report, fact, precomputedPeriod) {
 const docId = fact.docId ?? report.id;
 const sourceId = pdfUrl(docId) && fact.tag && fact.context && fact.file ?
  [docId,fact.file,fact.tag,fact.context,fact.unitId ?? fact.unit ?? ''].map(encodeURIComponent).join('/') : '';
 return {
  ...fact, docId, sourceId,
  period: arguments.length >= 3 ? precomputedPeriod : (docId === report.id ? periodFor(report.rows ?? [],fact.context,report.periodEnd,docId) : undefined),
  parserVersion: report.parserVersion,
 };
}
export function rawFact(report, row) {
 return withEvidence(report,factFromRow(row));
}
export function statusLabel(status) {
 return ({
  reported:'開示値', calculated:'開示値から算定', conflict:'候補の競合・要確認', needs_review:'期間・範囲・出典の要確認',
  unavailable:'未抽出', empty:'開示行に数値なし', csv_unavailable:'CSV未取得（利用可能なCSVなし）',
  correction_review_required:'訂正の影響を確認中', review_required:'書類・データを確認中',
  no_original_in_index:'収集範囲で原本未特定', not_indexed:'未収録', pending_refresh:'検証・更新待ち',
 })[status] ?? 'データ確認中';
}
function groupDigits(value) {
 const [whole,fraction] = value.split('.');
 return BigInt(whole).toLocaleString('ja-JP').replace(/^0$/,whole.startsWith('-') ? '-0' : '0') +
  (fraction ? '.'+fraction : '');
}
export function displayFact(fact, key, money='億円') {
 if (fact.status !== 'reported' || !decimal.test(fact.value)) return {value:'',unit:'',conversion:''};
 if (fact.unit === '円' && !integer.test(fact.value)) {
  return {value:groupDigits(fact.value),unit:'円',conversion:'原値'};
 }
 if (fact.unit !== '円' || !integer.test(fact.value)) {
  const unit = people.find(([metric]) => metric === key)?.[2] ?? fact.unit ?? '';
  return {value:groupDigits(fact.value),unit,conversion:'原値'};
 }
 const unit = key === 'salary' ? '万円' : money;
 if (key !== 'salary' && ['10億円','百万円'].includes(unit)) {
  const amount=BigInt(fact.value),abs=amount<0n?-amount:amount;
  const divisor=unit==='10億円'?1000000000n:1000000n;
  const rounded=unit==='10億円'?(abs+divisor-1n)/divisor:(abs+divisor/2n)/divisor;
  const conversion=unit==='10億円'?'円 ÷ 1000000000、絶対値を整数に切り上げ、負数は符号を保持':'円 ÷ 1000000、整数まで四捨五入';
  if (abs && !rounded) return {value:amount<0n?'−1 < 値 < 0':'1未満',unit,conversion};
  return {value:(amount<0n?'−':'')+rounded.toLocaleString('ja-JP'),unit,conversion};
 }
 const divisor = unit === '億円' ? 100000000n : unit === '百万円' ? 1000000n : 10000n;
 const amount = BigInt(fact.value);
 const abs = amount < 0n ? -amount : amount;
 const rounded = (abs*100n+divisor/2n)/divisor;
 const conversion = '円 ÷ '+divisor+'、小数第2位まで四捨五入';
 if (abs && !rounded) return {value:amount < 0n ? '−0.01 < 値 < 0' : '0.01未満',unit,conversion};
 const decimals = String(rounded%100n).padStart(2,'0').replace(/0+$/,'');
 return {value:(amount < 0n ? '−' : '') + (rounded/100n).toLocaleString('ja-JP') + (decimals ? '.'+decimals : ''),unit,conversion};
}
export const periodLabel = period => period?.start ? period.start+' ～ '+period.end : period?.end ?? '実期間未確認';
const csvCell = value => {
 let cell = String(value ?? '');
 if (!decimal.test(cell) && (/^[\u0000-\u0020\u007f\ufeff]*[=+\-@＝＋－＠]/u.test(cell) || /^[\t\r\n]/.test(cell))) cell = "'"+cell;
 return '"'+cell.replaceAll('"','""')+'"';
};
export const csv = rows => rows.map(row => row.map(csvCell).join(',')).join('\r\n');
export const evidenceColumns = ['企業コード','項目','表示値','表示単位','状態','開始日','終了日・時点','範囲','原値','原単位','原ユニットID','文書ID','原本','出典ID','原タグ','context','原ファイル','解析版','表示変換','期間の補足出典'];
export function evidenceRow(code,label,fact,formatted) {
 return [code,label,formatted.value,formatted.unit,statusLabel(fact.status),fact.period?.start ?? '',fact.period?.end ?? '',
  fact.scope ?? '',fact.value ?? '',fact.unit ?? '',fact.unitId ?? '',fact.docId ?? '',pdfUrl(fact.docId),fact.sourceId ?? '',
  fact.tag ?? '',fact.context ?? '',fact.file ?? '',fact.parserVersion ?? '',formatted.conversion ?? '',fact.period?.basis ?? ''];
}
