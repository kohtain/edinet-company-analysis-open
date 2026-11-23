import {documentSetting, periodPrefix, reportingScope} from './dashboard.mjs';
import {displayFact, evidenceColumns, evidenceRow, metrics, moneyUnit, people, periodFor, researchFact} from './research.mjs';

export const comparisonMetrics = [...metrics, ...people];
const periods = ['current','prior','prior2','prior3','prior4'];
export function comparisonSelection(params, fallback) {
 const codes = [...new Set((params.get('compare') ?? fallback ?? '').split(',')
  .filter(code => /^\d{3}[0-9A-Z]$/.test(code)))].slice(0,5);
 const requested=params.get('compareUnit');
 const unit = requested === '百万円' ? '百万円' : ['10億円','億円'].includes(requested) ? '10億円' : '自動';
 const value = params.get('compareYear') || '';
 const year = /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0,10) === value ? value : '';
 return {codes,unit,year};
}
export function comparisonPeriods(report) {
 if (!report || report.status) return [];
 return periods.flatMap(key => {
  const dates = periodFor(report.rows ?? [],periodPrefix[key]+'Duration',report.periodEnd,report.id);
  return dates ? [{key,dates}] : [];
 });
}
export function comparisonCell(report, code, key, year='', unit='自動', periodKey) {
 const period = periodKey !== undefined ? periodKey :
  year ? comparisonPeriods(report).find(p => p.dates.end === year)?.key : 'current';
 const fact = report?.status ? {status:report.status} : !report || !period ?
  {status:'needs_review'} : researchFact(report,code,key,period);
 return {fact,display:displayFact(fact,key,unit==='自動'?moneyUnit(report?.rows??[]):unit)};
}
export function comparisonContext(report) {
 return {standard:documentSetting(report?.rows ?? [],'AccountingStandardsDEI') || '',
  scope:reportingScope(report?.rows ?? []) || ''};
}
// Flags describe visible differences, never certify equivalence or rank values.
export function comparisonWarnings(cells, contexts) {
 const reported = cells.map((cell,i) => ({fact:cell.fact,context:contexts[i]}))
  .filter(({fact}) => fact.status === 'reported');
 const flags = [];
 const different = values => new Set(values.filter(Boolean)).size > 1;
 if (reported.some(({fact}) => !fact.period?.end || !fact.scope || !fact.unit || !fact.sourceId)) flags.push('期間・範囲・単位・出典の未確認あり');
 if (different(reported.map(({fact}) => JSON.stringify(fact.period && [fact.period.start ?? '',fact.period.end])))) flags.push('対象期間・時点が異なる');
 if (different(reported.map(({fact}) => fact.scope))) flags.push('連結・個別の範囲が異なる');
 if (different(reported.map(({fact}) => fact.unit))) flags.push('原単位が異なる');
 if (reported.some(({context}) => !context?.standard)) flags.push('会計基準の未確認あり');
 if (different(reported.map(({context}) => context?.standard))) flags.push('会計基準が異なる');
 if (different(reported.map(({fact}) => fact.tag))) flags.push('開示タグが異なる・定義を要確認');
 return flags;
}
export function comparisonExport(columns, year, unit) {
 if (!unit || unit==='自動') unit=moneyUnit(columns.flatMap(column=>column.report?.rows??[]));
 const contexts = columns.map(column => comparisonContext(column.report));
 const periodKeyByColumn = columns.map(column =>
  year ? (comparisonPeriods(column.report).find(p => p.dates.end === year)?.key ?? null) : 'current');
 return [[...evidenceColumns,'企業名','会計基準','指定期末（空欄は各社当期）','比較上の確認事項'],
  ...comparisonMetrics.flatMap(([key,label]) => {
   const cells = columns.map((column,i) => comparisonCell(column.report,column.code,key,year,unit,periodKeyByColumn[i]));
   const warnings = comparisonWarnings(cells,contexts).join(' / ');
   return columns.map((column,i) => [...evidenceRow(column.code,label,cells[i].fact,cells[i].display),
    column.name,contexts[i].standard,year,
    [column.error ? '読込失敗' : !column.report ? '未読込' : '',warnings].filter(Boolean).join(' / ')]);
  })];
}
