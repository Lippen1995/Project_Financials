import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";

export type BoardReportPageRange = {
  pageStart: number;
  pageEnd: number;
};

export type BoardReportReferenceResolution = {
  evidencePdfPageNumber: number;
  printedReferencePageNumber: number;
  pageOffset: number;
  pageRanges: BoardReportPageRange[];
};

const REFERENCE_MARKER = "styrets arsberetning er dekket i folgende seksjoner";

function mergePageRanges(ranges: BoardReportPageRange[]): BoardReportPageRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.pageStart - right.pageStart || left.pageEnd - right.pageEnd,
  );
  const merged: BoardReportPageRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.pageStart <= previous.pageEnd + 1) {
      previous.pageEnd = Math.max(previous.pageEnd, range.pageEnd);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function printedPageNumber(text: string): number | null {
  const lines = text.split(/\r?\n/);
  const compactText = normalizeNorwegianText(text).replace(/[^a-z0-9]/g, "");
  const hasReportTitle =
    /annualreport20\d{2}/.test(compactText) ||
    /ars\w*ogbaerek\w*rapport20\d{2}/.test(compactText);
  const markerLineIndex = lines.findIndex((line) =>
    normalizeNorwegianText(line).includes(REFERENCE_MARKER),
  );
  if (hasReportTitle && markerLineIndex >= 0) {
    const nearbyStandalonePage = lines
      .slice(Math.max(0, markerLineIndex - 6), markerLineIndex)
      .map((line) => line.match(/^\s*(\d{1,3})\s*$/)?.[1])
      .findLast((value) => value !== undefined);
    if (nearbyStandalonePage) return Number(nearbyStandalonePage);
  }

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^\s*(\d{1,3})(?:\s*[—–-]\s*|\s+)\p{Lu}/u);
    if (match) return Number(match[1]);

    // OCR commonly separates a printed footer into two lines. Tie the
    // standalone number to the adjacent report title so table numbers cannot
    // be mistaken for the printed page number.
    const standalone = line.match(/^\s*(\d{1,3})\s*$/);
    const nextLine = normalizeNorwegianText(lines[index + 1] ?? "");
    const compactNextLine = nextLine.replace(/[^a-z0-9]/g, "");
    if (
      standalone &&
      (/annualreport20\d{2}/.test(compactNextLine) ||
        /ars\w*ogbaerek\w*rapport20\d{2}/.test(compactNextLine))
    ) {
      return Number(standalone[1]);
    }
  }
  return null;
}

function mappedReportRanges(textAfterMarker: string, maximumPage: number): BoardReportPageRange[] {
  const ranges: BoardReportPageRange[] = [];
  for (const rawLine of textAfterMarker.split(/\r?\n/)) {
    const line = rawLine.trim();
    const isStandalonePageCell = /^\d{1,3}(?:\s*[-–—]\s*\d{1,3})?$/.test(line);
    if (!/\p{L}/u.test(line) && !isStandalonePageCell) continue;

    const rangeMatch = line.match(/(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*$/u);
    const singlePageMatch = rangeMatch ? null : line.match(/(?:^|\s)(\d{1,3})\s*$/u);
    const pageStart = Number(rangeMatch?.[1] ?? singlePageMatch?.[1]);
    const pageEnd = Number(rangeMatch?.[2] ?? singlePageMatch?.[1]);
    if (
      !Number.isInteger(pageStart) ||
      !Number.isInteger(pageEnd) ||
      pageStart < 1 ||
      pageEnd < pageStart ||
      pageEnd >= maximumPage
    ) {
      continue;
    }
    ranges.push({ pageStart, pageEnd });
  }
  return mergePageRanges(ranges);
}

/**
 * Resolves a board report that an annual report explicitly defines through a
 * legal-reference table. The source report's printed pages are translated to
 * physical PDF pages using the reference page itself, so no company-specific
 * offsets or page numbers enter production code.
 */
export function resolveBoardReportPageRangesFromReferenceText(input: {
  pdfPageNumber: number;
  text: string;
}): BoardReportReferenceResolution | null {
  const normalized = normalizeNorwegianText(input.text);
  const markerOffset = normalized.indexOf(REFERENCE_MARKER);
  if (markerOffset < 0) return null;

  const printedReferencePageNumber = printedPageNumber(input.text);
  if (printedReferencePageNumber === null) return null;
  const pageOffset = input.pdfPageNumber - printedReferencePageNumber;
  if (pageOffset < 0) return null;

  // normalizeNorwegianText preserves newlines and string length for the
  // characters used by the marker, letting the suffix retain row boundaries.
  const reportRanges = mappedReportRanges(
    input.text.slice(markerOffset + REFERENCE_MARKER.length),
    printedReferencePageNumber,
  );
  if (reportRanges.length === 0) return null;

  return {
    evidencePdfPageNumber: input.pdfPageNumber,
    printedReferencePageNumber,
    pageOffset,
    pageRanges: reportRanges.map((range) => ({
      pageStart: range.pageStart + pageOffset,
      pageEnd: range.pageEnd + pageOffset,
    })),
  };
}
