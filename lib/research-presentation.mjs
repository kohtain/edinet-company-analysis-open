import {integer, isYen, reportingScope, rowsIndex, uniqueFact} from './dashboard.mjs';
import {pdfUrl, periodFor, withEvidence} from './research.mjs';

export function reportView(report, partial = false) {
 const status = report.status === 'review_required' ? report.status :
  report.correction || report.correctionDocIds?.length ?
  'correction_review_required' : partial ? report.status || 'review_required' : undefined;
 const id = report.latestDocId ?? report.baseId ?? (report.correction ? undefined : report.id);
 const correctionIds = report.correctionDocIds ?? (report.correction ? [report.id] : []);
 return {
  ...report, id, status, rows: status ? [] : report.rows,
  documents: [
   ...(pdfUrl(id) ? [{id, label:status === 'review_required' ? '有価証券報告書候補' : '有価証券報告書'}] : []),
   ...[...new Set(correctionIds)].filter(id => pdfUrl(id)).map(id => ({id, label:'訂正報告書'})),
  ],
 };
}

// The names and metric definitions below were checked in the 2026-03 Toyota
// filing (PDF page 149, note 4). Other versions require their own review.
const toyotaMembers = [
 ['jpcrp030000-asr_E02144-000AutomotiveReportableSegmentMember','自動車'],
 ['jpcrp030000-asr_E02144-000FinancialServicesReportableSegmentMember','金融'],
 ['OtherReportableSegmentsMember','その他'],
];
const toyotaRevenue = 'jpcrp030000-asr_E02144-000:OperatingRevenueFromExternalCustomersIFRS';
export function reviewedSegments(report, code, period) {
 if (code !== '7203' || report.id !== 'S100Y8NY' || period !== 'current' ||
     report.status || report.correction || reportingScope(report.rows ?? []) !== '連結') return [];
 const rows = report.rows ?? [];
 const byElement = rowsIndex(rows).byElement;
 const currentPeriod = periodFor(rows,'CurrentYearDuration',report.periodEnd);
 const get = (tag, context) => {
  const bucket = byElement.get(tag) ?? [];
  const fact = uniqueFact(bucket.filter(row => row['コンテキストID'] === context &&
    isYen(row) && row['連結・個別'] !== '個別'), '連結');
  if (fact.status !== 'reported') return fact;
  const evidence = withEvidence(report,fact,currentPeriod);
  return evidence.period?.start && evidence.sourceId && evidence.docId === report.id && integer.test(evidence.value) ?
   evidence : {status:'needs_review'};
 };
 const total = get(toyotaRevenue,'CurrentYearDuration');
 return toyotaMembers.map(([member,name]) => {
  const context = 'CurrentYearDuration_'+member;
  const sales = get(toyotaRevenue,context);
  const profit = get('jpigp_cor:OperatingProfitLossIFRS',context);
  const denominator = total.status === 'reported' ? BigInt(total.value) : 0n;
  const numerator = sales.status === 'reported' ? BigInt(sales.value) : -1n;
  const share = denominator > 0n && numerator >= 0n && numerator <= denominator ?
   Number((numerator*1000n+denominator/2n)/denominator)/10 : null;
  return {name,sales,profit,share,total};
 });
}
export function narrativeFact(report, concept, period) {
 if (period !== 'current') return {status:'unavailable'};
 const rows = report.rows ?? [];
 const bucket = rowsIndex(rows).byElement.get('jpcrp_cor:'+concept) ?? [];
 const candidates = bucket.filter(row =>
  (row['コンテキストID'] === 'FilingDateInstant' || row['コンテキストID'] === 'CurrentYearDuration') && row['値']?.trim());
 if (!candidates.length) return {status:'unavailable'};
 if (candidates.length !== 1) return {status:'conflict'};
 const row = candidates[0];
 const dates = periodFor(rows,'CurrentYearDuration',report.periodEnd);
 const fact = withEvidence(report,{
  status:'reported',value:row['値'],tag:row['要素ID'],context:row['コンテキストID'],
  file:row.sourceFile,docId:row.sourceDocId,scope:'提出書類の記述',
 },dates);
 return fact.sourceId && fact.docId === report.id ? fact : {status:'needs_review'};
}

const safeTags = new Set('div p br h1 h2 h3 h4 h5 h6 ul ol li table caption thead tbody tfoot tr th td strong b em i span sub sup blockquote pre dl dt dd'.split(' '));
const dropTags = new Set('script style iframe object embed svg math template form noscript'.split(' '));
export function safeNarrativeHtml(document, value) {
 const input = document.createElement('template');
 input.innerHTML = value;
 const output = document.createElement('div');
 function copy(node, parent) {
  if (node.nodeType === 3) {
   parent.append(document.createTextNode(node.textContent ?? ''));
   return;
  }
  const name = node.localName;
  if (!name || dropTags.has(name) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
  const element = safeTags.has(name) ? document.createElement(name) : parent;
  if (element !== parent) {
   if (name === 'td' || name === 'th') {
    for (const attribute of ['colspan','rowspan']) {
     const value = node.getAttribute(attribute);
     if (/^[1-9][0-9]?$/.test(value ?? '')) element.setAttribute(attribute,value);
    }
   }
   parent.append(element);
  }
  for (const child of node.childNodes) copy(child,element);
 }
 for (const child of input.content.childNodes) copy(child,output);
 return output.innerHTML;
}
