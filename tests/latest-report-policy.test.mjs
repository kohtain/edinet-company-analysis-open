import test from "node:test";
import assert from "node:assert/strict";
import { selectLatestAnnualReport, buildLatestReportCoverage } from "../lib/latest-report-policy.mjs";

function filing(docID, code, periodEnd, submitted, csvFlag = "1", extra = {}) {
  return { docID, secCode: code + "0", docTypeCode: "120",
    periodEnd, submitDateTime: submitted, csvFlag, ...extra };
}
function correction(docID, code, parentDocID, submitted, extra = {}) {
  return { docID, secCode: code + "0", docTypeCode: "130",
    parentDocID, submitDateTime: submitted, ...extra };
}
const d2025 = filing("S100AAAA","7203","2025-03-31","2025-06-10");
const d2026 = filing("S100BBBB","7203","2026-03-31","2026-06-10");

test("latest reporting period wins, even when the older submission is later", () => {
  const olderAmendedLate = filing("S100CCCC","7203","2025-03-31","2026-10-01");
  const result = selectLatestAnnualReport([d2026, olderAmendedLate], "7203");
  assert.equal(result.base.docId, "S100BBBB");
  assert.equal(result.status, "ready_for_extraction");
  assert.equal(result.publishable, true);
});

test("latest report without CSV is never replaced by the older CSV filing", () => {
  const latestWithoutCsv = filing("S100BBBB","7203","2026-03-31","2026-06-10","0");
  const result = selectLatestAnnualReport([d2025, latestWithoutCsv], "7203");
  assert.equal(result.base.docId, "S100BBBB");
  assert.equal(result.baseCsvDocId, null);
  assert.equal(result.status, "csv_unavailable");
  assert.equal(result.publishable, false);
});

test("linked correction chains require review and retain the original as base", () => {
  const revisions = [
    correction("S100CCCC","7203","S100BBBB","2026-07-01"),
    correction("S100DDDD","7203","S100CCCC","2026-08-01"),
  ];
  const result = selectLatestAnnualReport([d2026, ...revisions], "7203");
  assert.equal(result.baseCsvDocId, "S100BBBB");
  assert.deepEqual(result.corrections.map(x => x.docId), ["S100CCCC","S100DDDD"]);
  assert.equal(result.status, "correction_review_required");
  assert.equal(result.publishable, false);
});

test("old, unrelated corrections do not contaminate the latest report", () => {
  const result = selectLatestAnnualReport([
    d2026, correction("S100CCCC","7203","S100AAAA","2025-10-01"),
  ], "7203");
  assert.equal(result.status, "ready_for_extraction");
});

test("unknown ordering, conflicting latest submissions, and unlinked recent corrections do not publish", () => {
  const missingDate = filing("S100CCCC","7203",null,"2026-07-01");
  const ambiguous = filing("S100DDDD","7203","2026-03-31","2026-06-10");
  assert.equal(selectLatestAnnualReport([d2026,missingDate],"7203").status,"review_required");
  assert.equal(selectLatestAnnualReport([d2026,ambiguous],"7203").status,"review_required");
  assert.equal(selectLatestAnnualReport([
    d2026,correction("S100CCCC","7203","S100ZZZZ","2026-07-01"),
  ],"7203").status,"review_required");
});

test("exclude withdrawn/undisclosed and handle indexed D1 fields", () => {
  const withdrawn = filing("S100CCCC","7203","2027-03-31","2027-06-10","1",{withdrawalStatus:"1"});
  const fromD1 = { doc_id: "S100BBBB", code: "7203", doc_type_code: "120",
    period_end: "2026-03-31", submitted: "2026-06-10",
    active: 1, csv_available: 1 };
  assert.equal(selectLatestAnnualReport([withdrawn,fromD1],"7203").base.docId,"S100BBBB");
});

test("coverage counts missing companies separately; does not mislabel them as no filing", () => {
  const result=buildLatestReportCoverage([d2026],["7203","8267"]);
  assert.deepEqual(result.counts,{ready_for_extraction:1,no_original_in_index:1});
  assert.equal(result.total,2);
  assert.throws(()=>selectLatestAnnualReport([],"INVALID"),/invalid_company_code/);
});

test("offline audit exports full coverage, explicitly marks index verification as pending", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "edinet-audit-"));
  try {
    const documentsPath = join(dir, "docs.jsonl");
    const companiesPath = join(dir, "companies.json");
    const outputPath = join(dir, "audit.json");
    writeFileSync(documentsPath, [d2026, d2025].map(JSON.stringify).join("\n") + "\n");
    writeFileSync(companiesPath, JSON.stringify([{ code:"7203" },{ code:"8267" }]));
    const result = spawnSync(process.execPath, [
      "scripts/audit-latest-report.mjs",
      "--input=" + documentsPath, "--companies=" + companiesPath,
      "--output=" + outputPath,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const audit = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(audit.total, 2);
    assert.equal(audit.indexCoverageVerified, false);
    assert.equal(audit.companies.find(x => x.code === "7203").latestDocId, "S100BBBB");
    assert.equal(audit.companies.find(x => x.code === "8267").status, "no_original_in_index");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
