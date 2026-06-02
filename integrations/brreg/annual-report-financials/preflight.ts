import {
  ExtractedLine,
  ExtractedWord,
  PageTextLayer,
  PreflightResult,
} from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText, stripDuplicateWhitespace } from "@/integrations/brreg/annual-report-financials/text";
import { buildAnnualReportDocumentFromPages } from "@/integrations/brreg/annual-report-financials/section-segmentation";

const RELIABLE_TEXT_MIN_CHARS = 120;
let pdfjsModulePromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfjs() {
  // Lazy-load pdfjs so ordinary route evaluation in Next dev does not pull the
  // ESM bundle into unrelated pages before PDF preflight is actually needed.
  pdfjsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsModulePromise;
}

/**
 * True when this page's embedded text layer is rich enough to extract
 * structure from. The honest unit of reliability is the page — the previous
 * design averaged text length across all pages with text, which let a
 * document with 30 prose pages and 6 scanned statement pages average above
 * the threshold and be treated as a "reliable text PDF" even though the
 * statement pages had no extractable text. Per-page reliability lets the
 * service OCR only the pages that need it.
 */
export function isPageReliable(page: PageTextLayer): boolean {
  if (!page.hasEmbeddedText) return false;
  return stripDuplicateWhitespace(page.text).length >= RELIABLE_TEXT_MIN_CHARS;
}

// ─────────────────────────────────────────────────────────────────────────
// Born-digital text extraction with real word geometry
//
// The previous implementation pulled text through pdf-parse and threw away
// the per-word coordinates — words received fabricated x positions in
// left-to-right reading order (x = 0, x = 40, x = 80, …). Column assignment
// in the legacy reconstruction (and in the geometry-first branch of the
// self-correcting loop) then had nothing real to work with on born-digital
// PDFs, even though the geometry was sitting unused in the source.
//
// This path uses pdfjs-dist's getTextContent directly. Each TextItem
// carries a 6-element transform matrix whose 4th and 5th components are the
// origin of the text run; we keep that, flip the y-axis to a top-down
// origin (matching the OCR path), and group items into lines by their
// baseline. Downstream tokenisation handles further splitting.
// ─────────────────────────────────────────────────────────────────────────

type PositionedFragment = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PdfjsTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function isTextItem(item: unknown): item is PdfjsTextItem {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.str === "string" &&
    Array.isArray(candidate.transform) &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

function buildExtractedLine(items: PositionedFragment[], lineIndex: number): ExtractedLine {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const text = stripDuplicateWhitespace(sorted.map((item) => item.text).join("")).trim();
  if (!text) {
    return {
      text: "",
      normalizedText: "",
      x: 0,
      y: lineIndex * 16,
      width: 0,
      height: 12,
      confidence: 0.95,
      words: [],
    };
  }

  const minX = Math.min(...sorted.map((item) => item.x));
  const minY = Math.min(...sorted.map((item) => item.y));
  const maxX = Math.max(...sorted.map((item) => item.x + item.width));
  const maxY = Math.max(...sorted.map((item) => item.y + item.height));

  // pdfjs text items range from individual characters to whole words. For
  // column assignment each item is kept as its own positioned "word"; the
  // tokenisation in the reconstruction layer further splits or merges.
  const words: ExtractedWord[] = sorted
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({
      text: item.text.trim(),
      normalizedText: normalizeNorwegianText(item.text),
      x: item.x,
      y: item.y,
      width: Math.max(1, item.width),
      height: Math.max(1, item.height),
      confidence: 0.95,
      lineNumber: lineIndex,
    }));

  return {
    text,
    normalizedText: normalizeNorwegianText(text),
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    confidence: 0.95,
    words,
  };
}

function groupItemsIntoLines(items: PositionedFragment[]): ExtractedLine[] {
  if (items.length === 0) return [];
  // Sort top-down, then left-to-right within the y-band of a line.
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

  const lineBuckets: PositionedFragment[][] = [[sorted[0]!]];
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    const currentLine = lineBuckets[lineBuckets.length - 1]!;
    const baselineY =
      currentLine.reduce((sum, fragment) => sum + fragment.y, 0) / currentLine.length;
    const avgHeight =
      currentLine.reduce((sum, fragment) => sum + fragment.height, 0) / currentLine.length;
    // Allow items within roughly half a line-height of the running mean to
    // belong to the same line. Tight enough to keep adjacent rows apart,
    // loose enough to absorb small baseline jitter inside one row.
    const tolerance = Math.max(2, avgHeight / 2);
    if (Math.abs(item.y - baselineY) <= tolerance) {
      currentLine.push(item);
    } else {
      lineBuckets.push([item]);
    }
  }

  return lineBuckets.map((bucket, idx) => buildExtractedLine(bucket, idx));
}

async function extractPositionedPages(
  pdfBuffer: Buffer,
): Promise<{ pages: PageTextLayer[]; pageCount: number }> {
  const { getDocument } = await loadPdfjs();
  const doc = await getDocument({
    data: new Uint8Array(pdfBuffer),
    verbosity: 0,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  try {
    const pages: PageTextLayer[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeight = viewport.height;
      const textContent = await page.getTextContent();

      const fragments: PositionedFragment[] = [];
      for (const item of textContent.items) {
        if (!isTextItem(item)) continue;
        if (item.str.length === 0) continue;
        const x = item.transform[4] ?? 0;
        const yPdfBaseline = item.transform[5] ?? 0;
        // pdfjs gives the baseline y in PDF coords (origin bottom-left);
        // flip to top-down so y increases downward, matching the OCR path.
        const y = pageHeight - yPdfBaseline - item.height;
        fragments.push({
          text: item.str,
          x,
          y,
          width: Math.max(0, item.width),
          height: Math.max(0, item.height),
        });
      }

      const lines = groupItemsIntoLines(
        fragments.filter((fragment) => fragment.text.trim().length > 0),
      );
      const pageText = lines
        .map((line) => line.text)
        .filter(Boolean)
        .join("\n");
      const hasEmbeddedText = pageText.trim().length > 0;

      pages.push({
        pageNumber,
        text: pageText,
        normalizedText: normalizeNorwegianText(pageText),
        lines,
        hasEmbeddedText,
      });

      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }
}

export async function preflightAnnualReportDocument(
  pdfBuffer: Buffer,
): Promise<PreflightResult> {
  const { pages: parsedPages, pageCount } = await extractPositionedPages(pdfBuffer);

  const reliablePages = parsedPages.filter(isPageReliable);
  // Document-level reliability is a majority summary of the per-page signal,
  // replacing an averaged-text-length threshold that masked mixed
  // (mostly prose + a few scanned) documents.
  const hasReliableTextLayer =
    parsedPages.length > 0 && reliablePages.length >= parsedPages.length / 2;

  const structuredDocument = buildAnnualReportDocumentFromPages(parsedPages);

  return {
    pageCount,
    hasTextLayer: parsedPages.some((page) => page.hasEmbeddedText),
    hasReliableTextLayer,
    parsedPages,
    diagnostics: structuredDocument.diagnostics,
    recommendedRouteHint: structuredDocument.diagnostics.recommendedRouteHint,
    structuredDocument,
  };
}
