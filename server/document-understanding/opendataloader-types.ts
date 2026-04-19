import { PageTextLayer, PreflightResult } from "@/integrations/brreg/annual-report-financials/types";

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
  pageNumber: number;
  order: number;
  bbox: OpenDataLoaderBoundingBox | null;
  text: string;
  suspiciousNoise: boolean;
  metadata?: Record<string, unknown>;
};

export type NormalizedDocumentPage = {
  pageNumber: number;
  blocks: NormalizedDocumentBlock[];
  text: string;
  hasEmbeddedText: boolean;
  metadata?: Record<string, unknown>;
};

export type NormalizedDocument = {
  engine: "OPENDATALOADER";
  engineVersion: string | null;
  pageCount: number;
  pages: NormalizedDocumentPage[];
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
  pageTextLayers: PageTextLayer[];
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
