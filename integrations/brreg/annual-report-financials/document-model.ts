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
  recommendedRouteHint:
    | "TEXT_LAYER"
    | "OPENDATALOADER_LOCAL"
    | "OPENDATALOADER_HYBRID"
    | "FORCE_OCR"
    | "MANUAL_REVIEW"
    | "UNKNOWN";
  textLayerDensityScore: number;
  likelyImageOnlyPages: number[];
  financialStatementPageCount: number;
  financialStatementCandidatePages: number[];
  narrativeCandidatePages: number[];
  boardReportCandidatePages: number[];
  auditorReportCandidatePages: number[];
  notesCandidatePages: number[];
  qualityRisk: "LOW" | "MEDIUM" | "HIGH";
  parserRiskReasons: string[];
  extractionWarnings: string[];
};

export type AnnualReportDocument = {
  pages: AnnualReportPage[];
  sections: AnnualReportSection[];
  narratives: AnnualReportNarrativeSection[];
  diagnostics: AnnualReportDocumentDiagnostics;
};

export type StructuredDocumentArtifactPayload = {
  version: "annual-report-document-model-v1";
  filingId: string;
  extractionRunId: string | null;
  createdAt: string;
  structuredDocument: {
    pages: AnnualReportPage[];
    sections: Array<Omit<AnnualReportSection, "pages"> & { pageCount: number }>;
    narratives: Array<{
      kind: SectionKind;
      startPage: number;
      endPage: number;
      confidenceScore: number;
      subsectionCount: number;
      fullTextLength: number;
    }>;
    diagnostics: AnnualReportDocumentDiagnostics;
  };
};
