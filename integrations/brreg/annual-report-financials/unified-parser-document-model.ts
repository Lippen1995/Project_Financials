/**
 * Unified Parser Output Document Model
 *
 * A canonical, route-agnostic document model representing parser output from
 * TEXT_LAYER, OCR, OPENDATALOADER_LOCAL, or HYBRID routes in one stable shape.
 *
 * Design principles:
 * - All monetary/numeric values represented as string, never number.
 * - Safety flags are explicit and must be false for production-sensitive fields.
 * - The model is read-only; no production routing, facts, or publish behavior changes.
 * - Persisted artifacts use compactUnifiedParserDocumentForArtifact() to avoid
 *   storing unbounded raw text.
 * - Builders handle missing blocks/tables/sections gracefully; they never invent facts.
 *
 * This model does NOT replace production extraction in this PR.
 */

import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import type {
  AnnualReportDocument,
  AnnualReportPage,
  AnnualReportSection,
} from "@/integrations/brreg/annual-report-financials/document-model";
import type {
  AnnualReportParsedPage,
  PageTextLayer,
  PreflightResult,
} from "@/integrations/brreg/annual-report-financials/types";

// ---- Core types -------------------------------------------------------------

export type UnifiedParserRoute =
  | "TEXT_LAYER"
  | "OCR"
  | "OPENDATALOADER_LOCAL"
  | "HYBRID";

export type UnifiedParserDocumentVersion = "unified-parser-document-v1";

export type UnifiedParserTextBlockKind =
  | "TEXT"
  | "HEADING"
  | "TABLE_TEXT"
  | "FOOTNOTE"
  | "PAGE_HEADER"
  | "PAGE_FOOTER"
  | "UNKNOWN";

export type UnifiedParserSectionKind =
  | "FINANCIAL_STATEMENTS"
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW_STATEMENT"
  | "EQUITY_NOTE"
  | "NOTES"
  | "BOARD_REPORT"
  | "AUDITOR_REPORT"
  | "SIGNATURES"
  | "OTHER";

export type UnifiedParserTableRole =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW_STATEMENT"
  | "EQUITY"
  | "NOTE"
  | "UNKNOWN";

// ---- Block ------------------------------------------------------------------

export type UnifiedParserTextBlockBbox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type UnifiedParserTextBlock = {
  blockId: string;
  kind: UnifiedParserTextBlockKind;
  text: string;
  normalizedText: string;
  bbox: UnifiedParserTextBlockBbox | null;
  confidence: number | null;
  source: {
    route: UnifiedParserRoute;
    pageNumber: number;
    rawBlockId: string | null;
  };
};

// ---- Page -------------------------------------------------------------------

export type UnifiedParserPage = {
  pageNumber: number;
  width: number | null;
  height: number | null;
  rotation: number | null;
  textCharCount: number;
  normalizedTextCharCount: number;
  hasUsefulText: boolean;
  hasTableLikeText: boolean;
  routeConfidence: number | null;
  warnings: string[];
  blocks: UnifiedParserTextBlock[];
};

// ---- Section ----------------------------------------------------------------

export type UnifiedParserSection = {
  sectionId: string;
  kind: UnifiedParserSectionKind;
  title: string | null;
  pageStart: number;
  pageEnd: number;
  blockIds: string[];
  textPreview: string;
  normalizedTextPreview: string;
  confidence: number | null;
  provenance: {
    route: UnifiedParserRoute;
    detectedBy: string[];
    sourcePages: number[];
  };
};

// ---- Table ------------------------------------------------------------------

export type UnifiedParserTableColumn = {
  columnIndex: number;
  text: string;
  normalizedText: string;
  year: number | null;
  isAmountColumn: boolean;
};

export type UnifiedParserTableCell = {
  columnIndex: number;
  text: string;
  normalizedText: string;
  /** Integer or decimal string; never a JS number to avoid precision loss */
  numericValue: string | null;
  confidence: number | null;
};

export type UnifiedParserTableRow = {
  rowIndex: number;
  label: string;
  normalizedLabel: string;
  cells: UnifiedParserTableCell[];
};

export type UnifiedParserTable = {
  tableId: string;
  role: UnifiedParserTableRole;
  pageNumber: number;
  blockIds: string[];
  title: string | null;
  columns: UnifiedParserTableColumn[];
  rows: UnifiedParserTableRow[];
  confidence: number | null;
  warnings: string[];
};

// ---- Metrics ----------------------------------------------------------------

export type UnifiedParserDocumentMetrics = {
  pageCount: number;
  processedPageCount: number;
  textCharCount: number;
  normalizedTextCharCount: number;
  tableCount: number;
  sectionCount: number;
  warningCount: number;
  errorCount: number;
};

// ---- Safety -----------------------------------------------------------------

export type UnifiedParserDocumentSafety = {
  productionRoutingChanged: false;
  productionFactsMutated: false;
  publishAffected: false;
  shadowOnly: boolean;
  canUseForProductionRouting: false;
};

// ---- Root document ----------------------------------------------------------

export type UnifiedParserDocument = {
  version: UnifiedParserDocumentVersion;
  generatedAt: string;

  source: {
    route: UnifiedParserRoute;
    documentEngine: string | null;
    parserVersion: string | null;
    filingId: string | null;
    extractionRunId: string | null;
    orgNumber: string | null;
    fiscalYear: number | null;
  };

  safety: UnifiedParserDocumentSafety;
  metrics: UnifiedParserDocumentMetrics;
  pages: UnifiedParserPage[];
  sections: UnifiedParserSection[];
  tables: UnifiedParserTable[];
  warnings: string[];
  errors: string[];
};

// ---- Summary for listings ---------------------------------------------------

export type UnifiedParserDocumentSummary = {
  version: UnifiedParserDocumentVersion;
  route: UnifiedParserRoute;
  generatedAt: string;
  filingId: string | null;
  orgNumber: string | null;
  fiscalYear: number | null;
  pageCount: number;
  processedPageCount: number;
  textCharCount: number;
  tableCount: number;
  sectionCount: number;
  warningCount: number;
  errorCount: number;
  hasFinancialStatements: boolean;
  hasBoardReport: boolean;
  hasAuditorReport: boolean;
  safety: UnifiedParserDocumentSafety;
};

// ---- Constants --------------------------------------------------------------

const TEXT_PREVIEW_MAX_CHARS = 500;
const VALID_ROUTES: UnifiedParserRoute[] = [
  "TEXT_LAYER",
  "OCR",
  "OPENDATALOADER_LOCAL",
  "HYBRID",
];

// ---- ID generation ----------------------------------------------------------

let _blockIdCounter = 0;

/** Generate a stable-ish block ID for a given scope. */
function makeBlockId(prefix: string, pageNumber: number, index: number): string {
  _blockIdCounter++;
  return `${prefix}-p${pageNumber}-b${index}-${_blockIdCounter}`;
}

function makeSectionId(kind: string, pageStart: number): string {
  return `section-${kind.toLowerCase()}-p${pageStart}`;
}

function makeTableId(pageNumber: number, index: number): string {
  return `table-p${pageNumber}-t${index}`;
}

// ---- Builder: from AnnualReportPage[] (TEXT_LAYER) --------------------------

export type BuildFromTextLayerInput = {
  pages: AnnualReportPage[];
  sections?: AnnualReportSection[];
  source?: Partial<UnifiedParserDocument["source"]>;
  shadowOnly?: boolean;
};

export function buildUnifiedParserDocumentFromTextLayer(
  input: BuildFromTextLayerInput,
): UnifiedParserDocument {
  const { pages, sections = [], source = {}, shadowOnly = true } = input;
  const route: UnifiedParserRoute = "TEXT_LAYER";
  const generatedAt = new Date().toISOString();

  const unifiedPages: UnifiedParserPage[] = pages.map((p) => {
    const text = p.rawText ?? "";
    const normalized = p.normalizedText ?? normalizeNorwegianText(text);
    const hasUsefulText = normalized.trim().length > 20;
    const hasTableLikeText =
      (normalized.match(/\t|\|\s|\s{3,}/g) ?? []).length >= 3 ||
      (normalized.match(/\d{4,}/g) ?? []).length >= 4;

    const blockId = makeBlockId("txt", p.pageNumber, 0);
    const blocks: UnifiedParserTextBlock[] =
      text.trim().length > 0
        ? [
            {
              blockId,
              kind: "TEXT",
              text: text.slice(0, 50_000),
              normalizedText: normalized.slice(0, 50_000),
              bbox: null,
              confidence: null,
              source: { route, pageNumber: p.pageNumber, rawBlockId: null },
            },
          ]
        : [];

    return {
      pageNumber: p.pageNumber,
      width: null,
      height: null,
      rotation: null,
      textCharCount: text.length,
      normalizedTextCharCount: normalized.length,
      hasUsefulText,
      hasTableLikeText,
      routeConfidence: null,
      warnings: [],
      blocks,
    };
  });

  const unifiedSections: UnifiedParserSection[] = sections.map((s) => {
    const pagesForSection = s.pages ?? [];
    const fullText = pagesForSection.map((p) => p.normalizedText ?? "").join(" ");
    const preview = fullText.slice(0, TEXT_PREVIEW_MAX_CHARS);
    return {
      sectionId: makeSectionId(s.kind, s.startPage),
      kind: mapSectionKind(s.kind),
      title: null,
      pageStart: s.startPage,
      pageEnd: s.endPage,
      blockIds: [],
      textPreview: pagesForSection.map((p) => (p.rawText ?? "").slice(0, 200)).join(" ").slice(0, TEXT_PREVIEW_MAX_CHARS),
      normalizedTextPreview: preview,
      confidence: s.confidenceScore,
      provenance: {
        route,
        detectedBy: ["section-segmentation"],
        sourcePages: pagesForSection.map((p) => p.pageNumber),
      },
    };
  });

  const metrics = computeMetrics(unifiedPages, unifiedSections, [], [], []);

  return {
    version: "unified-parser-document-v1",
    generatedAt,
    source: {
      route,
      documentEngine: null,
      parserVersion: null,
      filingId: null,
      extractionRunId: null,
      orgNumber: null,
      fiscalYear: null,
      ...source,
    },
    safety: makeSafety(shadowOnly),
    metrics,
    pages: unifiedPages,
    sections: unifiedSections,
    tables: [],
    warnings: [],
    errors: [],
  };
}

// ---- Builder: from AnnualReportParsedPage[] (structured, ODL/HYBRID) --------

export type BuildFromStructuredDocumentInput = {
  parsedPages: AnnualReportParsedPage[];
  sections?: AnnualReportSection[];
  route: UnifiedParserRoute;
  source?: Partial<UnifiedParserDocument["source"]>;
  shadowOnly?: boolean;
};

export function buildUnifiedParserDocumentFromStructuredDocument(
  input: BuildFromStructuredDocumentInput,
): UnifiedParserDocument {
  const { parsedPages, sections = [], route, source = {}, shadowOnly = true } = input;
  const generatedAt = new Date().toISOString();

  const unifiedPages: UnifiedParserPage[] = parsedPages.map((p) => {
    const text = p.text ?? "";
    const normalized = p.normalizedText ?? normalizeNorwegianText(text);

    const blocks: UnifiedParserTextBlock[] = (p.blocks ?? []).map((b, i) => ({
      blockId: makeBlockId("odl", p.pageNumber, i),
      kind: mapBlockKind(b.kind),
      text: b.text.slice(0, 50_000),
      normalizedText: b.normalizedText.slice(0, 50_000),
      bbox: b.bbox
        ? { x0: b.bbox.left, y0: b.bbox.bottom, x1: b.bbox.right, y1: b.bbox.top }
        : null,
      confidence: null,
      source: { route, pageNumber: p.pageNumber, rawBlockId: b.id },
    }));

    const tables: UnifiedParserTable[] = (p.tables ?? []).map((t, ti) => {
      const tableId = makeTableId(p.pageNumber, ti);
      const columns: UnifiedParserTableColumn[] = [];
      const rows: UnifiedParserTableRow[] = [];

      for (const row of t.rows) {
        const labelCell = row.cells[0];
        const valueCells = row.cells.slice(1);
        if (!labelCell) continue;
        rows.push({
          rowIndex: row.rowIndex,
          label: labelCell.text,
          normalizedLabel: labelCell.normalizedText,
          cells: valueCells.map((c) => ({
            columnIndex: c.columnIndex,
            text: c.text,
            normalizedText: c.normalizedText,
            numericValue: c.numericValue !== null ? String(c.numericValue) : null,
            confidence: null,
          })),
        });
      }

      if (t.rows[0]) {
        for (const cell of t.rows[0].cells.slice(1)) {
          const yearMatch = cell.text.match(/\b(20\d{2})\b/);
          columns.push({
            columnIndex: cell.columnIndex,
            text: cell.text,
            normalizedText: cell.normalizedText,
            year: yearMatch ? parseInt(yearMatch[1], 10) : null,
            isAmountColumn: cell.role === "value" || cell.isNumeric,
          });
        }
      }

      return {
        tableId,
        role: "UNKNOWN",
        pageNumber: p.pageNumber,
        blockIds: [],
        title: null,
        columns,
        rows,
        confidence: null,
        warnings: [],
      };
    });

    // Attach tables to the page's containing document (returned separately below)
    // We just record them in context; they'll be collected at document level.
    void tables; // used below in collectTables

    return {
      pageNumber: p.pageNumber,
      width: null,
      height: null,
      rotation: null,
      textCharCount: text.length,
      normalizedTextCharCount: normalized.length,
      hasUsefulText: normalized.trim().length > 20,
      hasTableLikeText: (p.tables ?? []).length > 0,
      routeConfidence: null,
      warnings: [],
      blocks,
    };
  });

  // Collect tables from all pages
  const allTables: UnifiedParserTable[] = parsedPages.flatMap((p, _pi) =>
    (p.tables ?? []).map((t, ti) => {
      const tableId = makeTableId(p.pageNumber, ti);
      const rows: UnifiedParserTableRow[] = [];
      const columns: UnifiedParserTableColumn[] = [];

      for (const row of t.rows) {
        const labelCell = row.cells[0];
        if (!labelCell) continue;
        rows.push({
          rowIndex: row.rowIndex,
          label: labelCell.text,
          normalizedLabel: labelCell.normalizedText,
          cells: row.cells.slice(1).map((c) => ({
            columnIndex: c.columnIndex,
            text: c.text,
            normalizedText: c.normalizedText,
            numericValue: c.numericValue !== null ? String(c.numericValue) : null,
            confidence: null,
          })),
        });
      }

      if (t.rows[0]) {
        for (const cell of t.rows[0].cells.slice(1)) {
          const yearMatch = cell.text.match(/\b(20\d{2})\b/);
          columns.push({
            columnIndex: cell.columnIndex,
            text: cell.text,
            normalizedText: cell.normalizedText,
            year: yearMatch ? parseInt(yearMatch[1], 10) : null,
            isAmountColumn: cell.role === "value" || cell.isNumeric,
          });
        }
      }

      return {
        tableId,
        role: "UNKNOWN" as UnifiedParserTableRole,
        pageNumber: p.pageNumber,
        blockIds: [],
        title: null,
        columns,
        rows,
        confidence: null,
        warnings: [],
      };
    }),
  );

  const unifiedSections: UnifiedParserSection[] = sections.map((s) => {
    const pagesForSection = s.pages ?? [];
    const fullText = pagesForSection.map((p) => p.normalizedText ?? "").join(" ");
    return {
      sectionId: makeSectionId(s.kind, s.startPage),
      kind: mapSectionKind(s.kind),
      title: null,
      pageStart: s.startPage,
      pageEnd: s.endPage,
      blockIds: [],
      textPreview: pagesForSection.map((p) => p.rawText ?? "").join(" ").slice(0, TEXT_PREVIEW_MAX_CHARS),
      normalizedTextPreview: fullText.slice(0, TEXT_PREVIEW_MAX_CHARS),
      confidence: s.confidenceScore,
      provenance: {
        route,
        detectedBy: ["section-segmentation"],
        sourcePages: pagesForSection.map((p) => p.pageNumber),
      },
    };
  });

  const metrics = computeMetrics(unifiedPages, unifiedSections, allTables, [], []);

  return {
    version: "unified-parser-document-v1",
    generatedAt,
    source: {
      route,
      documentEngine: route === "OPENDATALOADER_LOCAL" ? "opendataloader" : null,
      parserVersion: null,
      filingId: null,
      extractionRunId: null,
      orgNumber: null,
      fiscalYear: null,
      ...source,
    },
    safety: makeSafety(shadowOnly),
    metrics,
    pages: unifiedPages,
    sections: unifiedSections,
    tables: allTables,
    warnings: [],
    errors: [],
  };
}

// ---- Builder: from shadow route summary (OCR/ODL minimal) -------------------

export type ShadowRouteSummary = {
  route: UnifiedParserRoute;
  pageCount: number;
  textCharCount?: number;
  normalizedTextCharCount?: number;
  tableCount?: number;
  warningCount?: number;
  errorCount?: number;
  warnings?: string[];
  errors?: string[];
};

export type BuildFromShadowRouteSummaryInput = {
  summary: ShadowRouteSummary;
  source?: Partial<UnifiedParserDocument["source"]>;
  shadowOnly?: boolean;
};

export function buildUnifiedParserDocumentFromShadowRouteSummary(
  input: BuildFromShadowRouteSummaryInput,
): UnifiedParserDocument {
  const { summary, source = {}, shadowOnly = true } = input;
  const route = summary.route;
  const generatedAt = new Date().toISOString();

  const warnings = [
    ...(summary.warnings ?? []),
    "Built from shadow route summary only — detailed blocks not available. Fidelity is reduced.",
  ];

  const metrics: UnifiedParserDocumentMetrics = {
    pageCount: summary.pageCount,
    processedPageCount: summary.pageCount,
    textCharCount: summary.textCharCount ?? 0,
    normalizedTextCharCount: summary.normalizedTextCharCount ?? 0,
    tableCount: summary.tableCount ?? 0,
    sectionCount: 0,
    warningCount: (summary.warningCount ?? 0) + warnings.length,
    errorCount: summary.errorCount ?? 0,
  };

  return {
    version: "unified-parser-document-v1",
    generatedAt,
    source: {
      route,
      documentEngine: null,
      parserVersion: null,
      filingId: null,
      extractionRunId: null,
      orgNumber: null,
      fiscalYear: null,
      ...source,
    },
    safety: makeSafety(shadowOnly),
    metrics,
    pages: [],
    sections: [],
    tables: [],
    warnings,
    errors: summary.errors ?? [],
  };
}

// ---- Builder: from PreflightResult ------------------------------------------

export type BuildFromPreflightResultInput = {
  preflight: PreflightResult;
  route?: UnifiedParserRoute;
  source?: Partial<UnifiedParserDocument["source"]>;
  shadowOnly?: boolean;
};

export function buildUnifiedParserDocumentFromPreflightResult(
  input: BuildFromPreflightResultInput,
): UnifiedParserDocument {
  const { preflight, route = "TEXT_LAYER", source = {}, shadowOnly = true } = input;

  const textLayerPages: AnnualReportPage[] = preflight.parsedPages.map((p) => ({
    pageNumber: p.pageNumber,
    rawText: p.text,
    normalizedText: p.normalizedText,
    charCount: p.text.length,
  }));

  const structuredSections: AnnualReportSection[] =
    preflight.structuredDocument?.sections ?? [];

  return buildUnifiedParserDocumentFromTextLayer({
    pages: textLayerPages,
    sections: structuredSections,
    source: {
      route,
      ...source,
    },
    shadowOnly,
  });
}

// ---- Validation -------------------------------------------------------------

const MAX_ARTIFACT_TEXT_PREVIEW = 2000;

function isNonFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && !Number.isFinite(v);
}

function containsNonFiniteRecursive(obj: unknown, path = ""): string[] {
  if (isNonFiniteNumber(obj)) return [`${path}: non-finite number (${String(obj)})`];
  if (obj === null || typeof obj !== "object") return [];
  const issues: string[] = [];
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    issues.push(...containsNonFiniteRecursive(val, path ? `${path}.${key}` : key));
  }
  return issues;
}

export function validateUnifiedParserDocument(
  doc: UnifiedParserDocument,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (doc.version !== "unified-parser-document-v1") {
    issues.push(`version must be "unified-parser-document-v1", got "${String(doc.version)}".`);
  }

  if (!doc.generatedAt) {
    issues.push("generatedAt is required.");
  }

  if (!VALID_ROUTES.includes(doc.source.route)) {
    issues.push(`source.route "${String(doc.source.route)}" is not a valid UnifiedParserRoute.`);
  }

  if (doc.safety.canUseForProductionRouting !== false) {
    issues.push("safety.canUseForProductionRouting must be false.");
  }

  if (doc.safety.productionRoutingChanged !== false) {
    issues.push("safety.productionRoutingChanged must be false.");
  }

  if (doc.safety.productionFactsMutated !== false) {
    issues.push("safety.productionFactsMutated must be false.");
  }

  if (doc.safety.publishAffected !== false) {
    issues.push("safety.publishAffected must be false.");
  }

  // NaN/Infinity check
  const nanIssues = containsNonFiniteRecursive(doc);
  issues.push(...nanIssues.map((i) => `Non-finite value: ${i}`));

  // Page numbers
  for (const page of doc.pages) {
    if (typeof page.pageNumber !== "number" || page.pageNumber < 1) {
      issues.push(`Page has invalid pageNumber: ${String(page.pageNumber)}.`);
    }
  }

  // numericValue must be string or null, never number
  for (const table of doc.tables) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (typeof cell.numericValue === "number") {
          issues.push(
            `Table "${table.tableId}" row ${row.rowIndex} col ${cell.columnIndex}: numericValue must be string|null, got number.`,
          );
        }
      }
    }
  }

  // Section previews must not be absurdly large in a normal (non-compact) context
  // We warn but don't reject at 50k chars since builders may produce large models.
  // Compact artifact check is separate.

  return { valid: issues.length === 0, issues };
}

// ---- Compact artifact -------------------------------------------------------

export type UnifiedParserDocumentArtifact = {
  version: UnifiedParserDocumentVersion;
  generatedAt: string;
  source: UnifiedParserDocument["source"];
  safety: UnifiedParserDocumentSafety;
  metrics: UnifiedParserDocumentMetrics;
  summary: UnifiedParserDocumentSummary;
  /** Page-level summaries only; full block text omitted */
  pageSummaries: Array<{
    pageNumber: number;
    textCharCount: number;
    hasUsefulText: boolean;
    hasTableLikeText: boolean;
    blockCount: number;
    warnings: string[];
  }>;
  /** Section-level summaries with bounded previews */
  sectionSummaries: Array<{
    sectionId: string;
    kind: UnifiedParserSectionKind;
    pageStart: number;
    pageEnd: number;
    textPreview: string;
    confidence: number | null;
  }>;
  /** Table-level summaries; full rows omitted */
  tableSummaries: Array<{
    tableId: string;
    role: UnifiedParserTableRole;
    pageNumber: number;
    rowCount: number;
    columnCount: number;
    title: string | null;
    warnings: string[];
  }>;
  warnings: string[];
  errors: string[];
};

export function compactUnifiedParserDocumentForArtifact(
  doc: UnifiedParserDocument,
): UnifiedParserDocumentArtifact {
  const summary = buildUnifiedParserDocumentSummary(doc);

  return {
    version: doc.version,
    generatedAt: doc.generatedAt,
    source: doc.source,
    safety: doc.safety,
    metrics: doc.metrics,
    summary,
    pageSummaries: doc.pages.map((p) => ({
      pageNumber: p.pageNumber,
      textCharCount: p.textCharCount,
      hasUsefulText: p.hasUsefulText,
      hasTableLikeText: p.hasTableLikeText,
      blockCount: p.blocks.length,
      warnings: p.warnings,
    })),
    sectionSummaries: doc.sections.map((s) => ({
      sectionId: s.sectionId,
      kind: s.kind,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
      textPreview: s.textPreview.slice(0, MAX_ARTIFACT_TEXT_PREVIEW),
      confidence: s.confidence,
    })),
    tableSummaries: doc.tables.map((t) => ({
      tableId: t.tableId,
      role: t.role,
      pageNumber: t.pageNumber,
      rowCount: t.rows.length,
      columnCount: t.columns.length,
      title: t.title,
      warnings: t.warnings,
    })),
    warnings: doc.warnings,
    errors: doc.errors,
  };
}

// ---- Summary ----------------------------------------------------------------

export function buildUnifiedParserDocumentSummary(
  doc: UnifiedParserDocument,
): UnifiedParserDocumentSummary {
  const financialKinds: UnifiedParserSectionKind[] = [
    "FINANCIAL_STATEMENTS",
    "INCOME_STATEMENT",
    "BALANCE_SHEET",
    "CASH_FLOW_STATEMENT",
    "EQUITY_NOTE",
  ];
  const hasFinancialStatements = doc.sections.some((s) =>
    financialKinds.includes(s.kind),
  );
  const hasBoardReport = doc.sections.some((s) => s.kind === "BOARD_REPORT");
  const hasAuditorReport = doc.sections.some((s) => s.kind === "AUDITOR_REPORT");

  return {
    version: doc.version,
    route: doc.source.route,
    generatedAt: doc.generatedAt,
    filingId: doc.source.filingId,
    orgNumber: doc.source.orgNumber,
    fiscalYear: doc.source.fiscalYear,
    pageCount: doc.metrics.pageCount,
    processedPageCount: doc.metrics.processedPageCount,
    textCharCount: doc.metrics.textCharCount,
    tableCount: doc.metrics.tableCount,
    sectionCount: doc.metrics.sectionCount,
    warningCount: doc.metrics.warningCount,
    errorCount: doc.metrics.errorCount,
    hasFinancialStatements,
    hasBoardReport,
    hasAuditorReport,
    safety: doc.safety,
  };
}

// ---- Serialization ----------------------------------------------------------

export function serializeUnifiedParserDocumentAsJson(doc: UnifiedParserDocument): string {
  return JSON.stringify(doc, null, 2);
}

// ---- Internal helpers -------------------------------------------------------

function makeSafety(shadowOnly: boolean): UnifiedParserDocumentSafety {
  return {
    productionRoutingChanged: false,
    productionFactsMutated: false,
    publishAffected: false,
    shadowOnly,
    canUseForProductionRouting: false,
  };
}

function computeMetrics(
  pages: UnifiedParserPage[],
  sections: UnifiedParserSection[],
  tables: UnifiedParserTable[],
  warnings: string[],
  errors: string[],
): UnifiedParserDocumentMetrics {
  let textCharCount = 0;
  let normalizedTextCharCount = 0;
  let warningCount = warnings.length;
  const errorCount = errors.length;

  for (const p of pages) {
    textCharCount += p.textCharCount;
    normalizedTextCharCount += p.normalizedTextCharCount;
    warningCount += p.warnings.length;
  }

  for (const t of tables) {
    warningCount += t.warnings.length;
  }

  return {
    pageCount: pages.length,
    processedPageCount: pages.filter((p) => p.textCharCount > 0).length,
    textCharCount,
    normalizedTextCharCount,
    tableCount: tables.length,
    sectionCount: sections.length,
    warningCount,
    errorCount,
  };
}

function mapSectionKind(kind: string): UnifiedParserSectionKind {
  switch (kind) {
    case "INCOME_STATEMENT":
      return "INCOME_STATEMENT";
    case "BALANCE":
    case "BALANCE_SHEET":
    case "BALANCE_ASSETS":
    case "BALANCE_EQUITY_LIABILITIES":
      return "BALANCE_SHEET";
    case "CASH_FLOW":
      return "CASH_FLOW_STATEMENT";
    case "NOTES":
      return "NOTES";
    case "BOARD_REPORT":
      return "BOARD_REPORT";
    case "AUDITOR_REPORT":
      return "AUDITOR_REPORT";
    case "SIGNATURES":
      return "SIGNATURES";
    default:
      return "OTHER";
  }
}

function mapBlockKind(kind: string): UnifiedParserTextBlockKind {
  switch (kind) {
    case "heading":
      return "HEADING";
    case "paragraph":
    case "list":
    case "other":
      return "TEXT";
    case "table":
      return "TABLE_TEXT";
    case "caption":
      return "FOOTNOTE";
    default:
      return "UNKNOWN";
  }
}
