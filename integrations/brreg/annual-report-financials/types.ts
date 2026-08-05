import {
  CanonicalMetricKey,
  LiabilitySection,
  ReportingCurrency,
  StatementScope,
  StatementSectionType,
} from "@/server/financials/canonical-taxonomy";
import { AnnualReportDocument, AnnualReportDocumentDiagnostics } from "@/integrations/brreg/annual-report-financials/document-model";

export type AnnualReportUnitScale = 1 | 1000 | 1_000_000;

export type UnitScaleSignal = {
  unitScale: AnnualReportUnitScale;
  confidence: number;
  source: "PAGE_HEADER" | "PAGE_BODY" | "NOTE_DECLARATION";
  matchedText: string;
};

export type UnitScaleDetectionResult = {
  unitScale: AnnualReportUnitScale | null;
  confidence: number;
  reason: string | null;
  conflictingSignals: boolean;
  signals: UnitScaleSignal[];
};

export type ExtractedWord = {
  text: string;
  normalizedText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  lineNumber?: number;
};

export type ExtractedLine = {
  text: string;
  normalizedText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  words: ExtractedWord[];
};

export type PageTextLayer = {
  pageNumber: number;
  text: string;
  normalizedText: string;
  lines: ExtractedLine[];
  hasEmbeddedText: boolean;
};

export type AnnualReportGeometryBox = {
  left: number;
  bottom: number;
  right: number;
  top: number;
};

export type AnnualReportElementSource = {
  engine: "LEGACY" | "OPENDATALOADER";
  engineMode: "legacy" | "local" | "hybrid";
  sourceElementId?: string | null;
  sourceRawType?: string | null;
  order?: number | null;
};

export type AnnualReportTableCell = {
  id: string;
  rowIndex: number;
  columnIndex: number;
  text: string;
  normalizedText: string;
  bbox: AnnualReportGeometryBox | null;
  isNumeric: boolean;
  numericValue: number | null;
  role: "label" | "note" | "year_header" | "value" | "text";
  source: AnnualReportElementSource;
};

export type AnnualReportTableRow = {
  id: string;
  rowIndex: number;
  text: string;
  normalizedText: string;
  bbox: AnnualReportGeometryBox | null;
  cells: AnnualReportTableCell[];
  source: AnnualReportElementSource;
};

export type AnnualReportTable = {
  id: string;
  pageNumber: number;
  bbox: AnnualReportGeometryBox | null;
  rowCount: number;
  columnCount: number;
  rows: AnnualReportTableRow[];
  source: AnnualReportElementSource;
};

export type AnnualReportPageBlock = {
  id: string;
  kind:
    | "heading"
    | "paragraph"
    | "table"
    | "list"
    | "picture"
    | "caption"
    | "formula"
    | "other";
  rawType: string;
  text: string;
  normalizedText: string;
  bbox: AnnualReportGeometryBox | null;
  headingLevel?: number | null;
  table?: AnnualReportTable | null;
  metadata?: Record<string, unknown>;
  source: AnnualReportElementSource;
};

export type AnnualReportParsedPage = PageTextLayer & {
  blocks: AnnualReportPageBlock[];
  tables: AnnualReportTable[];
  source: AnnualReportElementSource;
  metadata?: Record<string, unknown>;
};

export type AnnualReportParsedInputPage = PageTextLayer | AnnualReportParsedPage;

export type PageClassification = {
  pageNumber: number;
  type: StatementSectionType;
  confidence: number;
  unitScale: AnnualReportUnitScale | null;
  unitScaleConfidence: number;
  hasConflictingUnitSignals: boolean;
  /** Which set of accounts this page belongs to (konsern vs selskap). */
  statementScope: StatementScope;
  /** True when this page itself carried an explicit scope heading. */
  hasExplicitScopeSignal: boolean;
  /** Reporting currency detected for this page (defaults to NOK). */
  reportingCurrency: ReportingCurrency;
  declaredYears: number[];
  yearHeaderYears: number[];
  heading: string | null;
  numericRowCount: number;
  tableLike: boolean;
  reasons: string[];
};

export type ReconstructedValueCell = {
  value: number;
  columnIndex: number;
  x: number;
};

export type ReconstructedRow = {
  pageNumber: number;
  sectionType: StatementSectionType;
  unitScale: AnnualReportUnitScale;
  label: string;
  normalizedLabel: string;
  noteReference: string | null;
  rowText: string;
  y: number;
  confidence: number;
  values: ReconstructedValueCell[];
  /** Liability sub-section the row sits in (long-term vs current), when the
   *  reconstructor could infer it from a preceding "Langsiktig/Kortsiktig
   *  gjeld" header. Used to disambiguate maturity-split components. */
  liabilitySection?: LiabilitySection | null;
};

export type CanonicalFactCandidate = {
  fiscalYear: number;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE";
  /** Which set of accounts this fact belongs to (konsern vs selskap). */
  statementScope: StatementScope;
  metricKey: CanonicalMetricKey;
  rawLabel: string;
  normalizedLabel: string;
  value: number;
  currency: string;
  unitScale: AnnualReportUnitScale;
  sourcePage: number;
  sourceSection: StatementSectionType;
  sourceRowText: string;
  noteReference: string | null;
  confidenceScore: number;
  precedence: "MACHINE_READABLE" | "STATUTORY_NOK" | "SUPPLEMENTARY_NOK_THOUSANDS" | "NOTE_DERIVED";
  isDerived: boolean;
  rawPayload?: Record<string, unknown>;
};

export type ValidationIssueDraft = {
  severity: "INFO" | "WARNING" | "ERROR";
  ruleCode: string;
  message: string;
  expectedValue?: number | null;
  actualValue?: number | null;
  context?: Record<string, unknown>;
};

export type PreflightResult = {
  pageCount: number;
  hasTextLayer: boolean;
  hasReliableTextLayer: boolean;
  parsedPages: PageTextLayer[];
  diagnostics?: AnnualReportDocumentDiagnostics;
  recommendedRouteHint?: AnnualReportDocumentDiagnostics["recommendedRouteHint"];
  structuredDocument?: AnnualReportDocument;
};

export type AnnualReportOcrRegionFailure = {
  pageNumber: number;
  stage: "pre_ocr_validation" | "recognition";
  category:
    | "tiny_crop"
    | "invalid_crop"
    | "invalid_image_buffer"
    | "ocr_failure"
    | "ocr_quality_too_weak";
  message: string;
};

export type AnnualReportOcrDiagnostics = {
  minWidthPx: number;
  minHeightPx: number;
  minAreaPx: number;
  renderScale: number;
  preprocessingMode: string;
  pageCount: number;
  imageRegionCount: number;
  tinyCropSkippedCount: number;
  invalidCropCount: number;
  ocrAttemptCount: number;
  ocrFailureCount: number;
  usableOcrRegionCount: number;
  usableLineCount: number;
  rowCandidateCount: number;
  yearHeaderCandidateCount: number;
  statementLikePageCount: number;
  reconstructedNumericCellCount: number;
  mergedNumericTokenCount: number;
  rowsWithAssignedYearColumns: number;
  ambiguousRowCount: number;
  pageLevelOcrFallbackCount: number;
  manualReviewDueToOcrQualityCount: number;
  suppressedFailureMessages: Array<{
    message: string;
    count: number;
  }>;
  regionFailures: AnnualReportOcrRegionFailure[];
};

export type AnnualReportOcrExtractionResult = {
  pages: AnnualReportParsedInputPage[];
  diagnostics: AnnualReportOcrDiagnostics;
};
