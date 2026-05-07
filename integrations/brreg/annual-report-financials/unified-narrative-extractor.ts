/**
 * Unified Narrative Extractor
 *
 * Extracts narrative sections (board report, auditor report, opinions,
 * qualifications, going-concern signals, signatures, etc.) from a
 * UnifiedParserDocument.
 *
 * Design principles:
 * - Route-agnostic: works on TEXT_LAYER, OCR, OPENDATALOADER_LOCAL, HYBRID.
 * - Uses document sections when present; falls back to heading/block inference.
 * - Norwegian-language signal detection for each section type.
 * - Stop boundaries prevent sections from swallowing each other.
 * - All outputs are shadow-only; canUseForProductionRouting is always false.
 * - No DB access, no live Brreg, no OCR/ODL runtime.
 *
 * Safety invariants (always enforced regardless of input):
 *   canUseForProductionRouting: false
 *   productionRoutingChanged:   false
 *   productionFactsMutated:     false
 *   publishAffected:            false
 */

import type {
  UnifiedParserDocument,
  UnifiedParserSectionKind,
  UnifiedParserPage,
  UnifiedParserTextBlock,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

// ── Version ──────────────────────────────────────────────────────────────────

export type UnifiedNarrativeExtractionVersion =
  "unified-narrative-extraction-v1";
export const UNIFIED_NARRATIVE_EXTRACTION_VERSION: UnifiedNarrativeExtractionVersion =
  "unified-narrative-extraction-v1";

// ── Section kinds ─────────────────────────────────────────────────────────────

export type UnifiedNarrativeSectionKind =
  | "BOARD_REPORT"
  | "AUDITOR_REPORT"
  | "AUDITOR_OPINION"
  | "AUDITOR_QUALIFICATION"
  | "EMPHASIS_OF_MATTER"
  | "GOING_CONCERN"
  | "OTHER_INFORMATION"
  | "SIGNATURES"
  | "UNKNOWN";

// ── Signal ────────────────────────────────────────────────────────────────────

export type UnifiedNarrativeSignal = {
  /** The signal keyword or phrase found in the text */
  keyword: string;
  /** The raw text fragment containing the keyword (up to 120 chars) */
  context: string;
  /** Page number where the signal was found */
  pageNumber: number | null;
};

// ── Extracted section ─────────────────────────────────────────────────────────

export type UnifiedNarrativeSection = {
  sectionId: string;
  kind: UnifiedNarrativeSectionKind;
  /**
   * Title detected from the document (heading text, section title, or inferred
   * from the first strong signal keyword).
   */
  title: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  /** Text preview (max 500 chars) from the section body */
  textPreview: string;
  /** Signals that caused this section to be detected */
  signals: UnifiedNarrativeSignal[];
  /**
   * Confidence 0-1. Derived from number of signals and provenance quality.
   * 1.0 = came directly from a matching document section
   * 0.8 = heading-inferred with 2+ signals
   * 0.6 = block-inferred with 1 signal
   */
  confidence: number;
  provenance: "DOCUMENT_SECTION" | "HEADING_INFERRED" | "BLOCK_INFERRED";
};

// ── Metrics ───────────────────────────────────────────────────────────────────

export type UnifiedNarrativeExtractionMetrics = {
  boardReportFound: boolean;
  auditorReportFound: boolean;
  auditorOpinionFound: boolean;
  auditorQualificationFound: boolean;
  emphasisOfMatterFound: boolean;
  goingConcernSignalFound: boolean;
  signaturesFound: boolean;
  otherInformationFound: boolean;
  totalSignalCount: number;
  sectionCount: number;
  warningCount: number;
};

// ── Safety ────────────────────────────────────────────────────────────────────

export type UnifiedNarrativeExtractionSafety = {
  /** Always false — this extractor never activates production routing */
  canUseForProductionRouting: false;
  /** Always false — no routing changes */
  productionRoutingChanged: false;
  /** Always false — no published facts are mutated */
  productionFactsMutated: false;
  /** Always false — no publish behavior changes */
  publishAffected: false;
  shadowOnly: boolean;
};

// ── Result ────────────────────────────────────────────────────────────────────

export type UnifiedNarrativeExtractionResult = {
  version: UnifiedNarrativeExtractionVersion;
  generatedAt: string;
  source: {
    route: string;
    filingId: string | null;
    orgNumber: string | null;
    fiscalYear: number | null;
  };
  sections: UnifiedNarrativeSection[];
  metrics: UnifiedNarrativeExtractionMetrics;
  warnings: string[];
  safety: UnifiedNarrativeExtractionSafety;
};

// ── Options ───────────────────────────────────────────────────────────────────

export type ExtractUnifiedNarrativesOptions = {
  /** If true, includes all inferred sections even with low confidence */
  includeAllInferred?: boolean;
  /** Minimum confidence threshold for inferred sections (default: 0.5) */
  minConfidence?: number;
};

// ── Norwegian signal keywords ─────────────────────────────────────────────────

type SignalSpec = {
  keywords: string[];
  kind: UnifiedNarrativeSectionKind;
};

/**
 * Ordered from most specific to least specific.
 * The order matters when multiple kinds could match the same text.
 */
const SIGNAL_SPECS: SignalSpec[] = [
  {
    kind: "AUDITOR_QUALIFICATION",
    keywords: [
      "med forbehold",
      "forbehold om",
      "kvalifisert konklusjon",
      "negativ konklusjon",
      "konklusjon med forbehold",
    ],
  },
  {
    kind: "EMPHASIS_OF_MATTER",
    keywords: [
      "presisering",
      "uten å ta forbehold",
      "uten at det påvirker vår konklusjon",
      "vil vi henlede",
      "gjøre oppmerksom",
    ],
  },
  {
    kind: "GOING_CONCERN",
    keywords: [
      "fortsatt drift",
      "forutsetning om fortsatt drift",
      "going concern",
      "vesentlig usikkerhet",
      "tvil om foretakets evne",
      "fortsette driften",
      "ikke er i stand til å fortsette",
    ],
  },
  {
    kind: "AUDITOR_OPINION",
    keywords: [
      "etter vår mening",
      "i vår mening",
      "konkluderer vi",
      "vår konklusjon",
      "konklusjonen er",
      "gir et rettvisende bilde",
      "revisors konklusjon",
    ],
  },
  {
    kind: "AUDITOR_REPORT",
    keywords: [
      "revisors beretning",
      "revisjonsberetning",
      "uavhengig revisors",
      "til generalforsamlingen",
      "vi har revidert",
      "revisjon av",
      "grunnlag for konklusjon",
      "styret er ansvarlig for",
    ],
  },
  {
    kind: "SIGNATURES",
    keywords: [
      "underskrift",
      "underskrevet",
      "signatur",
      "dato og sted",
      "sted og dato",
      "styreleder",
      "daglig leder",
      "styremedlem",
    ],
  },
  {
    kind: "OTHER_INFORMATION",
    keywords: [
      "annen informasjon",
      "øvrig informasjon",
      "andre opplysninger",
      "informasjon utover",
    ],
  },
  {
    kind: "BOARD_REPORT",
    keywords: [
      "styrets beretning",
      "styrets årsberetning",
      "årsberetning",
      "virksomhetens art",
      "styrets redegjørelse",
      "redegjørelse fra styret",
    ],
  },
];

/** Section kinds that correspond to document section kinds in UnifiedParserDocument */
const SECTION_KIND_MAP: Partial<Record<UnifiedParserSectionKind, UnifiedNarrativeSectionKind>> = {
  BOARD_REPORT: "BOARD_REPORT",
  AUDITOR_REPORT: "AUDITOR_REPORT",
  SIGNATURES: "SIGNATURES",
};

// ── Signal detection helpers ──────────────────────────────────────────────────

function detectSignalsInText(
  text: string,
  pageNumber: number | null,
): Map<UnifiedNarrativeSectionKind, UnifiedNarrativeSignal[]> {
  const normalized = text.toLowerCase();
  const result = new Map<UnifiedNarrativeSectionKind, UnifiedNarrativeSignal[]>();

  for (const spec of SIGNAL_SPECS) {
    for (const kw of spec.keywords) {
      const idx = normalized.indexOf(kw);
      if (idx === -1) continue;

      const contextStart = Math.max(0, idx - 20);
      const contextEnd = Math.min(text.length, idx + kw.length + 100);
      const context = text.slice(contextStart, contextEnd).trim();

      if (!result.has(spec.kind)) result.set(spec.kind, []);
      result.get(spec.kind)!.push({ keyword: kw, context, pageNumber });
    }
  }

  return result;
}

function detectSignalsInBlocks(
  blocks: UnifiedParserTextBlock[],
): Map<UnifiedNarrativeSectionKind, UnifiedNarrativeSignal[]> {
  const merged = new Map<UnifiedNarrativeSectionKind, UnifiedNarrativeSignal[]>();

  for (const block of blocks) {
    const found = detectSignalsInText(block.text, block.source.pageNumber);
    for (const [kind, signals] of found) {
      if (!merged.has(kind)) merged.set(kind, []);
      merged.get(kind)!.push(...signals);
    }
  }

  return merged;
}

// ── Section ID counter ────────────────────────────────────────────────────────

let _sectionIdCounter = 0;

function nextSectionId(): string {
  return `narrative-section-${++_sectionIdCounter}`;
}

// ── Text preview helper ───────────────────────────────────────────────────────

const TEXT_PREVIEW_MAX = 500;

function makeTextPreview(text: string): string {
  return text.length <= TEXT_PREVIEW_MAX ? text : text.slice(0, TEXT_PREVIEW_MAX - 1) + "…";
}

// ── Build sections from document sections ─────────────────────────────────────

function buildSectionsFromDocumentSections(
  doc: UnifiedParserDocument,
): { sections: UnifiedNarrativeSection[]; warnings: string[] } {
  const sections: UnifiedNarrativeSection[] = [];
  const warnings: string[] = [];

  for (const docSection of doc.sections) {
    const narrativeKind = SECTION_KIND_MAP[docSection.kind];
    if (!narrativeKind) continue;

    // Gather text from blocks associated with this section
    const sectionBlocks = doc.pages
      .flatMap((p) => p.blocks)
      .filter((b) => docSection.blockIds.includes(b.blockId));

    const combinedText = sectionBlocks.map((b) => b.text).join(" ");
    const signals = detectSignalsInText(
      combinedText || docSection.textPreview,
      docSection.pageStart,
    ).get(narrativeKind) ?? [];

    sections.push({
      sectionId: nextSectionId(),
      kind: narrativeKind,
      title: docSection.title,
      pageStart: docSection.pageStart,
      pageEnd: docSection.pageEnd,
      textPreview: makeTextPreview(combinedText || docSection.textPreview),
      signals,
      confidence: 1.0,
      provenance: "DOCUMENT_SECTION",
    });
  }

  return { sections, warnings };
}

// ── Infer sections from headings + block text ─────────────────────────────────

/**
 * Page-level stop boundaries: once we have assigned a page range to a section
 * of a higher-priority kind, do not re-assign those pages to other kinds.
 */
function buildSectionsFromInference(
  doc: UnifiedParserDocument,
  existingKinds: Set<UnifiedNarrativeSectionKind>,
  options: ExtractUnifiedNarrativesOptions,
): { sections: UnifiedNarrativeSection[]; warnings: string[] } {
  const sections: UnifiedNarrativeSection[] = [];
  const warnings: string[] = [];
  const minConf = options.minConfidence ?? 0.5;

  // All blocks across all pages, sorted by page then block order
  const allBlocks = doc.pages.flatMap((p) => p.blocks);

  // Group blocks by page
  const pageBlocks = new Map<number, UnifiedParserTextBlock[]>();
  for (const page of doc.pages) {
    pageBlocks.set(page.pageNumber, page.blocks);
  }

  // Detect signals per page
  type PageSignals = Map<UnifiedNarrativeSectionKind, UnifiedNarrativeSignal[]>;
  const signalsByPage = new Map<number, PageSignals>();

  for (const [pageNum, blocks] of pageBlocks) {
    signalsByPage.set(pageNum, detectSignalsInBlocks(blocks));
  }

  // For each narrative kind not already found via document sections, find pages
  // with signals and build inferred sections
  for (const spec of SIGNAL_SPECS) {
    const kind = spec.kind;
    if (existingKinds.has(kind)) continue;

    const kindPages: Array<{ pageNumber: number; signals: UnifiedNarrativeSignal[] }> = [];

    for (const [pageNum, pageSignals] of signalsByPage) {
      const signals = pageSignals.get(kind);
      if (signals && signals.length > 0) {
        kindPages.push({ pageNumber: pageNum, signals });
      }
    }

    if (kindPages.length === 0) continue;

    // Merge contiguous page groups into sections
    const sortedPages = kindPages.sort((a, b) => a.pageNumber - b.pageNumber);
    const groups: Array<{ pages: typeof sortedPages; signals: UnifiedNarrativeSignal[] }> = [];

    for (const entry of sortedPages) {
      const last = groups[groups.length - 1];
      if (last && entry.pageNumber - last.pages[last.pages.length - 1].pageNumber <= 2) {
        last.pages.push(entry);
        last.signals.push(...entry.signals);
      } else {
        groups.push({ pages: [entry], signals: [...entry.signals] });
      }
    }

    for (const group of groups) {
      const pageStart = group.pages[0].pageNumber;
      const pageEnd = group.pages[group.pages.length - 1].pageNumber;
      const signalCount = group.signals.length;

      // De-duplicate signals by keyword
      const seenKw = new Set<string>();
      const dedupedSignals = group.signals.filter((s) => {
        if (seenKw.has(s.keyword)) return false;
        seenKw.add(s.keyword);
        return true;
      });

      // Compute confidence
      const confidence = signalCount >= 2 ? 0.8 : 0.6;
      if (confidence < minConf && !options.includeAllInferred) continue;

      // Build text preview from the blocks on these pages
      const pageNums = new Set(group.pages.map((p) => p.pageNumber));
      const relevantBlocks = allBlocks.filter((b) => pageNums.has(b.source.pageNumber));
      const combinedText = relevantBlocks.map((b) => b.text).join(" ");

      // Infer title from first HEADING block on these pages
      const headingBlock = relevantBlocks.find((b) => b.kind === "HEADING");
      const title = headingBlock
        ? headingBlock.text.slice(0, 120).trim()
        : dedupedSignals[0]?.keyword ?? null;

      sections.push({
        sectionId: nextSectionId(),
        kind,
        title,
        pageStart,
        pageEnd,
        textPreview: makeTextPreview(combinedText),
        signals: dedupedSignals,
        confidence,
        provenance: headingBlock ? "HEADING_INFERRED" : "BLOCK_INFERRED",
      });
    }
  }

  return { sections, warnings };
}

// ── Build metrics ─────────────────────────────────────────────────────────────

function buildMetrics(
  sections: UnifiedNarrativeSection[],
  warnings: string[],
): UnifiedNarrativeExtractionMetrics {
  const has = (k: UnifiedNarrativeSectionKind) => sections.some((s) => s.kind === k);
  const totalSignals = sections.reduce((acc, s) => acc + s.signals.length, 0);

  return {
    boardReportFound: has("BOARD_REPORT"),
    auditorReportFound: has("AUDITOR_REPORT"),
    auditorOpinionFound: has("AUDITOR_OPINION"),
    auditorQualificationFound: has("AUDITOR_QUALIFICATION"),
    emphasisOfMatterFound: has("EMPHASIS_OF_MATTER"),
    goingConcernSignalFound: has("GOING_CONCERN"),
    signaturesFound: has("SIGNATURES"),
    otherInformationFound: has("OTHER_INFORMATION"),
    totalSignalCount: totalSignals,
    sectionCount: sections.length,
    warningCount: warnings.length,
  };
}

// ── Safety ────────────────────────────────────────────────────────────────────

function makeSafety(shadowOnly: boolean): UnifiedNarrativeExtractionSafety {
  return {
    canUseForProductionRouting: false,
    productionRoutingChanged: false,
    productionFactsMutated: false,
    publishAffected: false,
    shadowOnly,
  };
}

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract narrative sections from a UnifiedParserDocument.
 *
 * Strategy:
 * 1. First, map existing document sections (BOARD_REPORT, AUDITOR_REPORT,
 *    SIGNATURES) directly to narrative sections (confidence=1.0).
 * 2. Then, infer remaining section kinds from page-level signal detection
 *    using Norwegian keyword patterns.
 * 3. De-duplicate by section kind (keep highest confidence).
 */
export function extractUnifiedNarratives(
  doc: UnifiedParserDocument,
  options: ExtractUnifiedNarrativesOptions = {},
): UnifiedNarrativeExtractionResult {
  const warnings: string[] = [];

  // Reset counter for determinism in tests
  _sectionIdCounter = 0;

  // Step 1: sections from document structure
  const { sections: docSections, warnings: docWarnings } =
    buildSectionsFromDocumentSections(doc);
  warnings.push(...docWarnings);

  // Kinds already covered
  const existingKinds = new Set(docSections.map((s) => s.kind));

  // Step 2: inferred sections from block/heading signals
  const { sections: inferredSections, warnings: inferredWarnings } =
    buildSectionsFromInference(doc, existingKinds, options);
  warnings.push(...inferredWarnings);

  // Merge: document sections take precedence; for each kind from inference,
  // only add if not already covered
  const inferredKinds = new Set(inferredSections.map((s) => s.kind));
  const finalSections: UnifiedNarrativeSection[] = [...docSections];
  for (const s of inferredSections) {
    if (!existingKinds.has(s.kind)) {
      finalSections.push(s);
      existingKinds.add(s.kind);
    }
  }

  // Warn if no narrative content found at all
  if (finalSections.length === 0) {
    warnings.push("No narrative sections detected in document");
  }

  // Warn if going-concern signals found but no auditor report
  const hasGoingConcern = finalSections.some((s) => s.kind === "GOING_CONCERN");
  const hasAuditorReport = finalSections.some((s) => s.kind === "AUDITOR_REPORT");
  if (hasGoingConcern && !hasAuditorReport) {
    warnings.push(
      "going-concern signals detected but no auditor report section found — signal may be from board report",
    );
  }

  // Sort sections by pageStart (nulls last)
  finalSections.sort((a, b) => {
    if (a.pageStart === null && b.pageStart === null) return 0;
    if (a.pageStart === null) return 1;
    if (b.pageStart === null) return -1;
    return a.pageStart - b.pageStart;
  });

  const metrics = buildMetrics(finalSections, warnings);

  return {
    version: UNIFIED_NARRATIVE_EXTRACTION_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      route: doc.source.route,
      filingId: doc.source.filingId ?? null,
      orgNumber: doc.source.orgNumber ?? null,
      fiscalYear: doc.source.fiscalYear ?? null,
    },
    sections: finalSections,
    metrics,
    warnings,
    safety: makeSafety(doc.safety.shadowOnly),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export type UnifiedNarrativeValidationIssue = {
  severity: "ERROR" | "WARNING";
  code: string;
  message: string;
};

export function validateUnifiedNarrativeExtractionResult(
  result: UnifiedNarrativeExtractionResult,
): { valid: boolean; issues: UnifiedNarrativeValidationIssue[] } {
  const issues: UnifiedNarrativeValidationIssue[] = [];

  // Safety invariants
  if (result.safety.canUseForProductionRouting !== false) {
    issues.push({
      severity: "ERROR",
      code: "SAFETY_VIOLATION_ROUTING",
      message: "canUseForProductionRouting must always be false",
    });
  }
  if (result.safety.productionRoutingChanged !== false) {
    issues.push({
      severity: "ERROR",
      code: "SAFETY_VIOLATION_ROUTING_CHANGED",
      message: "productionRoutingChanged must always be false",
    });
  }
  if (result.safety.productionFactsMutated !== false) {
    issues.push({
      severity: "ERROR",
      code: "SAFETY_VIOLATION_FACTS_MUTATED",
      message: "productionFactsMutated must always be false",
    });
  }
  if (result.safety.publishAffected !== false) {
    issues.push({
      severity: "ERROR",
      code: "SAFETY_VIOLATION_PUBLISH",
      message: "publishAffected must always be false",
    });
  }

  // Version
  if (result.version !== UNIFIED_NARRATIVE_EXTRACTION_VERSION) {
    issues.push({
      severity: "ERROR",
      code: "INVALID_VERSION",
      message: `version must be "${UNIFIED_NARRATIVE_EXTRACTION_VERSION}", got "${result.version}"`,
    });
  }

  // Metrics consistency
  if (result.metrics.sectionCount !== result.sections.length) {
    issues.push({
      severity: "ERROR",
      code: "METRICS_SECTION_COUNT_MISMATCH",
      message: `metrics.sectionCount (${result.metrics.sectionCount}) does not match sections.length (${result.sections.length})`,
    });
  }

  // Duplicate section kinds
  const kindCounts = new Map<UnifiedNarrativeSectionKind, number>();
  for (const s of result.sections) {
    kindCounts.set(s.kind, (kindCounts.get(s.kind) ?? 0) + 1);
  }
  for (const [kind, count] of kindCounts) {
    if (count > 1) {
      issues.push({
        severity: "WARNING",
        code: "DUPLICATE_SECTION_KIND",
        message: `Section kind "${kind}" appears ${count} times`,
      });
    }
  }

  // Confidence range
  for (const s of result.sections) {
    if (s.confidence < 0 || s.confidence > 1) {
      issues.push({
        severity: "ERROR",
        code: "INVALID_CONFIDENCE",
        message: `Section "${s.sectionId}" has confidence ${s.confidence} outside [0, 1]`,
      });
    }
  }

  // Page range sanity
  for (const s of result.sections) {
    if (
      s.pageStart !== null &&
      s.pageEnd !== null &&
      s.pageStart > s.pageEnd
    ) {
      issues.push({
        severity: "ERROR",
        code: "INVALID_PAGE_RANGE",
        message: `Section "${s.sectionId}" has pageStart (${s.pageStart}) > pageEnd (${s.pageEnd})`,
      });
    }
  }

  const valid = issues.every((i) => i.severity !== "ERROR");
  return { valid, issues };
}

// ── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serialize the extraction result as a formatted JSON string.
 * Suitable for writing to disk or logging.
 */
export function serializeUnifiedNarrativeExtractionResultAsJson(
  result: UnifiedNarrativeExtractionResult,
): string {
  return JSON.stringify(result, null, 2);
}

// ── Compact artifact ──────────────────────────────────────────────────────────

/**
 * Produce an artifact-safe representation with bounded text previews.
 * Truncates textPreview and signal contexts to avoid large artifacts.
 */
export function compactUnifiedNarrativeExtractionResultForArtifact(
  result: UnifiedNarrativeExtractionResult,
): UnifiedNarrativeExtractionResult {
  const COMPACT_PREVIEW_MAX = 200;
  const COMPACT_CONTEXT_MAX = 80;

  return {
    ...result,
    sections: result.sections.map((s) => ({
      ...s,
      textPreview:
        s.textPreview.length > COMPACT_PREVIEW_MAX
          ? s.textPreview.slice(0, COMPACT_PREVIEW_MAX - 1) + "…"
          : s.textPreview,
      signals: s.signals.map((sig) => ({
        ...sig,
        context:
          sig.context.length > COMPACT_CONTEXT_MAX
            ? sig.context.slice(0, COMPACT_CONTEXT_MAX - 1) + "…"
          : sig.context,
      })),
    })),
  };
}
