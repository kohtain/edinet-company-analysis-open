const config={
 '6758':{revenue:['jpigp_cor:NetSalesIFRS']},
 '7203':{revenue:['jpcrp030000-asr_E02144-000:OperatingRevenuesIFRSKeyFinancialData'],operating:['jpigp_cor:OperatingProfitLossIFRS'],profit:['jpcrp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults'],assets:['jpcrp_cor:TotalAssetsIFRSSummaryOfBusinessResults']},
 '8267':{revenue:['jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults'],operating:['jppfs_cor:OperatingIncome'],profit:['jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults'],assets:['jpcrp_cor:TotalAssetsSummaryOfBusinessResults']},
 '4751':{revenue:['jpcrp_cor:NetSalesSummaryOfBusinessResults'],operating:['jppfs_cor:OperatingIncome'],profit:['jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults'],assets:['jpcrp_cor:TotalAssetsSummaryOfBusinessResults']}
};
const standardTags = {
 revenue: [
  'jppfs_cor:NetSales', 'jpcrp_cor:NetSalesSummaryOfBusinessResults',
  'jppfs_cor:OperatingRevenue1', 'jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults',
  'jpigp_cor:RevenueIFRS', 'jpcrp_cor:RevenueIFRSSummaryOfBusinessResults',
 ],
 operating: ['jppfs_cor:OperatingIncome', 'jpigp_cor:OperatingProfitLossIFRS'],
 profit: [
  'jppfs_cor:ProfitLossAttributableToOwnersOfParent',
  'jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults',
  'jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS',
  'jpcrp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults',
 ],
 assets: ['jppfs_cor:Assets', 'jpigp_cor:AssetsIFRS', 'jpcrp_cor:TotalAssetsSummaryOfBusinessResults', 'jpcrp_cor:TotalAssetsIFRSSummaryOfBusinessResults'],
};
const standaloneTags = {
 profit: [], revenue: standardTags.revenue, operating: standardTags.operating, assets: standardTags.assets,
};
export const periodPrefix = {current:'CurrentYear', prior:'Prior1Year', prior2:'Prior2Year', prior3:'Prior3Year', prior4:'Prior4Year'};
export const integer = /^-?\d+$/;
export const decimal = /^-?\d+(?:\.\d+)?$/;
export const isYen = row => row['単位'] === '円' && (!row['ユニットID'] || row['ユニットID'] === 'JPY');
export function factFromRow(row, scope = row['連結・個別']) {
 return {
  status: 'reported', value: row['値'], tag: row['要素ID'], context: row['コンテキストID'],
  label: row['項目名'], unit: row['単位'], unitId: row['ユニットID'], scope,
  file: row.sourceFile, docId: row.sourceDocId,
 };
}
export function uniqueFact(rows, scope) {
 if (!rows.length) return {status:'unavailable'};
 const identities = new Set(rows.map(row => JSON.stringify([
  row['要素ID'], row['コンテキストID'], row['連結・個別'], row['ユニットID'],
  row['単位'], row.sourceDocId, row.sourceFile, row['値'],
 ])));
 if (identities.size > 1) return {status:'conflict'};
 const value = rows[0]['値'] ?? '';
 if (!value.trim() || value === '－') return {status:'empty'};
 if (!decimal.test(value)) return {status:'needs_review'};
 return factFromRow(rows[0], scope);
}
const rowsIndexCache = new WeakMap();
export function rowsIndex(rows) {
 if (!Array.isArray(rows)) return { byElement: new Map(), dei: new Map() };
 const len = rows.length;
 let cached = rowsIndexCache.get(rows);
 if (cached && cached.length === len && cached.first === rows[0] && cached.last === rows[len - 1]) return cached;
 const byElement = new Map();
 const dei = new Map();
 for (const row of rows) {
  const elementId = row['要素ID'];
  if (elementId !== undefined) {
   let bucket = byElement.get(elementId);
   if (!bucket) { bucket = []; byElement.set(elementId, bucket); }
   bucket.push(row);
   if (row['コンテキストID'] === 'FilingDateInstant' && elementId.startsWith('jpdei_cor:')) {
    let values = dei.get(elementId);
    if (!values) { values = new Set(); dei.set(elementId, values); }
    values.add(row['値']);
   }
  }
 }
 cached = { byElement, dei, length: len, first: rows[0], last: rows[len - 1] };
 rowsIndexCache.set(rows, cached);
 return cached;
}
export function documentSetting(rows, tag) {
 const values = rowsIndex(rows).dei.get('jpdei_cor:'+tag);
 return values?.size === 1 ? values.values().next().value : undefined;
}
export function reportingScope(rows) {
 const value = documentSetting(rows, 'WhetherConsolidatedFinancialStatementsArePreparedDEI');
 return value === 'true' ? '連結' : value === 'false' ? '個別' : undefined;
}
const financialAliases = {
 'jppfs_cor:NetSales':'sales', 'jpcrp_cor:NetSalesSummaryOfBusinessResults':'sales',
 'jppfs_cor:OperatingRevenue1':'operatingRevenue', 'jpcrp_cor:OperatingRevenue1SummaryOfBusinessResults':'operatingRevenue',
 'jpigp_cor:RevenueIFRS':'ifrsRevenue','jpcrp_cor:RevenueIFRSSummaryOfBusinessResults':'ifrsRevenue',
 'jppfs_cor:ProfitLossAttributableToOwnersOfParent':'parentProfit',
 'jpcrp_cor:ProfitLossAttributableToOwnersOfParentSummaryOfBusinessResults':'parentProfit',
 'jpigp_cor:ProfitLossAttributableToOwnersOfParentIFRS':'ifrsParentProfit',
 'jpcrp_cor:ProfitLossAttributableToOwnersOfParentIFRSSummaryOfBusinessResults':'ifrsParentProfit',
 'jppfs_cor:Assets':'assets','jpcrp_cor:TotalAssetsSummaryOfBusinessResults':'assets',
 'jpigp_cor:AssetsIFRS':'ifrsAssets','jpcrp_cor:TotalAssetsIFRSSummaryOfBusinessResults':'ifrsAssets',
};
export function financialFact(rows, code, metric, period='current') {
 if (!Object.hasOwn(periodPrefix,period)) return {status:'unavailable'};
 const scope = reportingScope(rows);
 const tags = (scope === '個別' ? standaloneTags[metric] : config[code]?.[metric] ?? standardTags[metric]) ?? [];
 const context = periodPrefix[period] + (metric === 'assets' ? 'Instant' : 'Duration');
 const byElement = rowsIndex(rows).byElement;
 const main = [];
 const separate = [];
 const separateContext = context + '_NonConsolidatedMember';
 const forbiddenMainScope = scope === '個別' ? '連結' : '個別';
 for (const tag of tags) {
  const bucket = byElement.get(tag);
  if (!bucket) continue;
  for (const row of bucket) {
   if (!isYen(row)) continue;
   const rowCtx = row['コンテキストID'];
   if (rowCtx === context && row['連結・個別'] !== forbiddenMainScope) main.push(row);
   else if (scope === '個別' && rowCtx === separateContext && row['連結・個別'] !== '連結') separate.push(row);
  }
 }
 const selected = separate.length ? separate : main;
 const resolvedScope = scope ?? (selected[0]?.['連結・個別'] || undefined);
 const identities = new Set(selected.map(row => JSON.stringify([
  financialAliases[row['要素ID']] ?? row['要素ID'], row['値'],
  row['連結・個別'] === 'その他' && scope ? scope : row['連結・個別'],
  row['ユニットID'],row['単位'],row.sourceDocId,row.sourceFile,
 ])));
 if (identities.size > 1) return {status:'conflict'};
 const tag = tags.find(tag => selected.some(row => row['要素ID'] === tag));
 return uniqueFact(selected.filter(row => row['要素ID'] === tag), resolvedScope);
}
export function segmentFacts(rows){
 const allowed=new Set(['jpcrp_cor:NumberOfEmployees','jpcrp_cor:ResearchAndDevelopmentExpensesResearchAndDevelopmentActivities','jpcrp_cor:CapitalExpendituresOverviewOfCapitalExpendituresEtc','jpcrp_cor:RevenuesFromExternalCustomers','jpcrp030000-asr_E02144-000:OperatingRevenueFromExternalCustomersIFRS','jppfs_cor:NetSales','jppfs_cor:OperatingRevenue1','jppfs_cor:OperatingIncome','jppfs_cor:Assets','jpigp_cor:OperatingProfitLossIFRS','jpigp_cor:AssetsIFRS']);
 const selected=rows.filter(r=>/^CurrentYear(?:Duration|Instant)_/.test(r['コンテキストID']||'')&&/ReportableSegment/i.test(r['コンテキストID']||'')&&!/NonConsolidatedMember/.test(r['コンテキストID'])&&allowed.has(r['要素ID']));
 const map=new Map();for(const r of selected){const key=JSON.stringify([r['要素ID'],r['コンテキストID'],r['ユニットID']]);const item=map.get(key)||{row:r,values:new Set()};item.values.add(r['値']);map.set(key,item);}
 return [...map.values()].map(({row,values})=>({...row,conflict:values.size>1}));
}
