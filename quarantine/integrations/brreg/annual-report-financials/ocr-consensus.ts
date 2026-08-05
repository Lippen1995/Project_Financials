import { normalizeNorwegianText } from "@/lib/norwegian-text";
import type {
  AnnualReportPageBlock,
  AnnualReportParsedPage,
} from "@/integrations/brreg/annual-report-financials/types";

function confidence(block: AnnualReportPageBlock): number {
  const value = block.metadata?.confidence;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function canonicalLetters(value: string): string {
  return normalizeNorwegianText(value).replace(/[^a-z0-9]/g, "");
}

function oneCharacterApart(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) rows[row]![0] = row;
  for (let column = 0; column <= right.length; column += 1) rows[0]![column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row]![column] = Math.min(
        rows[row - 1]![column]! + 1,
        rows[row]![column - 1]! + 1,
        rows[row - 1]![column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
  }
  return rows[left.length]![right.length] === 1;
}

function centre(block: AnnualReportPageBlock): { x: number; y: number; height: number } | null {
  if (!block.bbox) return null;
  return {
    x: (block.bbox.left + block.bbox.right) / 2,
    y: (block.bbox.bottom + block.bbox.top) / 2,
    height: Math.max(1, block.bbox.top - block.bbox.bottom),
  };
}

function isLargeEditorialBlock(block: AnnualReportPageBlock): boolean {
  if (!block.bbox) return false;
  return (
    block.bbox.top - block.bbox.bottom >= 48 &&
    block.bbox.right - block.bbox.left >= 180 &&
    confidence(block) >= 0.85
  );
}

function matchingSecondary(
  primary: AnnualReportPageBlock,
  secondary: AnnualReportPageBlock[],
): AnnualReportPageBlock | null {
  const primaryCentre = centre(primary);
  if (!primaryCentre) return null;
  const candidates = secondary
    .map((block) => ({ block, centre: centre(block) }))
    .filter((item): item is { block: AnnualReportPageBlock; centre: NonNullable<ReturnType<typeof centre>> } =>
      item.centre !== null &&
      Math.abs(item.centre.y - primaryCentre.y) <= Math.max(24, primaryCentre.height * 1.5),
    )
    .map((item) => ({
      ...item,
      distance: Math.hypot(item.centre.x - primaryCentre.x, item.centre.y - primaryCentre.y),
    }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (!best || best.distance > Math.max(80, primaryCentre.height * 5)) return null;
  return best.block;
}

/**
 * Keeps the primary engine's complete line set and lets a second independent
 * OCR engine correct only geometrically matched lines with materially stronger
 * confidence. This prevents a weaker engine from adding invented or duplicate
 * content while still resolving plausible single-word OCR errors.
 */
export function mergeOcrPageConsensus(
  primary: AnnualReportParsedPage,
  secondary: AnnualReportParsedPage,
): AnnualReportParsedPage {
  if (primary.pageNumber !== secondary.pageNumber) {
    throw new Error("OCR consensus pages must have the same page number.");
  }
  const matchedSecondaryIds = new Set<string>();
  const blocks = primary.blocks.map((primaryBlock) => {
    const secondaryBlock = matchingSecondary(primaryBlock, secondary.blocks);
    if (secondaryBlock) matchedSecondaryIds.add(secondaryBlock.id);
    const primaryCanonical = canonicalLetters(primaryBlock.text);
    const secondaryCanonical = secondaryBlock ? canonicalLetters(secondaryBlock.text) : "";
    const bothSingleWords =
      /^\p{L}+$/u.test(primaryBlock.text.trim()) &&
      /^\p{L}+$/u.test(secondaryBlock?.text.trim() ?? "");
    if (
      !secondaryBlock ||
      secondaryBlock.text.trim() === primaryBlock.text.trim() ||
      primaryCanonical === secondaryCanonical ||
      (bothSingleWords && oneCharacterApart(primaryCanonical, secondaryCanonical)) ||
      confidence(secondaryBlock) < confidence(primaryBlock) + 0.05
    ) {
      return primaryBlock;
    }
    return {
      ...primaryBlock,
      text: secondaryBlock.text,
      normalizedText: normalizeNorwegianText(secondaryBlock.text),
      metadata: {
        ...primaryBlock.metadata,
        consensusReplaced: true,
        primaryConfidence: confidence(primaryBlock),
        secondaryConfidence: confidence(secondaryBlock),
        secondaryEngine: "rapidocr",
      },
    };
  });
  for (const secondaryBlock of secondary.blocks) {
    if (matchedSecondaryIds.has(secondaryBlock.id) || !isLargeEditorialBlock(secondaryBlock)) {
      continue;
    }
    const secondaryCanonical = canonicalLetters(secondaryBlock.text);
    const corroboratingPrimary = primary.blocks.find((primaryBlock) => {
      const primaryCanonical = canonicalLetters(primaryBlock.text);
      return (
        primaryCanonical === secondaryCanonical ||
        oneCharacterApart(primaryCanonical, secondaryCanonical)
      );
    });
    if (!corroboratingPrimary) continue;
    const preservePrimarySpelling =
      canonicalLetters(corroboratingPrimary.text) === secondaryCanonical;
    const text = preservePrimarySpelling ? corroboratingPrimary.text : secondaryBlock.text;
    blocks.push({
      ...secondaryBlock,
      id: `consensus-supplement-${secondaryBlock.id}`,
      text,
      normalizedText: normalizeNorwegianText(text),
      metadata: {
        ...secondaryBlock.metadata,
        consensusSupplemented: true,
        corroboratingPrimaryText: corroboratingPrimary.text,
        secondaryEngine: "rapidocr",
      },
      source: {
        ...secondaryBlock.source,
        sourceElementId: `consensus-supplement-${secondaryBlock.source.sourceElementId}`,
        order: blocks.length,
      },
    });
  }
  const text = blocks.map((block) => block.text).join("\n");
  return {
    ...primary,
    lines: [],
    text,
    normalizedText: normalizeNorwegianText(text),
    blocks,
    metadata: { ...primary.metadata, ocrConsensus: true },
  };
}
