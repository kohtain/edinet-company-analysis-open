/** Conservative EDINET duplicate filing reconciliation.
 *
 * Two historical dated index snapshots can contain the same docID but
 * different display/order/edit metadata. Selection relies on stable identity,
 * period, submission time, parent, CSV flag and withdrawal/disclosure status.
 *
 * Ignore exactly the four fields observed to vary in the 2026-10-31 full
 * 400-day scan. Any OTHER mismatch is a hard stop, not a heuristic choice.
 * Never log filing IDs, API keys, source rows or financial amounts.
 */
export const PRESENTATION_ONLY_EDINET_FIELDS = Object.freeze([
  "seqNumber", "docDescription", "opeDateTime", "docInfoEditStatus",
]);
const excluded = new Set(PRESENTATION_ONLY_EDINET_FIELDS);

function stableMetadata(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("invalid_edinet_index_document");
  }
  return JSON.stringify(Object.entries(document)
    .filter(([key]) => !excluded.has(key))
    .sort(([a], [b]) => a.localeCompare(b)));
}

export function reconcileDuplicateEdinetDocument(prior, incoming) {
  if (typeof prior?.docID !== "string" || prior.docID !== incoming?.docID) {
    throw new Error("conflicting_edinet_document_identity");
  }
  if (stableMetadata(prior) !== stableMetadata(incoming)) {
    throw new Error("inconsistent_document_across_dates_material");
  }
  // First complete source snapshot is retained; presentation fields are
  // unused by the latest annual-report policy and never merged into selection.
  return prior;
}
