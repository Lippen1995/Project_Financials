import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import type {
  AnnualReportPageBlock,
  AnnualReportParsedPage,
  ExtractedWord,
} from "@/integrations/brreg/annual-report-financials/types";

function blockFromWords(
  page: AnnualReportParsedPage,
  words: ExtractedWord[],
  index: number,
): AnnualReportPageBlock {
  const left = Math.min(...words.map((word) => word.x));
  const bottom = Math.min(...words.map((word) => word.y));
  const right = Math.max(...words.map((word) => word.x + word.width));
  const top = Math.max(...words.map((word) => word.y + word.height));
  const text = words.map((word) => word.text).join(" ");
  return {
    id: `narrative-ocr-${page.pageNumber}-${index}`,
    kind: "paragraph",
    rawType: "narrative_ocr_line",
    text,
    normalizedText: normalizeNorwegianText(text),
    bbox: { left, bottom, right, top },
    metadata: {
      confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
    },
    source: {
      ...page.source,
      sourceElementId: `narrative-ocr-${page.pageNumber}-${index}`,
      sourceRawType: "narrative_ocr_line",
      order: index,
    },
  };
}

function narrativeSourceBlocks(page: AnnualReportParsedPage): AnnualReportPageBlock[] {
  if (page.lines.length === 0) return page.blocks.filter((block) => block.kind !== "table");
  const blocks: AnnualReportPageBlock[] = [];
  for (const line of page.lines) {
    const words = [...line.words].sort((left, right) => left.x - right.x);
    if (words.length === 0) continue;
    const groups: ExtractedWord[][] = [];
    for (const word of words) {
      const group = groups.at(-1);
      const previous = group?.at(-1);
      const gap = previous ? word.x - (previous.x + previous.width) : 0;
      const threshold = Math.max(70, word.height * 5);
      if (!group || gap > threshold) groups.push([word]);
      else group.push(word);
    }
    for (const group of groups) blocks.push(blockFromWords(page, group, blocks.length));
  }
  return blocks;
}

function isPrintedReportFooter(block: AnnualReportPageBlock): boolean {
  const normalized = normalizeNorwegianText(block.text);
  return (
    /\bannual report\s+20\d{2}\s+\d{1,3}\s*$/.test(normalized) ||
    /\bars\s*[-–]?\s*og baerek\s*raftsrapport\s+20\d{2}\s*$/.test(normalized) ||
    /^\d{1,3}\s+.*ars\s*[-–]?\s*og baerek\s*raftsrapport\s+20\d{2}$/.test(normalized)
  );
}

function isBrregChrome(block: AnnualReportPageBlock, pageHeight: number): boolean {
  const normalized = normalizeNorwegianText(block.text);
  const y = block.bbox?.bottom ?? pageHeight / 2;
  const blockConfidence = block.metadata?.confidence;
  const letterCount = (block.text.match(/\p{L}/gu) ?? []).length;
  const wordCount = block.text.trim().split(/\s+/).filter(Boolean).length;
  if (letterCount <= 2 && block.text.trim().length <= 8) return true;
  if (
    typeof blockConfidence === "number" &&
    blockConfidence < 0.6 &&
    wordCount <= 4
  ) return true;
  if (block.bbox) {
    const width = block.bbox.right - block.bbox.left;
    const height = block.bbox.top - block.bbox.bottom;
    if (height < 0) return true;
    if (height > 100 && height > width * 3) return true;
  }
  if (pageHeight > 800 && y < pageHeight * 0.14) return true;
  if (
    normalized.includes("sealed with a digital signature") ||
    normalized.includes("forseglet med en digital signatur") ||
    normalized.includes("guarantee for the authenticity") ||
    normalized.startsWith("document id")
  ) {
    return true;
  }
  if (isPrintedReportFooter(block)) return true;
  return false;
}

function clusterStarts(blocks: AnnualReportPageBlock[], pageWidth: number): number[] {
  const starts = blocks
    .map((block) => block.bbox?.left)
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right);
  const tolerance = Math.max(120, pageWidth * 0.12);
  const clusters: number[] = [];
  for (const start of starts) {
    const nearestIndex = clusters.findIndex((cluster) => Math.abs(cluster - start) <= tolerance);
    if (nearestIndex < 0) {
      clusters.push(start);
    } else {
      clusters[nearestIndex] = (clusters[nearestIndex]! + start) / 2;
    }
  }
  return clusters.sort((left, right) => left - right);
}

function nearestCluster(value: number, starts: number[]): number {
  let bestIndex = 0;
  let bestDistance = Infinity;
  starts.forEach((start, index) => {
    const distance = Math.abs(value - start);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}

/**
 * Converts OCR's geometric line set into narrative reading order. Brreg's
 * sealed copies place a rotated navigation strip and signature seal around
 * the report; those are source chrome, not part of the board report itself.
 */
export function prepareNarrativeOcrPage(page: AnnualReportParsedPage): AnnualReportParsedPage {
  const sourceBlocks = narrativeSourceBlocks(page);
  const boxes = sourceBlocks.map((block) => block.bbox).filter((bbox) => bbox !== null);
  const pageWidth = Math.max(1, ...boxes.map((bbox) => bbox!.right));
  const pageHeight = Math.max(1, ...boxes.map((bbox) => bbox!.top));
  const isBoardReportReferencePage = normalizeNorwegianText(page.text).includes(
    "styrets arsberetning er dekket i folgende seksjoner",
  );
  const clean = sourceBlocks.filter(
    (block) =>
      !isBrregChrome(block, pageHeight) ||
      (isBoardReportReferencePage &&
        (isPrintedReportFooter(block) ||
          /^\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?\s*$/.test(block.text))),
  );
  const signatureAnchor = clean.find((block) => {
    const normalized = normalizeNorwegianText(block.text);
    return (
      /\b(?:19|20)\d{2}\b/.test(normalized) &&
      (normalized.includes("norway") || normalized.includes("norge") || normalized.includes("oslo"))
    );
  });
  const signatureY = signatureAnchor?.bbox?.bottom ?? Infinity;
  const narrative = clean.filter((block) => (block.bbox?.bottom ?? 0) < signatureY);
  const signatures = clean.filter((block) => (block.bbox?.bottom ?? 0) >= signatureY);
  const starts = clusterStarts(narrative, pageWidth);
  const orderedNarrative = [...narrative].sort((left, right) => {
    const leftBox = left.bbox;
    const rightBox = right.bbox;
    if (!leftBox || !rightBox || starts.length <= 1) {
      return (leftBox?.bottom ?? 0) - (rightBox?.bottom ?? 0);
    }
    const columnDifference =
      nearestCluster(leftBox.left, starts) - nearestCluster(rightBox.left, starts);
    return columnDifference || leftBox.bottom - rightBox.bottom || leftBox.left - rightBox.left;
  });
  const orderedSignatures = [...signatures].sort((left, right) =>
    (left.bbox?.bottom ?? 0) - (right.bbox?.bottom ?? 0) ||
    (left.bbox?.left ?? 0) - (right.bbox?.left ?? 0),
  );
  const blocks = [...orderedNarrative, ...orderedSignatures].map((block, order) => ({
    ...block,
    source: { ...block.source, order },
  }));
  const text = blocks.map((block) => block.text.trim()).filter(Boolean).join("\n");
  return {
    ...page,
    text,
    normalizedText: normalizeNorwegianText(text),
    blocks,
  };
}

export function removeRepeatedNarrativeChrome(
  pages: AnnualReportParsedPage[],
): AnnualReportParsedPage[] {
  const isLargeEditorialTitle = (block: AnnualReportPageBlock) => {
    if (!block.bbox) return false;
    const width = block.bbox.right - block.bbox.left;
    const height = block.bbox.top - block.bbox.bottom;
    const confidence = block.metadata?.confidence;
    return height >= 60 && width >= 300 && (typeof confidence !== "number" || confidence >= 0.8);
  };
  const repeatedKey = (block: AnnualReportPageBlock) => {
    const text = normalizeNorwegianText(block.text).replace(/\s+/g, " ").trim();
    const leftBand = Math.round((block.bbox?.left ?? -1) / 50);
    const topBand = Math.round((block.bbox?.bottom ?? -1) / 50);
    return `${text}|${leftBand}|${topBand}`;
  };
  const pageNumbersByText = new Map<string, Set<number>>();
  for (const page of pages) {
    for (const block of page.blocks) {
      const text = normalizeNorwegianText(block.text).replace(/\s+/g, " ").trim();
      if (!text || text.length > 120) continue;
      const key = repeatedKey(block);
      const pageNumbers = pageNumbersByText.get(key) ?? new Set<number>();
      pageNumbers.add(page.pageNumber);
      pageNumbersByText.set(key, pageNumbers);
    }
  }
  const repeated = new Set(
    [...pageNumbersByText.entries()]
      .filter(([, pageNumbers]) => pageNumbers.size >= 3)
      .map(([text]) => text),
  );
  return pages.map((page) => {
    const seenOnPage = new Set<string>();
    const blocks = page.blocks.filter((block) => {
      const text = normalizeNorwegianText(block.text).replace(/\s+/g, " ").trim();
      const key = repeatedKey(block);
      if (isLargeEditorialTitle(block)) return true;
      if (repeated.has(key)) return false;
      if (seenOnPage.has(key)) return false;
      seenOnPage.add(key);
      return true;
    });
    const text = blocks.map((block) => block.text).join("\n");
    return { ...page, blocks, text, normalizedText: normalizeNorwegianText(text) };
  });
}
