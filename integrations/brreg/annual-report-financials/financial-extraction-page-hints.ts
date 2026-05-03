import {
  AnnualReportDocument,
  SectionKind,
} from "@/integrations/brreg/annual-report-financials/document-model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FinancialExtractionPageHints = {
  /** Pages that should be prioritized for financial extraction. */
  includePages: number[];
  /** Pages that are confidently non-financial and should be excluded. */
  excludePages: Set<number>;
  preferredIncomeStatementPages: number[];
  preferredBalancePages: number[];
  notePages: number[];
  /** True when we have high-confidence section data to act on. */
  hasReliableHints: boolean;
  reasons: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FINANCIAL_KINDS: SectionKind[] = ["INCOME_STATEMENT", "BALANCE_SHEET"];
const EXCLUDE_KINDS: SectionKind[] = ["BOARD_REPORT", "AUDITOR_REPORT", "SIGNATURES"];
const NOTES_KINDS: SectionKind[] = ["NOTES"];

// Only exclude a page when the section's confidence exceeds this threshold.
const EXCLUDE_CONFIDENCE_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

export function getFinancialExtractionPageHints(
  doc: AnnualReportDocument,
): FinancialExtractionPageHints {
  const reasons: string[] = [];
  const sections = doc.sections;

  if (sections.length === 0) {
    return {
      includePages: [],
      excludePages: new Set(),
      preferredIncomeStatementPages: [],
      preferredBalancePages: [],
      notePages: [],
      hasReliableHints: false,
      reasons: ["No sections detected — using full extraction with no page filtering"],
    };
  }

  const financialSections = sections.filter((s) => FINANCIAL_KINDS.includes(s.kind));
  const excludeSections = sections.filter(
    (s) =>
      EXCLUDE_KINDS.includes(s.kind) && s.confidenceScore >= EXCLUDE_CONFIDENCE_THRESHOLD,
  );
  const noteSections = sections.filter((s) => NOTES_KINDS.includes(s.kind));

  // Candidate page sets
  const financialPages = new Set(
    financialSections.flatMap((s) => s.pages.map((p) => p.pageNumber)),
  );
  const excludePageSet = new Set(
    excludeSections.flatMap((s) => s.pages.map((p) => p.pageNumber)),
  );
  const notePageSet = new Set(
    noteSections.flatMap((s) => s.pages.map((p) => p.pageNumber)),
  );

  // Pages that appear in both financial and exclude sets — keep financial wins.
  // A page might be a transition page; do not exclude it if it has any financial content.
  for (const page of financialPages) {
    excludePageSet.delete(page);
  }
  for (const page of notePageSet) {
    excludePageSet.delete(page);
  }

  // Conservative fallback: if we have no reliable financial pages, do not filter.
  const hasReliableHints = financialPages.size > 0 || excludePageSet.size > 0;
  if (!hasReliableHints) {
    reasons.push(
      "No reliable financial or narrative sections found — falling back to full extraction",
    );
    return {
      includePages: [],
      excludePages: new Set(),
      preferredIncomeStatementPages: [],
      preferredBalancePages: [],
      notePages: [...notePageSet].sort((a, b) => a - b),
      hasReliableHints: false,
      reasons,
    };
  }

  // Preferred pages per statement type
  const preferredIncomeStatementPages = sections
    .filter((s) => s.kind === "INCOME_STATEMENT")
    .flatMap((s) => s.pages.map((p) => p.pageNumber))
    .sort((a, b) => a - b);

  const preferredBalancePages = sections
    .filter((s) => s.kind === "BALANCE_SHEET")
    .flatMap((s) => s.pages.map((p) => p.pageNumber))
    .sort((a, b) => a - b);

  // Logging
  if (excludePageSet.size > 0) {
    const byKind = excludeSections
      .map((s) => `${s.kind}(pp.${s.startPage}-${s.endPage})`)
      .join(", ");
    reasons.push(
      `Excluding ${excludePageSet.size} page(s) from non-financial sections: ${byKind}`,
    );
  }
  if (financialPages.size > 0) {
    reasons.push(
      `${financialPages.size} financial statement page(s) detected`,
    );
  }

  return {
    includePages: [...financialPages].sort((a, b) => a - b),
    excludePages: excludePageSet,
    preferredIncomeStatementPages,
    preferredBalancePages,
    notePages: [...notePageSet].sort((a, b) => a - b),
    hasReliableHints: true,
    reasons,
  };
}
