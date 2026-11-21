/**
 * Pure document-selection policy for the new, external EDINET acquisition
 * pipeline. It deliberately does not mutate the existing Sites D1/R2 tables.
 *
 * Important distinction: this selects the newest annual filing by reporting
 * period, independently of CSV availability. Corrections are linked by their
 * parent document IDs, not substituted as complete annual filings.
 */
function normalize(row, code, edinetCode) {
  if (!row || typeof row !== "object") return null;
  const secCode = row.secCode;
  const rowCode = row.code ?? (typeof secCode === "string" && secCode.endsWith("0") ? secCode.slice(0, -1) : "");
  // Historical filings can retain a null/all-zero security code after IPO.
  // Only an exact FSA EDINET-code mapping can rescue those records. A real,
  // different security code or explicit D1 code is never overwritten.
  const missingSecurityCode = secCode == null || secCode === '00000';
  if (rowCode !== code && !(row.code == null && missingSecurityCode &&
      typeof edinetCode === 'string' && row.edinetCode === edinetCode)) return null;
  if (rowCode === code && typeof edinetCode === 'string' &&
      row.edinetCode != null && row.edinetCode !== edinetCode)
    throw new Error('issuer_security_code_conflict');
  if (row.active === 0 || row.active === false ||
      (row.withdrawalStatus != null && row.withdrawalStatus !== "0") ||
      (row.disclosureStatus != null && row.disclosureStatus !== "0")) return null;
  const docType = String(row.doc_type_code ?? row.docTypeCode ?? "");
  if (!["120", "130"].includes(docType)) return null;
  const docId = row.doc_id ?? row.docID;
  if (typeof docId !== "string" || !/^S[A-Z0-9]{7}$/.test(docId)) return null;
  const periodEnd = row.period_end ?? row.periodEnd ?? null;
  const submitted = row.submitted ?? row.submitDateTime ?? null;
  const csvValue = row.csv_available ?? row.csvFlag;
  const parentDocId = row.parent_doc_id ?? row.parentDocID ?? null;
  return {
    docId,
    docType,
    periodEnd: typeof periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ? periodEnd : null,
    submitted: typeof submitted === "string" && /^\d{4}-\d{2}-\d{2}/.test(submitted) ? submitted : null,
    csvAvailable: csvValue === 1 || csvValue === "1" || csvValue === true,
    parentDocId: typeof parentDocId === "string" ? parentDocId : null,
  };
}

const newest = (a, b) =>
  (b.periodEnd ?? "").localeCompare(a.periodEnd ?? "") ||
  (b.submitted ?? "").localeCompare(a.submitted ?? "") ||
  b.docId.localeCompare(a.docId);
const bySubmission = (a, b) =>
  (a.submitted ?? "").localeCompare(b.submitted ?? "") || a.docId.localeCompare(b.docId);

export function selectLatestAnnualReport(documents, code, {edinetCode} = {}) {
  if (!/^\d{3}[0-9A-Z]$/.test(code)) throw new Error("invalid_company_code");
  if (!Array.isArray(documents)) throw new Error("invalid_document_list");
  if (edinetCode !== undefined && edinetCode !== null && !/^E\d{5}$/.test(edinetCode))
    throw new Error('invalid_issuer_edinet_code');
  const matching = documents.map(d => normalize(d, code, edinetCode)).filter(Boolean);
  const originals = matching.filter(d => d.docType === "120");
  if (!originals.length) {
    return { code, status: edinetCode === null ? 'review_required' : 'no_original_in_index', base: null, corrections: [],
      baseCsvDocId: null, publishable: false, reasons: edinetCode === null
        ? ['no_original_in_index','issuer_identity_unverified'] : ['no_original_in_index'] };
  }
  const rankable = originals.filter(d => d.periodEnd && d.submitted).sort(newest);
  const unranked = originals.length - rankable.length;
  if (!rankable.length) {
    return { code, status: "review_required", base: null, corrections: [],
      baseCsvDocId: null, publishable: false, reasons: ["missing_period_or_submission"] };
  }
  const base = rankable[0];
  const reasons = [];
  if (unranked) reasons.push("missing_period_or_submission");
  if (rankable[1] && rankable[1].periodEnd === base.periodEnd &&
      rankable[1].submitted === base.submitted) reasons.push("ambiguous_latest");
  const candidates = matching.filter(d => d.docType === "130");
  const linked = new Set([base.docId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const correction of candidates) {
      if (correction.parentDocId && linked.has(correction.parentDocId) &&
          !linked.has(correction.docId)) {
        linked.add(correction.docId);
        changed = true;
      }
    }
  }
  const corrections = candidates.filter(d => linked.has(d.docId)).sort(bySubmission);
  if (!base.csvAvailable) reasons.push("latest_csv_unavailable");
  if (corrections.length) reasons.push("correction_review_required");

  // A later correction with an unknown parent may concern the latest filing.
  // Do not silently claim that the original financial statements are final.
  const unlinkedRecentCorrections = candidates.filter(d => !linked.has(d.docId) &&
    (!d.submitted || d.submitted >= base.submitted));
  if (unlinkedRecentCorrections.length) reasons.push("unlinked_recent_correction");

  const status = reasons.includes("missing_period_or_submission") ||
    reasons.includes("ambiguous_latest") ||
    reasons.includes("unlinked_recent_correction")
    ? "review_required"
    : reasons.includes("latest_csv_unavailable")
      ? "csv_unavailable"
      : reasons.includes("correction_review_required")
        ? "correction_review_required"
        : "ready_for_extraction";
  return {
    code, status, base, corrections,
    baseCsvDocId: base.csvAvailable ? base.docId : null,
    publishable: status === "ready_for_extraction",
    reasons,
  };
}

export function buildLatestReportCoverage(documents, companyCodes, {edinetCodes} = {}) {
  if (!Array.isArray(companyCodes)) throw new Error("invalid_company_codes");
  const rows = companyCodes.map(code => selectLatestAnnualReport(documents, code,
    {edinetCode:edinetCodes?.[code]}));
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { total: rows.length, counts, rows };
}

