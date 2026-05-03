import {
  AnnualReportDocument,
  SectionKind,
} from "@/integrations/brreg/annual-report-financials/document-model";

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

const FINANCIAL_KINDS: SectionKind[] = [
  "INCOME_STATEMENT",
  "BALANCE",
  "BALANCE_SHEET",
  "BALANCE_ASSETS",
  "BALANCE_EQUITY_LIABILITIES",
  "CASH_FLOW",
];
const EXCLUDE_KINDS: SectionKind[] = ["BOARD_REPORT", "AUDITOR_REPORT", "SIGNATURES", "COVER"];
const NOTES_KINDS: SectionKind[] = ["NOTES"];

// Only exclude a page when the section's confidence exceeds this threshold.
const EXCLUDE_CONFIDENCE_THRESHOLD = 0.4;

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
      reasons: ["No sections detected - using full extraction with no page filtering"],
    };
  }

  const financialSections = sections.filter((section) =>
    FINANCIAL_KINDS.includes(section.kind),
  );
  const excludeSections = sections.filter(
    (section) =>
      EXCLUDE_KINDS.includes(section.kind) &&
      section.confidenceScore >= EXCLUDE_CONFIDENCE_THRESHOLD,
  );
  const noteSections = sections.filter((section) => NOTES_KINDS.includes(section.kind));

  const financialPages = new Set(
    financialSections.flatMap((section) => section.pages.map((page) => page.pageNumber)),
  );
  const excludePageSet = new Set(
    excludeSections.flatMap((section) => section.pages.map((page) => page.pageNumber)),
  );
  const notePageSet = new Set(
    noteSections.flatMap((section) => section.pages.map((page) => page.pageNumber)),
  );

  // Boundary pages can carry both narrative and statement content; financial wins.
  for (const page of financialPages) {
    excludePageSet.delete(page);
  }
  for (const page of notePageSet) {
    excludePageSet.delete(page);
  }

  if (financialPages.size === 0) {
    reasons.push(
      "Skipped financial page filtering because no reliable financial statement pages were detected",
    );
    return {
      includePages: [],
      excludePages: excludePageSet,
      preferredIncomeStatementPages: [],
      preferredBalancePages: [],
      notePages: [...notePageSet].sort((a, b) => a - b),
      hasReliableHints: false,
      reasons,
    };
  }

  const candidatePages = new Set(doc.pages.map((page) => page.pageNumber));
  const remainingCandidatePages = [...candidatePages].filter(
    (pageNumber) => !excludePageSet.has(pageNumber),
  );
  if (candidatePages.size > 0 && remainingCandidatePages.length === 0) {
    reasons.push(
      "Skipped financial page filtering because exclusions would remove all candidate pages",
    );
    return {
      includePages: [...financialPages].sort((a, b) => a - b),
      excludePages: excludePageSet,
      preferredIncomeStatementPages: [],
      preferredBalancePages: [],
      notePages: [...notePageSet].sort((a, b) => a - b),
      hasReliableHints: false,
      reasons,
    };
  }

  const preferredIncomeStatementPages = sections
    .filter((section) => section.kind === "INCOME_STATEMENT")
    .flatMap((section) => section.pages.map((page) => page.pageNumber))
    .sort((a, b) => a - b);

  const preferredBalancePages = sections
    .filter((section) =>
      ["BALANCE", "BALANCE_SHEET", "BALANCE_ASSETS", "BALANCE_EQUITY_LIABILITIES"].includes(
        section.kind,
      ),
    )
    .flatMap((section) => section.pages.map((page) => page.pageNumber))
    .sort((a, b) => a - b);

  if (excludePageSet.size > 0) {
    const byKind = excludeSections
      .map((section) => `${section.kind}(pp.${section.startPage}-${section.endPage})`)
      .join(", ");
    reasons.push(
      `Excluding ${excludePageSet.size} page(s) from non-financial sections: ${byKind}`,
    );
  }
  reasons.push(`${financialPages.size} financial statement page(s) detected`);

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
