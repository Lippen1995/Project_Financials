export type SectionKind =
  | "BOARD_REPORT"
  | "AUDITOR_REPORT"
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "NOTES"
  | "SIGNATURES"
  | "UNKNOWN";

export type AnnualReportPage = {
  pageNumber: number;
  rawText: string;
  normalizedText: string;
  charCount: number;
};

export type SectionSignal = {
  keyword: string;
  weight: number;
  offset: number;
};

export type AnnualReportSection = {
  kind: SectionKind;
  startPage: number;
  endPage: number;
  pages: AnnualReportPage[];
  confidenceScore: number;
  matchedSignals: SectionSignal[];
};

export type AnnualReportNarrativeSection = AnnualReportSection & {
  fullText: string;
  subsections: Array<{ heading: string; text: string }>;
};

export type AnnualReportDocumentDiagnostics = {
  pageCount: number;
  sectionsFound: number;
  sectionKinds: SectionKind[];
  missingExpectedSections: SectionKind[];
  recommendedRouteHint: "OCR" | "DIGITAL" | "UNKNOWN";
};

export type AnnualReportDocument = {
  pages: AnnualReportPage[];
  sections: AnnualReportSection[];
  narratives: AnnualReportNarrativeSection[];
  diagnostics: AnnualReportDocumentDiagnostics;
};
