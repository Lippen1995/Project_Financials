import {
  ColumnAnchor,
  detectYearColumnAnchorsForPage,
  reconstructStatementRowsGeometryFirst,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import {
  PageConfidence,
  PageConfidenceDiagnosis,
} from "@/integrations/brreg/annual-report-financials/page-confidence";
import { StatementSectionType } from "@/server/financials/canonical-taxonomy";
import {
  AnnualReportParsedInputPage,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

// ─────────────────────────────────────────────────────────────────────────
// Self-correcting extraction loop — decision helpers
//
// One iteration, one branch: when a statement page is diagnosed as
// reconstruction-weak (high recognition confidence, low reconstruction
// confidence — the Canica failure mode), rebuild just that page's rows with
// the geometry-first branch and re-score. The orchestration around these
// helpers lives in the service: it composes assembleComputation and the
// consensus apply so the alternative is compared like-for-like against the
// current chosen computation. The loop only keeps the alternative when it
// strictly wins — it never trades for a draw or a worse result.
// ─────────────────────────────────────────────────────────────────────────

const RECOVERABLE_PAGE_TYPES = new Set<StatementSectionType>([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

export type RecoveryBranch = "geometry-first-reconstruction";

export type RecoveryCandidate = {
  pageNumber: number;
  branch: RecoveryBranch;
  diagnosis: PageConfidenceDiagnosis;
};

/**
 * Picks the pages the loop should attempt to rework: statement pages whose
 * per-page diagnosis was "reconstruction" — the loop's only branch today.
 * Pages with other weaknesses (recognition, classification) are out of scope
 * until those branches are built.
 */
export function selectRecoveryCandidates(
  pageConfidences: PageConfidence[],
): RecoveryCandidate[] {
  return pageConfidences
    .filter((page) => page.diagnosis === "reconstruction")
    .filter((page) => RECOVERABLE_PAGE_TYPES.has(page.sectionType))
    .map((page) => ({
      pageNumber: page.pageNumber,
      branch: "geometry-first-reconstruction" as const,
      diagnosis: page.diagnosis,
    }));
}

/**
 * Builds an alternative row set for the recovery attempt: rows from
 * non-candidate pages are carried as-is; the candidate pages have their rows
 * replaced with whatever the geometry-first branch produces. Returns the
 * number of rows the recovery branch actually contributed so the caller can
 * skip re-scoring when nothing was rebuilt.
 */
export function buildAlternativeRowsForRecovery(input: {
  originalRows: ReconstructedRow[];
  classifications: PageClassification[];
  parsedPages: AnnualReportParsedInputPage[];
  candidates: RecoveryCandidate[];
}): { rows: ReconstructedRow[]; recoveredRowCount: number } {
  const candidatePages = new Set(input.candidates.map((c) => c.pageNumber));
  const carriedRows = input.originalRows.filter(
    (row) => !candidatePages.has(row.pageNumber),
  );
  const classificationByPage = new Map(
    input.classifications.map((classification) => [
      classification.pageNumber,
      classification,
    ]),
  );
  const pageByNumber = new Map(
    input.parsedPages.map((page) => [page.pageNumber, page]),
  );

  // Pre-compute year-column anchors for every page so continuation pages
  // (e.g. "BALANSE — Egenkapital og gjeld" following "BALANSE — Eiendeler")
  // can inherit from the nearest preceding statement page that has a
  // header. Without this, the konsernbalanse continuation pages return 0
  // rows because they lack their own year header.
  const anchorsByPage = new Map<number, ColumnAnchor[]>();
  const sortedPages = [...input.parsedPages].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );
  for (const page of sortedPages) {
    anchorsByPage.set(page.pageNumber, detectYearColumnAnchorsForPage(page));
  }

  const findInheritedAnchors = (
    pageNumber: number,
  ): ColumnAnchor[] | undefined => {
    for (let pn = pageNumber - 1; pn >= 1; pn--) {
      const candidate = anchorsByPage.get(pn);
      if (candidate && candidate.length >= 2) return candidate;
      // Stop search if we hit a non-statement page — the inheritance is
      // only valid within a contiguous statement block, not across
      // unrelated sections.
      const cls = classificationByPage.get(pn);
      if (
        cls &&
        cls.type !== "STATUTORY_INCOME" &&
        cls.type !== "STATUTORY_BALANCE" &&
        cls.type !== "STATUTORY_BALANCE_CONTINUATION" &&
        cls.type !== "SUPPLEMENTARY_INCOME" &&
        cls.type !== "SUPPLEMENTARY_BALANCE"
      ) {
        return undefined;
      }
    }
    return undefined;
  };

  const recoveryRows: ReconstructedRow[] = [];
  for (const candidate of input.candidates) {
    const page = pageByNumber.get(candidate.pageNumber);
    const classification = classificationByPage.get(candidate.pageNumber);
    if (!page || !classification) continue;
    const own = anchorsByPage.get(candidate.pageNumber);
    const inherited =
      own && own.length >= 2 ? undefined : findInheritedAnchors(candidate.pageNumber);
    recoveryRows.push(
      ...reconstructStatementRowsGeometryFirst(page, classification, inherited),
    );
  }

  return {
    rows: [...carriedRows, ...recoveryRows].sort(
      (left, right) =>
        left.pageNumber - right.pageNumber || left.y - right.y,
    ),
    recoveredRowCount: recoveryRows.length,
  };
}

/**
 * PRIMARY row reconstruction: prefer geometry-first on every statement page,
 * falling back to the legacy rows only where geometry-first produces nothing.
 *
 * The accuracy eval proved geometry-first vastly outperforms the legacy
 * partition reconstruction on SCANNED statement pages (≈0.9% → ≈57% canonical
 * recall): the legacy path truncates and column-fuses values on OCR text.
 * Geometry-first requires real word coordinates, so on DIGITAL / embedded-text
 * pages (and ODL output without per-word geometry) it returns no rows and we
 * transparently keep the legacy reconstruction — making this a safe default,
 * not a scanned-only path. Continuation pages inherit year-column anchors from
 * the nearest preceding statement page (same rule as the recovery branch).
 */
export function buildStatementRowsPreferGeometryFirst(input: {
  parsedPages: AnnualReportParsedInputPage[];
  classifications: PageClassification[];
  legacyRows: ReconstructedRow[];
}): ReconstructedRow[] {
  const classificationByPage = new Map(
    input.classifications.map((c) => [c.pageNumber, c]),
  );
  const sortedPages = [...input.parsedPages].sort((a, b) => a.pageNumber - b.pageNumber);
  const anchorsByPage = new Map<number, ColumnAnchor[]>(
    sortedPages.map((p) => [p.pageNumber, detectYearColumnAnchorsForPage(p)]),
  );
  const findInheritedAnchors = (pageNumber: number): ColumnAnchor[] | undefined => {
    for (let pn = pageNumber - 1; pn >= 1; pn--) {
      const candidate = anchorsByPage.get(pn);
      if (candidate && candidate.length >= 2) return candidate;
      const cls = classificationByPage.get(pn);
      if (cls && !RECOVERABLE_PAGE_TYPES.has(cls.type)) return undefined;
    }
    return undefined;
  };

  const geometryRowsByPage = new Map<number, ReconstructedRow[]>();
  for (const page of sortedPages) {
    const cls = classificationByPage.get(page.pageNumber);
    if (!cls || !RECOVERABLE_PAGE_TYPES.has(cls.type)) continue;
    const own = anchorsByPage.get(page.pageNumber);
    const inherited = own && own.length >= 2 ? undefined : findInheritedAnchors(page.pageNumber);
    const rows = reconstructStatementRowsGeometryFirst(page, cls, inherited);
    if (rows.length > 0) geometryRowsByPage.set(page.pageNumber, rows);
  }

  // Drop SUPPLEMENTARY rows. These come from Del-2 — the company's OWN published
  // report appended after the statutory Del-1 forms — which the Del-1/Del-2
  // boundary demotes because it re-presents the same statements (usually in
  // thousands) and would duplicate Del-1's authoritative figures. They are never
  // a source of primary facts (a genuinely separate konsernregnskap, e.g.
  // REITAN's, is KEPT as STATUTORY by the second-block rule, not demoted). On the
  // image-heavy glossy Del-2 pages of large reports, OCR turns charts and prose
  // into gibberish rows ("uaddninsa" 3, "JIS IA" 39 — NORGESGRUPPEN's 236-page
  // report flooded the review with ~410 of them). Excluding them keeps both the
  // canonical facts and the review surface to the actual financial statements.
  const result = input.legacyRows.filter(
    (row) =>
      !geometryRowsByPage.has(row.pageNumber) &&
      !SUPPLEMENTARY_SECTION_TYPES.has(row.sectionType),
  );
  for (const rows of geometryRowsByPage.values()) {
    for (const row of rows) {
      if (!SUPPLEMENTARY_SECTION_TYPES.has(row.sectionType)) result.push(row);
    }
  }
  return result.sort((a, b) => a.pageNumber - b.pageNumber || a.y - b.y);
}

const SUPPLEMENTARY_SECTION_TYPES = new Set<StatementSectionType>([
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

/**
 * The loop keeps an alternative only when it strictly wins: publishable
 * outranks non-publishable, and within the same tier the alternative must
 * have a higher confidence score. A draw stays on the current computation —
 * the loop never trades the known result for an equivalent one.
 */
export function loopCandidateWins(
  candidate: { canPublishSnapshot: boolean; confidenceScore: number },
  current: { canPublishSnapshot: boolean; confidenceScore: number },
): boolean {
  const candidateTier = candidate.canPublishSnapshot ? 1 : 0;
  const currentTier = current.canPublishSnapshot ? 1 : 0;
  if (candidateTier !== currentTier) {
    return candidateTier > currentTier;
  }
  return candidate.confidenceScore > current.confidenceScore;
}
