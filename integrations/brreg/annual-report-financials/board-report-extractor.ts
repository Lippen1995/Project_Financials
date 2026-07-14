import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import type {
  UnifiedParserDocument,
  UnifiedParserRoute,
  UnifiedParserTextBlock,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

export const BOARD_REPORT_EXTRACTION_VERSION = "board-report-extraction-v1" as const;

export type BoardReportExtractionStatus =
  | "EXTRACTED"
  | "NOT_FOUND"
  | "MANUAL_REVIEW"
  | "UNREADABLE"
  | "SOURCE_UNAVAILABLE"
  | "FAILED";

export type BoardReportTextBoundary = {
  pageNumber: number;
  blockId: string;
  charOffset: number;
};

export type BoardReportSourceBlockRef = {
  pageNumber: number;
  blockId: string;
  startOffset: number;
  endOffset: number;
};

export type BoardReportDetectionSignal = {
  kind: "START" | "STOP";
  keyword: string;
  pageNumber: number;
  blockId: string;
  charOffset: number;
  weight: number;
};

export type BoardReportWarning = {
  code: string;
  message: string;
};

export type BoardReportExtractionSource = {
  sourceSystem: "BRREG";
  sourceEntityType: "ANNUAL_REPORT_PDF";
  sourceId: string;
  sourceUrl: string;
  sourceDocumentHash: string;
  fetchedAt: string;
  normalizedAt?: string;
};

export type BoardReportExtractionResult = {
  version: typeof BOARD_REPORT_EXTRACTION_VERSION;
  status: BoardReportExtractionStatus;
  filingId: string | null;
  orgNumber: string | null;
  fiscalYear: number | null;
  text: string | null;
  normalizedText: string | null;
  title: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  startBoundary: BoardReportTextBoundary | null;
  endBoundary: BoardReportTextBoundary | null;
  includedBlocks: BoardReportSourceBlockRef[];
  confidence: number;
  quality: {
    startBoundaryConfidence: number;
    endBoundaryConfidence: number;
    textQualityConfidence: number;
    contaminationRisk: number;
  };
  matchedStartSignals: BoardReportDetectionSignal[];
  matchedStopSignals: BoardReportDetectionSignal[];
  warnings: BoardReportWarning[];
  route: UnifiedParserRoute;
  parserVersion: string | null;
  extractorVersion:
    | typeof BOARD_REPORT_EXTRACTION_VERSION
    | `${typeof BOARD_REPORT_EXTRACTION_VERSION}:${string}`;
  sourceSystem: "BRREG";
  sourceEntityType: "ANNUAL_REPORT_PDF";
  sourceId: string;
  sourceUrl: string;
  sourceDocumentHash: string;
  fetchedAt: string;
  normalizedAt: string;
};

type LineRef = {
  block: UnifiedParserTextBlock;
  pageNumber: number;
  text: string;
  normalizedText: string;
  startOffset: number;
  endOffset: number;
};

type HeadingPattern = { keyword: string; weight: number; pattern: RegExp };

const START_HEADINGS: HeadingPattern[] = [
  { keyword: "styrets arsberetning", weight: 5, pattern: /^styrets arsberetning(?:\s+\d{4})?$/ },
  { keyword: "styrets beretning", weight: 5, pattern: /^styrets beretning(?:\s+\d{4})?$/ },
  { keyword: "arsberetning", weight: 4, pattern: /^arsberetning(?:\s+\d{4})?$/ },
  { keyword: "beretning fra styret", weight: 5, pattern: /^beretning fra styret$/ },
  { keyword: "styrets redegjorelse", weight: 4, pattern: /^styrets redegjorelse$/ },
  { keyword: "directors report", weight: 5, pattern: /^(?:board of )?directors report$/ },
  { keyword: "report of the board of directors", weight: 5, pattern: /^report of the board of directors$/ },
];

const STOP_HEADINGS: HeadingPattern[] = [
  { keyword: "resultatregnskap", weight: 5, pattern: /^resultatregnskap(?:et)?(?:\s+\d{4})?$/ },
  {
    keyword: "oppstilling over totalresultat",
    weight: 5,
    pattern: /^oppstilling over totalresultat(?:et)?$/,
  },
  { keyword: "balanse", weight: 5, pattern: /^(?:balanse|balanseoppstilling)(?:\s+\d{4})?$/ },
  {
    keyword: "kontantstromoppstilling",
    weight: 5,
    pattern: /^(?:kontantstromoppstilling|kontantstrom)(?:\s+\d{4})?$/,
  },
  {
    keyword: "noter til arsregnskapet",
    weight: 5,
    pattern: /^noter til (?:arsregnskapet|regnskapet)$/,
  },
  { keyword: "regnskapsprinsipper", weight: 4, pattern: /^regnskapsprinsipper$/ },
  {
    keyword: "uavhengig revisors beretning",
    weight: 5,
    pattern: /^(?:uavhengig )?revisors beretning$/,
  },
  { keyword: "revisjonsberetning", weight: 5, pattern: /^revisjonsberetning$/ },
  { keyword: "income statement", weight: 5, pattern: /^(?:statement of )?income(?: statement)?$/ },
  { keyword: "balance sheet", weight: 5, pattern: /^balance sheet$/ },
  { keyword: "notes", weight: 4, pattern: /^notes to the (?:annual )?financial statements$/ },
  {
    keyword: "independent auditor report",
    weight: 5,
    pattern: /^independent auditor(?:s)? report$/,
  },
];

const BODY_SIGNALS = [
  "virksomhetens art",
  "fortsatt drift",
  "arbeidsmiljo",
  "ytre miljo",
  "likestilling",
  "utvikling og resultat",
  "framtidsutsikter",
  "fremtidsutsikter",
];

function roundScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function normalizeHeading(value: string): string {
  return normalizeNorwegianText(value)
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function orderedBlocks(document: UnifiedParserDocument): UnifiedParserTextBlock[] {
  return [...document.pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .flatMap((page) => page.blocks);
}

function linesFromBlock(block: UnifiedParserTextBlock): LineRef[] {
  const result: LineRef[] = [];
  const matcher = /[^\r\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(block.text)) !== null) {
    const text = match[0].trim();
    if (!text) continue;
    const leadingWhitespace = match[0].length - match[0].trimStart().length;
    const startOffset = match.index + leadingWhitespace;
    result.push({
      block,
      pageNumber: block.source.pageNumber,
      text,
      normalizedText: normalizeHeading(text),
      startOffset,
      endOffset: startOffset + text.length,
    });
  }
  return result;
}

function matchHeading(line: LineRef, patterns: HeadingPattern[]): HeadingPattern | null {
  return patterns.find((candidate) => candidate.pattern.test(line.normalizedText)) ?? null;
}

function isLikelyTableOfContents(line: LineRef, pageLines: LineRef[]): boolean {
  if (/\.{2,}\s*\d+$/.test(line.text)) return true;
  const topLevelHits = pageLines.filter(
    (candidate) =>
      matchHeading(candidate, START_HEADINGS) !== null ||
      matchHeading(candidate, STOP_HEADINGS) !== null,
  );
  return topLevelHits.length >= 3;
}

function textQuality(blocks: UnifiedParserTextBlock[]): number {
  if (blocks.length === 0) return 0;
  const scores = blocks.map((block) => block.confidence ?? 0.95);
  return roundScore(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function baseResult(
  document: UnifiedParserDocument,
  source: BoardReportExtractionSource,
): Omit<BoardReportExtractionResult, "status"> {
  return {
    version: BOARD_REPORT_EXTRACTION_VERSION,
    filingId: document.source.filingId,
    orgNumber: document.source.orgNumber,
    fiscalYear: document.source.fiscalYear,
    text: null,
    normalizedText: null,
    title: null,
    pageStart: null,
    pageEnd: null,
    startBoundary: null,
    endBoundary: null,
    includedBlocks: [],
    confidence: 0,
    quality: {
      startBoundaryConfidence: 0,
      endBoundaryConfidence: 0,
      textQualityConfidence: 0,
      contaminationRisk: 0,
    },
    matchedStartSignals: [],
    matchedStopSignals: [],
    warnings: [],
    route: document.source.route,
    parserVersion: document.source.parserVersion,
    extractorVersion: BOARD_REPORT_EXTRACTION_VERSION,
    ...source,
    normalizedAt: source.normalizedAt ?? new Date().toISOString(),
  };
}

export function extractBoardReport(
  document: UnifiedParserDocument,
  source: BoardReportExtractionSource,
): BoardReportExtractionResult {
  const initial = baseResult(document, source);
  const blocks = orderedBlocks(document).filter(
    (block) => block.kind !== "PAGE_HEADER" && block.kind !== "PAGE_FOOTER",
  );
  if (blocks.length === 0 || blocks.every((block) => block.text.trim().length === 0)) {
    return {
      ...initial,
      status: "UNREADABLE",
      warnings: [{ code: "NO_USABLE_TEXT", message: "Document contains no usable text blocks." }],
    };
  }

  const lines = blocks.flatMap(linesFromBlock);
  const pageLines = new Map<number, LineRef[]>();
  for (const line of lines) {
    const existing = pageLines.get(line.pageNumber) ?? [];
    existing.push(line);
    pageLines.set(line.pageNumber, existing);
  }

  const startCandidates = lines
    .map((line, lineIndex) => ({ line, lineIndex, heading: matchHeading(line, START_HEADINGS) }))
    .filter(
      (candidate): candidate is { line: LineRef; lineIndex: number; heading: HeadingPattern } =>
        candidate.heading !== null &&
        !isLikelyTableOfContents(candidate.line, pageLines.get(candidate.line.pageNumber) ?? []),
    );

  if (startCandidates.length === 0) {
    return {
      ...initial,
      status: "NOT_FOUND",
      warnings: [
        { code: "BOARD_REPORT_START_NOT_FOUND", message: "No credible board-report heading found." },
      ],
    };
  }

  const candidates = startCandidates.map((start) => {
    const followingLines = lines.slice(start.lineIndex + 1);
    const stopOffset = followingLines.findIndex((line) => matchHeading(line, STOP_HEADINGS) !== null);
    const stopLine = stopOffset >= 0 ? followingLines[stopOffset] : null;
    const stopHeading = stopLine ? matchHeading(stopLine, STOP_HEADINGS) : null;
    const contentLines = lines.slice(
      start.lineIndex,
      stopLine ? start.lineIndex + 1 + stopOffset : lines.length,
    );
    const normalizedContent = normalizeHeading(contentLines.map((line) => line.text).join(" "));
    const bodySignalCount = BODY_SIGNALS.filter((signal) => normalizedContent.includes(signal)).length;
    const score = start.heading.weight * 2 + bodySignalCount * 2 + (stopHeading?.weight ?? 0);
    return { ...start, stopLine, stopHeading, contentLines, bodySignalCount, score };
  });

  candidates.sort((left, right) => right.score - left.score || left.lineIndex - right.lineIndex);
  const best = candidates[0]!;
  const runnerUp = candidates[1];
  if (runnerUp && runnerUp.score >= best.score - 1) {
    return {
      ...initial,
      status: "MANUAL_REVIEW",
      matchedStartSignals: startCandidates.map((candidate) => ({
        kind: "START",
        keyword: candidate.heading.keyword,
        pageNumber: candidate.line.pageNumber,
        blockId: candidate.line.block.blockId,
        charOffset: candidate.line.startOffset,
        weight: candidate.heading.weight,
      })),
      warnings: [
        {
          code: "COMPETING_START_CANDIDATES",
          message: "Multiple board-report start candidates have similar evidence.",
        },
      ],
    };
  }

  const startSignal: BoardReportDetectionSignal = {
    kind: "START",
    keyword: best.heading.keyword,
    pageNumber: best.line.pageNumber,
    blockId: best.line.block.blockId,
    charOffset: best.line.startOffset,
    weight: best.heading.weight,
  };
  const stopSignal: BoardReportDetectionSignal | null =
    best.stopLine && best.stopHeading
      ? {
          kind: "STOP",
          keyword: best.stopHeading.keyword,
          pageNumber: best.stopLine.pageNumber,
          blockId: best.stopLine.block.blockId,
          charOffset: best.stopLine.startOffset,
          weight: best.stopHeading.weight,
        }
      : null;

  const selectedBlockRanges = new Map<string, BoardReportSourceBlockRef>();
  for (const line of best.contentLines) {
    const existing = selectedBlockRanges.get(line.block.blockId);
    if (existing) {
      existing.endOffset = Math.max(existing.endOffset, line.endOffset);
    } else {
      selectedBlockRanges.set(line.block.blockId, {
        pageNumber: line.pageNumber,
        blockId: line.block.blockId,
        startOffset: line.startOffset,
        endOffset: line.endOffset,
      });
    }
  }
  if (best.stopLine) {
    const finalRange = selectedBlockRanges.get(best.stopLine.block.blockId);
    if (finalRange) {
      finalRange.endOffset = best.stopLine.startOffset;
    }
  }
  const includedBlocks = [...selectedBlockRanges.values()];
  const selectedBlocks = includedBlocks
    .map((reference) => blocks.find((block) => block.blockId === reference.blockId))
    .filter((block): block is UnifiedParserTextBlock => Boolean(block));
  const text = includedBlocks
    .map((reference) => {
      const block = blocks.find((candidate) => candidate.blockId === reference.blockId)!;
      return block.text.slice(reference.startOffset, reference.endOffset).trim();
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const startBoundaryConfidence = roundScore(0.7 + best.heading.weight * 0.05);
  const endBoundaryConfidence = best.stopHeading
    ? roundScore(0.7 + best.stopHeading.weight * 0.05)
    : 0.45;
  const textQualityConfidence = textQuality(selectedBlocks);
  const selectedNormalizedText = normalizeNorwegianText(text);
  const auditorTextContamination = [
    "vi har revidert",
    "grunnlag for konklusjon",
    "etter var mening gir arsregnskapet",
    "uavhengig revisor",
  ].some((signal) => selectedNormalizedText.includes(signal));
  const tableBlockShare =
    selectedBlocks.length > 0
      ? selectedBlocks.filter((block) => block.kind === "TABLE_TEXT").length /
        selectedBlocks.length
      : 0;
  const contaminationRisk = roundScore(
    Math.max(auditorTextContamination ? 0.85 : 0, tableBlockShare * 0.5),
  );
  const confidence = roundScore(
    Math.min(
      startBoundaryConfidence,
      endBoundaryConfidence,
      textQualityConfidence,
      1 - contaminationRisk,
    ),
  );
  const warnings: BoardReportWarning[] = [];
  if (!best.stopLine) {
    warnings.push({
      code: "BOARD_REPORT_STOP_NOT_FOUND",
      message: "No safe top-level section heading marks the end of the board report.",
    });
  }
  if (text.length < 80) {
    warnings.push({
      code: "BOARD_REPORT_TEXT_TOO_SHORT",
      message: "The candidate board-report text is implausibly short.",
    });
  }
  if (auditorTextContamination) {
    warnings.push({
      code: "AUDITOR_TEXT_CONTAMINATION",
      message: "Auditor-report language appears inside the proposed board-report span.",
    });
  }
  if (tableBlockShare > 0.1) {
    warnings.push({
      code: "FINANCIAL_TABLE_CONTAMINATION",
      message: "Table blocks occupy a material share of the proposed board-report span.",
    });
  }

  const status: BoardReportExtractionStatus =
    best.stopLine && text.length >= 80 && confidence >= 0.9 && contaminationRisk <= 0.05
      ? "EXTRACTED"
      : "MANUAL_REVIEW";
  const lastIncluded = includedBlocks.at(-1) ?? null;

  return {
    ...initial,
    status,
    text,
    normalizedText: normalizeNorwegianText(text),
    title: best.line.text,
    pageStart: best.line.pageNumber,
    pageEnd: lastIncluded?.pageNumber ?? best.line.pageNumber,
    startBoundary: {
      pageNumber: best.line.pageNumber,
      blockId: best.line.block.blockId,
      charOffset: best.line.startOffset,
    },
    endBoundary: best.stopLine
      ? {
          pageNumber: best.stopLine.pageNumber,
          blockId: best.stopLine.block.blockId,
          charOffset: best.stopLine.startOffset,
        }
      : null,
    includedBlocks,
    confidence,
    quality: {
      startBoundaryConfidence,
      endBoundaryConfidence,
      textQualityConfidence,
      contaminationRisk,
    },
    matchedStartSignals: [startSignal],
    matchedStopSignals: stopSignal ? [stopSignal] : [],
    warnings,
  };
}
