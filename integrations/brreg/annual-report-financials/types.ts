import {
  CanonicalMetricKey,
  StatementSectionType,
} from "@/integrations/brreg/annual-report-financials/taxonomy";

export type AnnualReportUnitScale = 1 | 1000;

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

export type PageClassification = {
  pageNumber: number;
  type: StatementSectionType;
  confidence: number;
  unitScale: AnnualReportUnitScale | null;
  unitScaleConfidence: number;
  hasConflictingUnitSignals: boolean;
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
};

export type CanonicalFactCandidate = {
  fiscalYear: number;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "NOTE";
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
};
