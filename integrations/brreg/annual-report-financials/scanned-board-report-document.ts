import { extractBoardReport } from "@/integrations/brreg/annual-report-financials/board-report-extractor";
import {
  resolveBoardReportPageRangesFromReferenceText,
  type BoardReportPageRange,
} from "@/integrations/brreg/annual-report-financials/board-report-page-range-resolver";
import {
  extractOcrPagesBatched,
  type OcrExtractionOptions,
} from "@/integrations/brreg/annual-report-financials/ocr";
import {
  prepareNarrativeOcrPage,
  removeRepeatedNarrativeChrome,
} from "@/integrations/brreg/annual-report-financials/narrative-ocr-reading-order";
import {
  extractRapidOcrPages,
  rapidOcrIsEnabled,
} from "@/integrations/brreg/annual-report-financials/rapidocr-provider";
import { mergeOcrPageConsensus } from "@/integrations/brreg/annual-report-financials/ocr-consensus";
import { normalizeNorwegianText } from "@/lib/norwegian-text";
import type {
  AnnualReportOcrExtractionResult,
  AnnualReportParsedInputPage,
  AnnualReportParsedPage,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  buildUnifiedParserDocumentFromStructuredDocument,
  type UnifiedParserDocument,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

export type BoardReportOcrPageSet = (
  pdfBuffer: Buffer,
  pageNumbers: number[],
  options: OcrExtractionOptions,
) => Promise<Pick<AnnualReportOcrExtractionResult, "pages">>;

export type ScannedBoardReportDocumentResult = {
  document: UnifiedParserDocument;
  rotationDegrees: 0 | 90 | 270;
  pageRanges: BoardReportPageRange[];
  warnings: string[];
};

const defaultOcr: BoardReportOcrPageSet = (pdfBuffer, pageNumbers, options) =>
  extractOcrPagesBatched(pdfBuffer, pageNumbers, 4, options);

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function expandRanges(ranges: BoardReportPageRange[]): number[] {
  return uniqueSorted(
    ranges.flatMap((range) =>
      Array.from({ length: range.pageEnd - range.pageStart + 1 }, (_, index) => range.pageStart + index),
    ),
  );
}

function readableTextScore(text: string): number {
  const words = text.match(/\p{L}{2,}/gu) ?? [];
  const longWords = words.filter((word) => word.length >= 4).length;
  const isolatedGlyphs = (text.match(/(?:^|\s)[|1IlH](?=\s|$)/g) ?? []).length;
  return words.length * 2 + longWords * 3 + Math.min(text.length, 4_000) / 100 - isolatedGlyphs * 4;
}

function substantiveEditorialBlocks(page: AnnualReportParsedPage) {
  return page.blocks.filter((block) => {
    if (!block.bbox) return false;
    const width = block.bbox.right - block.bbox.left;
    const height = block.bbox.top - block.bbox.bottom;
    const confidence = block.metadata?.confidence;
    return height >= 48 && width >= 180 && (typeof confidence !== "number" || confidence >= 0.85);
  });
}

function asStructuredPage(page: AnnualReportParsedInputPage): AnnualReportParsedPage {
  const structured: AnnualReportParsedPage =
    "blocks" in page && "tables" in page && "source" in page
      ? page
      : {
    ...page,
    blocks: [{
      id: `ocr-page-${page.pageNumber}`,
      kind: "paragraph",
      rawType: "ocr_text",
      text: page.text,
      normalizedText: page.normalizedText,
      bbox: null,
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `ocr-page-${page.pageNumber}`,
        sourceRawType: "ocr_text",
        order: 0,
      },
    }],
    tables: [],
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: `ocr-page-${page.pageNumber}`,
      sourceRawType: "ocr_page",
      order: page.pageNumber,
    },
  };
  return prepareNarrativeOcrPage(structured);
}

function makeDocument(input: {
  pages: AnnualReportParsedPage[];
  source: Partial<UnifiedParserDocument["source"]>;
  documentEngine?: string;
  parserVersion?: string;
}): UnifiedParserDocument {
  return buildUnifiedParserDocumentFromStructuredDocument({
    parsedPages: [...input.pages].sort((left, right) => left.pageNumber - right.pageNumber),
    route: "OCR",
    source: {
      ...input.source,
      documentEngine: input.documentEngine ?? "tesseract",
      parserVersion: input.parserVersion ?? "board-report-ocr-v11-locator",
    },
    shadowOnly: false,
  });
}

async function detectRotation(input: {
  pdfBuffer: Buffer;
  pageCount: number;
  ocr: BoardReportOcrPageSet;
}): Promise<0 | 90 | 270> {
  const samplePage = Math.max(1, Math.min(input.pageCount, Math.floor(input.pageCount / 4)));
  let best: { rotation: 0 | 90 | 270; score: number } = { rotation: 0, score: -Infinity };
  for (const rotation of [0, 90, 270] as const) {
    const result = await input.ocr(input.pdfBuffer, [samplePage], {
      renderScale: 1,
      rotationDegrees: rotation,
      recognitionMode: "auto",
    });
    const score = readableTextScore(result.pages.map((page) => page.text).join("\n"));
    if (score > best.score) best = { rotation, score };
  }
  return best.rotation;
}

export async function buildScannedBoardReportDocument(input: {
  pdfBuffer: Buffer;
  pageCount: number;
  source: Partial<UnifiedParserDocument["source"]>;
  ocr?: BoardReportOcrPageSet;
  contentOcr?: BoardReportOcrPageSet;
}): Promise<ScannedBoardReportDocumentResult> {
  const ocr = input.ocr ?? defaultOcr;
  // The measured primary route is Tesseract. RapidOCR reduced Jotun's
  // page-level word F1 from >99.4% to 96.7-98.1%, so it is never allowed to
  // rewrite ordinary content pages. It remains a narrow low-content fallback.
  const contentOcr = ocr;
  const fallbackOcr = input.contentOcr ?? (rapidOcrIsEnabled() ? extractRapidOcrPages : ocr);
  const useConsensus =
    fallbackOcr !== ocr &&
    process.env.BOARD_REPORT_OCR_CONSENSUS?.trim().toLowerCase() !== "false";
  let usedFallback = false;
  const rotationDegrees = await detectRotation({ ...input, ocr });
  const firstWindowEnd = Math.min(48, input.pageCount);
  const tailWindowStart = Math.max(1, input.pageCount - 15);
  const tailPageNumbers = Array.from(
    { length: input.pageCount - tailWindowStart + 1 },
    (_, index) => tailWindowStart + index,
  );
  const tail = await ocr(input.pdfBuffer, tailPageNumbers, {
    renderScale: 1,
    rotationDegrees,
    recognitionMode: "auto",
  });
  const pages = new Map(tail.pages.map((page) => [page.pageNumber, asStructuredPage(page)]));

  let reference = [...pages.values()]
    .map((page) =>
      resolveBoardReportPageRangesFromReferenceText({
        pdfPageNumber: page.pageNumber,
        text: page.text,
      }),
    )
    .find((candidate) => candidate !== null) ?? null;

  if (!reference) {
    const headPageNumbers = Array.from({ length: firstWindowEnd }, (_, index) => index + 1)
      .filter((pageNumber) => !pages.has(pageNumber));
    const head = await ocr(input.pdfBuffer, headPageNumbers, {
      renderScale: 1,
      rotationDegrees,
      recognitionMode: "auto",
    });
    for (const page of head.pages) pages.set(page.pageNumber, asStructuredPage(page));
    reference = [...pages.values()]
      .map((page) =>
        resolveBoardReportPageRangesFromReferenceText({
          pdfPageNumber: page.pageNumber,
          text: page.text,
        }),
      )
      .find((candidate) => candidate !== null) ?? null;
  }

  let pageRanges = reference?.pageRanges ?? [];
  let contentLanguages: OcrExtractionOptions["languages"] = reference ? "nor" : "nor+eng";
  if (pageRanges.length === 0) {
    const preliminary = extractBoardReport(makeDocument({ pages: [...pages.values()], source: input.source }), {
      sourceSystem: "BRREG",
      sourceEntityType: "ANNUAL_REPORT_PDF",
      sourceId: `${input.source.orgNumber ?? "unknown"}-${input.source.fiscalYear ?? "unknown"}`,
      sourceUrl: "https://data.brreg.no/regnskapsregisteret/regnskap/aarsregnskap/kopi/",
      sourceDocumentHash: "0".repeat(64),
      fetchedAt: new Date(0).toISOString(),
    });
    pageRanges = preliminary.pageRanges;
  }

  // If neither the report's reference table nor a conventional heading was
  // found in the cheap windows, widen localization to the remaining pages.
  if (pageRanges.length === 0) {
    const remaining = Array.from({ length: input.pageCount }, (_, index) => index + 1)
      .filter((pageNumber) => !pages.has(pageNumber));
    if (remaining.length > 0) {
      const widened = await ocr(input.pdfBuffer, remaining, {
        renderScale: 1,
        rotationDegrees,
        recognitionMode: "auto",
        languages: contentLanguages,
      });
      for (const page of widened.pages) pages.set(page.pageNumber, asStructuredPage(page));
    }
  } else {
    const targetPages = expandRanges(pageRanges);
    const missingPrimaryPages = (contentOcr === ocr || useConsensus)
      ? (contentLanguages === "nor+eng"
          ? targetPages.filter((pageNumber) => !pages.has(pageNumber))
          : targetPages)
      : [];
    if (missingPrimaryPages.length > 0) {
      const primaryContent = await ocr(input.pdfBuffer, missingPrimaryPages, {
        renderScale: 1,
        rotationDegrees,
        recognitionMode: "auto",
        languages: contentLanguages,
      });
      for (const page of primaryContent.pages) pages.set(page.pageNumber, asStructuredPage(page));
    }
  }

  let finalPages = removeRepeatedNarrativeChrome([...pages.values()]);
  if (reference && fallbackOcr !== ocr) {
    const emptyTargetPages = expandRanges(pageRanges).filter((pageNumber) => {
      const page = finalPages.find((candidate) => candidate.pageNumber === pageNumber);
      const retainedLetterCount = page
        ? (page.blocks.map((block) => block.text).join(" ").match(/\p{L}/gu) ?? []).length
        : 0;
      return (
        retainedLetterCount < 40 ||
        (retainedLetterCount < 600 && (page ? substantiveEditorialBlocks(page).length === 0 : true))
      );
    });
    if (emptyTargetPages.length > 0) {
      const secondaryContent = await fallbackOcr(input.pdfBuffer, emptyTargetPages, {
        renderScale: 1,
        rotationDegrees,
        recognitionMode: "auto",
        languages: contentLanguages,
      });
      usedFallback = secondaryContent.pages.length > 0;
      for (const page of secondaryContent.pages) {
        const secondary = asStructuredPage(page);
        const primary = pages.get(page.pageNumber);
        pages.set(
          page.pageNumber,
          primary && useConsensus
            ? prepareNarrativeOcrPage(mergeOcrPageConsensus(primary, secondary))
            : secondary,
        );
      }
      finalPages = removeRepeatedNarrativeChrome([...pages.values()]);
      for (const pageNumber of emptyTargetPages) {
        const cleaned = finalPages.find((candidate) => candidate.pageNumber === pageNumber);
        const cleanedLetterCount = cleaned
          ? (cleaned.text.match(/\p{L}/gu) ?? []).length
          : 0;
        if (
          cleanedLetterCount >= 600 ||
          (cleanedLetterCount >= 40 &&
            cleaned &&
            substantiveEditorialBlocks(cleaned).length > 0)
        ) continue;
        const merged = pages.get(pageNumber);
        if (!merged) continue;
        const editorialBlocks = substantiveEditorialBlocks(merged);
        if (editorialBlocks.length === 0) continue;
        const text = editorialBlocks.map((block) => block.text.trim()).filter(Boolean).join("\n");
        const editorialPage = {
          ...merged,
          blocks: editorialBlocks,
          text,
          normalizedText: normalizeNorwegianText(text),
        };
        const index = finalPages.findIndex((candidate) => candidate.pageNumber === pageNumber);
        if (index >= 0) finalPages[index] = editorialPage;
        else finalPages.push(editorialPage);
      }
    }
  }
  return {
    document: makeDocument({
      pages: finalPages,
      source: input.source,
      documentEngine:
        usedFallback ? (useConsensus ? "tesseract+rapidocr" : "rapidocr") : "tesseract",
      parserVersion:
        !usedFallback
          ? "board-report-ocr-v13-accuracy-tesseract"
          : useConsensus
            ? "board-report-ocr-v13-accuracy-fallback-consensus"
            : "board-report-ocr-v13-accuracy-fallback-rapidocr",
    }),
    rotationDegrees,
    pageRanges,
    warnings: [
      `Scanned annual report used Tesseract OCR with automatic ${rotationDegrees}-degree rotation.`,
      ...(reference
        ? [`Distributed board-report ranges were resolved from source page ${reference.evidencePdfPageNumber}.`]
        : []),
      ...(usedFallback
        ? [useConsensus
            ? "Board-report content pages were reconciled with Tesseract/RapidOCR consensus."
            : "Board-report content pages were read with RapidOCR without consensus."]
        : []),
    ],
  };
}
