import {
  AnnualReportPageBlock,
  AnnualReportParsedPage,
  AnnualReportTable,
  PreflightResult,
} from "@/integrations/brreg/annual-report-financials/types";

export type OpenDataLoaderRequestedMode = "local" | "hybrid" | "auto";
export type OpenDataLoaderExecutionMode = "local" | "hybrid";

export type OpenDataLoaderResolvedConfig = {
  enabled: boolean;
  mode: OpenDataLoaderRequestedMode;
  hybridBackend: string;
  hybridUrl: string | null;
  forceOcr: boolean;
  useStructTree: boolean;
  timeoutMs: number;
  dualRun: boolean;
  storeAnnotatedPdf: boolean;
  fallbackToLegacy: boolean;
};

export type OpenDataLoaderRouteDecision = {
  enabled: boolean;
  executionMode: OpenDataLoaderExecutionMode;
  hybridMode: "auto" | "full" | null;
  useStructTree: boolean;
  requiresOcr: boolean;
  reasonCode:
    | "DISABLED"
    | "FORCED_LOCAL"
    | "FORCED_HYBRID"
    | "FORCED_OCR"
    | "SCANNED_PDF"
    | "RELIABLE_TEXT_LAYER"
    | "STRUCT_TREE_PREFERRED";
  reason: string;
};

export type OpenDataLoaderBoundingBox = {
  left: number;
  bottom: number;
  right: number;
  top: number;
};

export type OpenDataLoaderRawElement = {
  id?: string | number | null;
  type?: string | null;
  content?: unknown;
  markdown?: unknown;
  html?: unknown;
  rows?: unknown;
  cells?: unknown;
  description?: unknown;
  caption?: unknown;
  level?: unknown;
  font?: unknown;
  [key: string]: unknown;
};

export type NormalizedDocumentBlock = {
  id: string;
  kind: AnnualReportPageBlock["kind"];
  rawType: string;
  pageNumber: number;
  order: number;
  bbox: OpenDataLoaderBoundingBox | null;
  text: string;
  suspiciousNoise: boolean;
  headingLevel?: number | null;
  table?: AnnualReportTable | null;
  source: {
    engine: "OPENDATALOADER";
    engineMode: OpenDataLoaderExecutionMode;
    sourceElementId: string;
    sourceRawType: string;
    order: number;
  };
  metadata?: Record<string, unknown>;
};

export type NormalizedDocumentPage = {
  pageNumber: number;
  blocks: NormalizedDocumentBlock[];
  tables: AnnualReportTable[];
  text: string;
  hasEmbeddedText: boolean;
  source: {
    engine: "OPENDATALOADER";
    engineMode: OpenDataLoaderExecutionMode;
  };
  metadata?: Record<string, unknown>;
};

export type NormalizedDocument = {
  engine: "OPENDATALOADER";
  engineVersion: string | null;
  engineMode: OpenDataLoaderExecutionMode;
  pageCount: number;
  pages: NormalizedDocumentPage[];
};

export type OpenDataLoaderRawOutputSummary = {
  topLevelType: "array" | "object" | "null" | "other";
  topLevelKeys: string[];
  elementCount: number;
  pageCount: number;
  tableCount: number;
  textElementCount: number;
  elementTypeCounts: Record<string, number>;
  elementContainerPaths: string[];
  pageNumbers: number[];
  sampleElementKeys: string[];
  sampleElementTypes: string[];
  topLevelContainerDiagnostics: Array<{
    key: string;
    valueType: "array" | "object" | "string" | "number" | "boolean" | "null" | "other";
    length: number | null;
    sampleItemType: string | null;
    sampleItemKeys: string[];
  }>;
};

export type OpenDataLoaderNormalizedOutputSummary = {
  pageCount: number;
  blockCount: number;
  tableCount: number;
  blockKindCounts: Record<string, number>;
  rawTypeCounts: Record<string, number>;
  pages: Array<{
    pageNumber: number;
    blockCount: number;
    tableCount: number;
    textLength: number;
    blockKindCounts: Record<string, number>;
    rawTypeCounts: Record<string, number>;
  }>;
};

export type OpenDataLoaderParseDiagnostics = {
  input: {
    sourceFilename: string;
    sourceByteLength: number;
    preflightPageCount: number;
    hasTextLayer: boolean;
    hasReliableTextLayer: boolean;
    route?: {
      executionMode: OpenDataLoaderExecutionMode;
      hybridMode: "auto" | "full" | null;
      requiresOcr: boolean;
      useStructTree: boolean;
      reasonCode: OpenDataLoaderRouteDecision["reasonCode"];
      reason: string;
    };
  };
  artifacts?: {
    outputFilenames: string[];
    rawJsonFilename: string | null;
    markdownFilename: string | null;
    annotatedPdfFilename: string | null;
  };
  rawOutput?: OpenDataLoaderRawOutputSummary;
  normalizedOutput?: OpenDataLoaderNormalizedOutputSummary;
  annualReportPageCount?: number;
  failureStage?: string;
  failureReason?: string;
};

export type OpenDataLoaderArtifactFile = {
  filename: string;
  mimeType: string;
  content: Buffer;
  storageMetadata?: Record<string, unknown>;
};

export type OpenDataLoaderGeneratedArtifacts = {
  rawJson: OpenDataLoaderArtifactFile & { payload: unknown };
  markdown: OpenDataLoaderArtifactFile | null;
  annotatedPdf: OpenDataLoaderArtifactFile | null;
};

export type OpenDataLoaderParseResult = {
  engine: "OPENDATALOADER";
  engineVersion: string | null;
  routing: OpenDataLoaderRouteDecision;
  preflight: PreflightResult;
  normalizedDocument: NormalizedDocument;
  annualReportPages: AnnualReportParsedPage[];
  diagnostics: OpenDataLoaderParseDiagnostics;
  artifacts: OpenDataLoaderGeneratedArtifacts;
  metrics: {
    durationMs: number;
    pageCount: number;
    blockCount: number;
    tableBlockCount: number;
  };
};

export type OpenDataLoaderPipelineSnapshot = {
  engine: "LEGACY" | "OPENDATALOADER";
  mode: OpenDataLoaderExecutionMode | "legacy";
  classifications: Array<{
    pageNumber: number;
    type: string;
    unitScale: number | null;
  }>;
  selectedFacts: Array<{
    metricKey: string;
    value: number;
    sourcePage: number;
    sourceSection: string;
    precedence: string;
  }>;
  blockingRuleCodes: string[];
  shouldPublish: boolean;
  confidenceScore: number;
  durationMs?: number;
};

export type OpenDataLoaderComparisonSummary = {
  primaryEngine: "LEGACY" | "OPENDATALOADER";
  shadowEngine: "LEGACY" | "OPENDATALOADER";
  primaryShouldPublish: boolean;
  shadowShouldPublish: boolean;
  publishDecisionMismatch: boolean;
  classificationDifferences: Array<{
    pageNumber: number;
    primaryType: string | null;
    shadowType: string | null;
  }>;
  unitScaleDifferences: Array<{
    pageNumber: number;
    primaryUnitScale: number | null;
    shadowUnitScale: number | null;
  }>;
  factDifferences: Array<{
    metricKey: string;
    primaryValue: number | null;
    shadowValue: number | null;
  }>;
  blockingRuleDifferences: {
    onlyInPrimary: string[];
    onlyInShadow: string[];
  };
  durationMs: {
    primary: number | null;
    shadow: number | null;
  };
  materialDisagreement: boolean;
};
