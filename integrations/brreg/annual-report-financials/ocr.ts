import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

import {
  AnnualReportParsedPage,
  AnnualReportTable,
  AnnualReportTableCell,
  AnnualReportTableRow,
  AnnualReportOcrDiagnostics,
  AnnualReportOcrExtractionResult,
  ExtractedLine,
  ExtractedWord,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  normalizeNorwegianText,
  normalizeRowLabel,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
  stripDuplicateWhitespace,
} from "@/integrations/brreg/annual-report-financials/text";

const OCR_MIN_WIDTH_PX = 64;
const OCR_MIN_HEIGHT_PX = 64;
const OCR_MIN_AREA_PX = 8_192;
const OCR_RENDER_SCALE = 4;
const OCR_PREPROCESSING_MODE = "page_png_scale4";
const OCR_RECOGNITION_MODES = [
  {
    name: "auto",
    parameters: {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "3",
    },
  },
  {
    name: "sparse_text",
    parameters: {
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: "11",
    },
  },
] as const;

function buildLinesFromWords(words: ExtractedWord[]) {
  const groups = new Map<number, ExtractedWord[]>();

  for (const word of words) {
    const key = word.lineNumber ?? Math.round(word.y / 12);
    const list = groups.get(key) ?? [];
    list.push(word);
    groups.set(key, list);
  }

  return Array.from(groups.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, lineWords]) => {
      const sortedWords = [...lineWords].sort((left, right) => left.x - right.x);
      const text = stripDuplicateWhitespace(sortedWords.map((word) => word.text).join(" "));
      const minX = Math.min(...sortedWords.map((word) => word.x));
      const minY = Math.min(...sortedWords.map((word) => word.y));
      const maxX = Math.max(...sortedWords.map((word) => word.x + word.width));
      const maxY = Math.max(...sortedWords.map((word) => word.y + word.height));
      const averageConfidence =
        sortedWords.reduce((sum, word) => sum + word.confidence, 0) / Math.max(sortedWords.length, 1);

      const line: ExtractedLine = {
        text,
        normalizedText: normalizeNorwegianText(text),
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        confidence: averageConfidence,
        words: sortedWords,
      };

      return line;
    })
    .filter((line) => Boolean(line.text));
}

function splitMergedTokens(token: string) {
  return repairOcrTokenBoundaries(token)
    .split(/\s+/)
    .flatMap((part) => part.split(/(?<=\))(?=\d)|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z(])/))
    .filter(Boolean);
}

function buildLinesFromRawText(rawText: string) {
  const rawLines = rawText
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((line) => stripDuplicateWhitespace(repairOcrTokenBoundaries(line)))
    .filter((line) => line.length > 0);

  return rawLines.map((line, lineIndex) => {
    const tokens = line
      .split(/\s+/)
      .flatMap((token) => splitMergedTokens(token))
      .filter(Boolean);
    const words = tokens.map((token, tokenIndex) => ({
      text: token,
      normalizedText: normalizeNorwegianText(token),
      x: 40 + tokenIndex * 72,
      y: 40 + lineIndex * 16,
      width: Math.max(8, token.length * 7),
      height: 12,
      confidence: 0.65,
      lineNumber: lineIndex,
    }));

    return {
      text: line,
      normalizedText: normalizeNorwegianText(line),
      x: 40,
      y: 40 + lineIndex * 16,
      width: Math.max(80, line.length * 7),
      height: 12,
      confidence: 0.65,
      words,
    } satisfies ExtractedLine;
  });
}

function lineContainsYearHeader(line: ExtractedLine) {
  return (line.text.match(/\b20\d{2}\b/g) ?? []).length >= 2;
}

function lineLooksNumericRow(line: ExtractedLine) {
  const repaired = repairOcrTokenBoundaries(line.text);
  const normalized = normalizeRowLabel(repaired);
  if (!normalized) {
    return false;
  }

  if (
    normalized.includes("belop i") ||
    normalized.includes("alle tall") ||
    normalized.includes("utskriftsdato") ||
    normalized.includes("proff as") ||
    normalized.includes("organisasjonsnummer") ||
    normalized.includes("organisasjonsnr") ||
    normalized.startsWith("side ")
  ) {
    return false;
  }

  const values = repaired
    .split(/\s+/)
    .flatMap((token) => splitMergedTokens(token))
    .map((token) => parseFinancialInteger(token))
    .filter((value): value is number => value !== null);

  return values.length >= 1 && /[a-z]{3,}/i.test(repaired);
}

function tokenizeLine(line: ExtractedLine) {
  if (line.words.length > 0) {
    return line.words.flatMap((word, wordIndex) =>
      splitMergedTokens(word.text).map((token, tokenIndex) => ({
        token,
        x: word.x + (wordIndex + tokenIndex) * 12,
      })),
    );
  }

  return line.text
    .split(/\s+/)
    .flatMap((token, tokenIndex) =>
      splitMergedTokens(token).map((part, partIndex) => ({
        token: part,
        x: 40 + tokenIndex * 72 + partIndex * 12,
      })),
    );
}

function normalizeNumericToken(token: string) {
  return repairOcrTokenBoundaries(token).replace(/\s+/g, "");
}

function groupScore(tokens: string[]) {
  const combined = tokens.join("");
  const parsed = parseFinancialInteger(combined);
  if (parsed === null) {
    return Number.NEGATIVE_INFINITY;
  }

  const digitLengths = tokens.map((token) => token.replace(/\D/g, "").length);
  if (digitLengths.some((length) => length === 0)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 50;
  if (tokens.length === 1) {
    score += 10 + Math.min(6, digitLengths[0] ?? 0);
  } else {
    score += 8;
    const [firstLength, ...restLengths] = digitLengths;
    if (firstLength && firstLength >= 1 && firstLength <= 3) {
      score += 10;
    }
    if (restLengths.every((length) => length === 3)) {
      score += restLengths.length * 14;
    } else {
      score -= restLengths.filter((length) => length !== 3).length * 18;
    }
    if ((digitLengths[digitLengths.length - 1] ?? 0) === 3) {
      score += 4;
    }
  }

  if (/^0+$/.test(combined)) {
    score -= 8;
  }

  return score;
}

function partitionNumericTokens(
  numericTokens: Array<{ token: string; x: number }>,
  expectedValueCount: number,
) {
  const normalizedTokens = numericTokens
    .map((item) => ({
      token: normalizeNumericToken(item.token),
      x: item.x,
    }))
    .filter((item) => item.token.length > 0);

  const maxGroups = Math.min(expectedValueCount, normalizedTokens.length);
  const minGroups = Math.min(1, maxGroups);

  let best:
    | {
        groups: Array<Array<{ token: string; x: number }>>;
        score: number;
      }
    | null = null;

  function visit(
    startIndex: number,
    remainingGroups: number,
    groups: Array<Array<{ token: string; x: number }>>,
    score: number,
  ) {
    if (remainingGroups === 0) {
      if (startIndex !== normalizedTokens.length) {
        return;
      }
      if (!best || score > best.score) {
        best = {
          groups: groups.map((group) => [...group]),
          score,
        };
      }
      return;
    }

    const remainingTokens = normalizedTokens.length - startIndex;
    if (remainingTokens < remainingGroups) {
      return;
    }

    const maxGroupSize = remainingTokens - (remainingGroups - 1);
    for (let size = 1; size <= maxGroupSize; size += 1) {
      const group = normalizedTokens.slice(startIndex, startIndex + size);
      const candidateScore = groupScore(group.map((item) => item.token));
      if (!Number.isFinite(candidateScore)) {
        continue;
      }

      visit(
        startIndex + size,
        remainingGroups - 1,
        [...groups, group],
        score + candidateScore,
      );
    }
  }

  for (let groupCount = maxGroups; groupCount >= minGroups; groupCount -= 1) {
    visit(0, groupCount, [], groupCount === expectedValueCount ? 50 : groupCount * 5);
  }

  if (!best) {
    return {
      groups: normalizedTokens.map((item) => [item]),
      mergedTokenCount: 0,
      ambiguous: true,
    };
  }

  return {
    groups: best.groups,
    mergedTokenCount: best.groups.reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
    ambiguous: best.groups.length !== expectedValueCount,
  };
}

function buildValueCellFromGroupedTokens(input: {
  pageNumber: number;
  rowIndex: number;
  valueIndex: number;
  line: ExtractedLine;
  groupedTokens: Array<{ token: string; x: number }>;
}) {
  const text = input.groupedTokens.map((item) => item.token).join("");
  const left = Math.min(...input.groupedTokens.map((item) => item.x));
  const rightMostToken = input.groupedTokens[input.groupedTokens.length - 1];
  const right = (rightMostToken?.x ?? left) + Math.max(40, text.length * 7);

  return {
    id: `ocr-table-${input.pageNumber}-row-${input.rowIndex}-value-${input.valueIndex}`,
    rowIndex: input.rowIndex,
    columnIndex: input.valueIndex,
    text,
    normalizedText: normalizeNorwegianText(text),
    bbox: {
      left,
      bottom: input.line.y,
      right,
      top: input.line.y + input.line.height,
    },
    isNumeric: true,
    numericValue: parseFinancialInteger(text),
    role: "value",
    source: {
      engine: "LEGACY",
      engineMode: "legacy",
      sourceElementId: `ocr-value-${input.pageNumber}-${input.rowIndex}-${input.valueIndex}`,
      sourceRawType: "ocr_table_row",
      order: input.rowIndex,
    },
  } satisfies AnnualReportTableCell;
}

function buildSyntheticTableFromLines(pageNumber: number, lines: ExtractedLine[]) {
  const yearHeaderIndex = lines.findIndex((line, index) =>
    index < 12 && lineContainsYearHeader(line),
  );
  const candidateLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => index !== yearHeaderIndex && lineLooksNumericRow(line));

  if (candidateLines.length < 3) {
    return {
      table: null,
      rowCandidateCount: candidateLines.length,
      yearHeaderCandidateCount: yearHeaderIndex >= 0 ? 1 : 0,
      reconstructedNumericCellCount: 0,
      mergedNumericTokenCount: 0,
      rowsWithAssignedYearColumns: 0,
      ambiguousRowCount: candidateLines.length,
    };
  }

  const rows: AnnualReportTableRow[] = [];
  let columnCount = 0;
  let mergedNumericTokenCount = 0;
  let reconstructedNumericCellCount = 0;
  let rowsWithAssignedYearColumns = 0;
  let ambiguousRowCount = 0;
  const expectedValueCount =
    yearHeaderIndex >= 0
      ? Math.max(
          2,
          lines[yearHeaderIndex]
            ?.text.match(/\b20\d{2}\b/g)
            ?.length ?? 2,
        )
      : 2;

  if (yearHeaderIndex >= 0) {
    const yearLine = lines[yearHeaderIndex];
    const yearTokens = tokenizeLine(yearLine)
      .map((item) => item.token)
      .filter((token) => /\b20\d{2}\b/.test(token));
    if (yearTokens.length >= 2) {
      const headerCells: AnnualReportTableCell[] = yearTokens.map((token, columnIndex) => ({
        id: `ocr-table-${pageNumber}-header-cell-${columnIndex}`,
        rowIndex: 0,
        columnIndex,
        text: token,
        normalizedText: normalizeNorwegianText(token),
        bbox: {
          left: 320 + columnIndex * 80,
          bottom: yearLine.y,
          right: 320 + columnIndex * 80 + 60,
          top: yearLine.y + yearLine.height,
        },
        isNumeric: true,
        numericValue: parseFinancialInteger(token),
        role: "year_header",
        source: {
          engine: "LEGACY",
          engineMode: "legacy",
          sourceElementId: `ocr-header-${pageNumber}-${columnIndex}`,
          sourceRawType: "ocr_year_header",
          order: columnIndex,
        },
      }));

      rows.push({
        id: `ocr-table-${pageNumber}-header`,
        rowIndex: 0,
        text: yearLine.text,
        normalizedText: normalizeNorwegianText(yearLine.text),
        bbox: {
          left: yearLine.x,
          bottom: yearLine.y,
          right: yearLine.x + yearLine.width,
          top: yearLine.y + yearLine.height,
        },
        cells: headerCells,
        source: {
          engine: "LEGACY",
          engineMode: "legacy",
          sourceElementId: `ocr-header-row-${pageNumber}`,
          sourceRawType: "ocr_year_header",
          order: 0,
        },
      });
      columnCount = Math.max(columnCount, headerCells.length);
    }
  }

  candidateLines.forEach(({ line }, rowOffset) => {
    const tokens = tokenizeLine(line);
    const numericIndexes = tokens
      .map((item, index) => ({ ...item, index, numericValue: parseFinancialInteger(item.token) }))
      .filter((item) => item.numericValue !== null);

    if (numericIndexes.length === 0) {
      return;
    }

    const firstNumericIndex = numericIndexes[0]!.index;
    const labelTokens = tokens.slice(0, firstNumericIndex).map((item) => item.token);
    const label = stripDuplicateWhitespace(labelTokens.join(" "));
    const normalizedLabel = normalizeRowLabel(label);
    if (!normalizedLabel || normalizedLabel.length < 3) {
      return;
    }

    const noteCandidate = labelTokens[labelTokens.length - 1] ?? "";
    const hasNoteReference = /^\d{1,2}$/.test(noteCandidate);
    const displayLabel = hasNoteReference
      ? stripDuplicateWhitespace(labelTokens.slice(0, -1).join(" "))
      : label;
    const rowIndex = rows.length;
    const cells: AnnualReportTableCell[] = [];

    cells.push({
      id: `ocr-table-${pageNumber}-row-${rowIndex}-label`,
      rowIndex,
      columnIndex: 0,
      text: displayLabel,
      normalizedText: normalizeNorwegianText(displayLabel),
      bbox: {
        left: line.x,
        bottom: line.y,
        right: line.x + Math.max(120, displayLabel.length * 7),
        top: line.y + line.height,
      },
      isNumeric: false,
      numericValue: null,
      role: "label",
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `ocr-label-${pageNumber}-${rowIndex}`,
        sourceRawType: "ocr_table_row",
        order: rowIndex,
      },
    });

    if (hasNoteReference) {
      cells.push({
        id: `ocr-table-${pageNumber}-row-${rowIndex}-note`,
        rowIndex,
        columnIndex: 1,
        text: noteCandidate,
        normalizedText: normalizeNorwegianText(noteCandidate),
        bbox: {
          left: line.x + Math.max(130, displayLabel.length * 7),
          bottom: line.y,
          right: line.x + Math.max(150, displayLabel.length * 7),
          top: line.y + line.height,
        },
        isNumeric: false,
        numericValue: null,
        role: "note",
        source: {
          engine: "LEGACY",
          engineMode: "legacy",
          sourceElementId: `ocr-note-${pageNumber}-${rowIndex}`,
          sourceRawType: "ocr_table_row",
          order: rowIndex,
        },
      });
    }

    const groupedValues = partitionNumericTokens(
      numericIndexes.map((item) => ({ token: item.token, x: item.x })),
      expectedValueCount,
    );
    mergedNumericTokenCount += groupedValues.mergedTokenCount;
    reconstructedNumericCellCount += groupedValues.groups.length;
    if (groupedValues.ambiguous) {
      ambiguousRowCount += 1;
    } else {
      rowsWithAssignedYearColumns += 1;
    }

    groupedValues.groups.forEach((group, numericIndex) => {
      cells.push(
        buildValueCellFromGroupedTokens({
          pageNumber,
          rowIndex,
          valueIndex: cells.length,
          line,
          groupedTokens: group,
        }),
      );
    });

    columnCount = Math.max(columnCount, cells.length);
    rows.push({
      id: `ocr-table-${pageNumber}-row-${rowIndex}`,
      rowIndex,
      text: line.text,
      normalizedText: normalizeNorwegianText(line.text),
      bbox: {
        left: line.x,
        bottom: line.y,
        right: line.x + line.width,
        top: line.y + line.height,
      },
      cells,
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `ocr-row-${pageNumber}-${rowIndex}`,
        sourceRawType: "ocr_table_row",
        order: rowIndex,
      },
    });
  });

  if (rows.length < 4) {
    return {
      table: null,
      rowCandidateCount: candidateLines.length,
      yearHeaderCandidateCount: yearHeaderIndex >= 0 ? 1 : 0,
      reconstructedNumericCellCount,
      mergedNumericTokenCount,
      rowsWithAssignedYearColumns,
      ambiguousRowCount,
    };
  }

  const firstLine = lines[0];
  const lastLine = lines[lines.length - 1];
  return {
    table: {
      id: `ocr-table-${pageNumber}`,
      pageNumber,
      bbox: {
        left: firstLine?.x ?? 40,
        bottom: firstLine?.y ?? 40,
        right: Math.max(...lines.map((line) => line.x + line.width)),
        top: (lastLine?.y ?? 40) + (lastLine?.height ?? 12),
      },
      rowCount: rows.length,
      columnCount,
      rows,
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `ocr-table-${pageNumber}`,
        sourceRawType: "ocr_table",
        order: 0,
      },
    } satisfies AnnualReportTable,
    rowCandidateCount: candidateLines.length,
    yearHeaderCandidateCount: yearHeaderIndex >= 0 ? 1 : 0,
    reconstructedNumericCellCount,
    mergedNumericTokenCount,
    rowsWithAssignedYearColumns,
    ambiguousRowCount,
  };
}

function buildStructuredOcrPage(input: {
  pageNumber: number;
  lines: ExtractedLine[];
  text: string;
}) {
  const {
    table,
    rowCandidateCount,
    yearHeaderCandidateCount,
    reconstructedNumericCellCount,
    mergedNumericTokenCount,
    rowsWithAssignedYearColumns,
    ambiguousRowCount,
  } = buildSyntheticTableFromLines(
    input.pageNumber,
    input.lines,
  );
  const tableLineTexts = new Set(table?.rows.map((row) => row.text) ?? []);
  const blocks = input.lines
    .filter((line, index) => !tableLineTexts.has(line.text) || index < 2)
    .map((line, index) => {
      const normalized = normalizeNorwegianText(line.text);
      const isHeading =
        index === 0 ||
        /^(resultatregnskap|balanse|egenkapital og gjeld|noter til regnskapet|uavhengig revisors beretning|styrets arsberetning)/.test(
          normalized,
        );

      return {
        id: `ocr-block-${input.pageNumber}-${index}`,
        kind: isHeading ? "heading" : "paragraph",
        rawType: isHeading ? "ocr_heading" : "ocr_line",
        text: line.text,
        normalizedText: normalizeNorwegianText(line.text),
        bbox: {
          left: line.x,
          bottom: line.y,
          right: line.x + line.width,
          top: line.y + line.height,
        },
        headingLevel: isHeading ? 1 : null,
        table: null,
        source: {
          engine: "LEGACY" as const,
          engineMode: "legacy" as const,
          sourceElementId: `ocr-line-${input.pageNumber}-${index}`,
          sourceRawType: "ocr_line",
          order: index,
        },
      };
    });

  if (table) {
    blocks.push({
      id: `ocr-table-block-${input.pageNumber}`,
      kind: "table",
      rawType: "ocr_table",
      text: table.rows.map((row) => row.text).join("\n"),
      normalizedText: normalizeNorwegianText(table.rows.map((row) => row.text).join(" ")),
      bbox: table.bbox,
      headingLevel: null,
      table,
      source: {
        engine: "LEGACY",
        engineMode: "legacy",
        sourceElementId: `ocr-table-${input.pageNumber}`,
        sourceRawType: "ocr_table",
        order: blocks.length,
      },
    });
  }

  return {
    page: {
      pageNumber: input.pageNumber,
      text: input.text,
      normalizedText: normalizeNorwegianText(input.text),
      lines: input.lines,
      hasEmbeddedText: false,
      blocks,
      tables: table ? [table] : [],
      source: {
        engine: "LEGACY" as const,
        engineMode: "legacy" as const,
        sourceElementId: `ocr-page-${input.pageNumber}`,
        sourceRawType: "ocr_page",
        order: input.pageNumber,
      },
      metadata: {
        ocrDerived: true,
        rowCandidateCount,
        yearHeaderCandidateCount,
        reconstructedNumericCellCount,
        mergedNumericTokenCount,
        rowsWithAssignedYearColumns,
        ambiguousRowCount,
      },
    } satisfies AnnualReportParsedPage,
    rowCandidateCount,
    yearHeaderCandidateCount,
    reconstructedNumericCellCount,
    mergedNumericTokenCount,
    rowsWithAssignedYearColumns,
    ambiguousRowCount,
    statementLikePage: Boolean(table),
  };
}

function scoreRecognitionCandidate(candidate: {
  text: string;
  lines: ExtractedLine[];
  rowCandidateCount: number;
  yearHeaderCandidateCount: number;
  statementLikePage: boolean;
}) {
  return (
    (candidate.statementLikePage ? 10_000 : 0) +
    candidate.rowCandidateCount * 100 +
    candidate.yearHeaderCandidateCount * 25 +
    candidate.lines.length * 5 +
    candidate.text.length
  );
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.byteLength < 24) {
    return null;
  }

  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }

  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.byteLength < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.byteLength) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isSofMarker =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isSofMarker && offset + 8 < buffer.byteLength) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    if (!Number.isFinite(length) || length < 2) {
      return null;
    }

    offset += 2 + length;
  }

  return null;
}

function readImageDimensions(buffer: Buffer) {
  return readPngDimensions(buffer) ?? readJpegDimensions(buffer);
}

function createEmptyDiagnostics(pageCount: number): AnnualReportOcrDiagnostics {
  return {
    minWidthPx: OCR_MIN_WIDTH_PX,
    minHeightPx: OCR_MIN_HEIGHT_PX,
    minAreaPx: OCR_MIN_AREA_PX,
    renderScale: OCR_RENDER_SCALE,
    preprocessingMode: OCR_PREPROCESSING_MODE,
    pageCount,
    imageRegionCount: 0,
    tinyCropSkippedCount: 0,
    invalidCropCount: 0,
    ocrAttemptCount: 0,
    ocrFailureCount: 0,
    usableOcrRegionCount: 0,
    usableLineCount: 0,
    rowCandidateCount: 0,
    yearHeaderCandidateCount: 0,
    statementLikePageCount: 0,
    reconstructedNumericCellCount: 0,
    mergedNumericTokenCount: 0,
    rowsWithAssignedYearColumns: 0,
    ambiguousRowCount: 0,
    pageLevelOcrFallbackCount: 0,
    manualReviewDueToOcrQualityCount: 0,
    suppressedFailureMessages: [],
    regionFailures: [],
  };
}

function pushSuppressedFailure(
  counts: Map<string, number>,
  message: string,
) {
  counts.set(message, (counts.get(message) ?? 0) + 1);
}

function finalizeDiagnostics(
  diagnostics: AnnualReportOcrDiagnostics,
  suppressedFailures: Map<string, number>,
) {
  diagnostics.suppressedFailureMessages = Array.from(suppressedFailures.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([message, count]) => ({
      message,
      count,
    }));

  return diagnostics;
}

function validateOcrImageRegion(input: {
  pageNumber: number;
  imageBuffer: Buffer;
}) {
  if (!Buffer.isBuffer(input.imageBuffer) || input.imageBuffer.byteLength === 0) {
    return {
      ok: false as const,
      category: "invalid_image_buffer" as const,
      message: "OCR image buffer is empty or invalid.",
    };
  }

  const dimensions = readImageDimensions(input.imageBuffer);
  if (!dimensions) {
    return {
      ok: false as const,
      category: "invalid_crop" as const,
      message: "OCR image dimensions could not be determined.",
    };
  }

  const { width, height } = dimensions;
  if (width <= 0 || height <= 0) {
    return {
      ok: false as const,
      category: "invalid_crop" as const,
      message: `OCR image has invalid dimensions ${width}x${height}.`,
    };
  }

  const area = width * height;
  if (width < OCR_MIN_WIDTH_PX || height < OCR_MIN_HEIGHT_PX || area < OCR_MIN_AREA_PX) {
    return {
      ok: false as const,
      category: "tiny_crop" as const,
      message: `OCR image too small (${width}x${height}, area ${area}px).`,
    };
  }

  return {
    ok: true as const,
    width,
    height,
    area,
  };
}

function summarizeRecognitionError(error: unknown) {
  const rawMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown OCR failure";

  const normalizedMessage = rawMessage
    .replace(/\s+/g, " ")
    .replace(/(?:[A-Z]:)?[\\/][^\s)]+/g, "<path>")
    .trim();

  return normalizedMessage.length > 240
    ? `${normalizedMessage.slice(0, 237)}...`
    : normalizedMessage;
}

export async function extractOcrPagesWithDiagnostics(
  pdfBuffer: Buffer,
  pageNumbers?: number[],
): Promise<AnnualReportOcrExtractionResult> {
  const parser = new PDFParse({ data: pdfBuffer });
  const screenshots = await parser.getScreenshot({
    partial: pageNumbers,
    scale: OCR_RENDER_SCALE,
  });
  await parser.destroy();

  const diagnostics = createEmptyDiagnostics(
    pageNumbers?.length ?? screenshots.pages.length,
  );
  diagnostics.imageRegionCount = screenshots.pages.length;
  diagnostics.pageLevelOcrFallbackCount = screenshots.pages.length;
  const suppressedFailures = new Map<string, number>();

  const worker = await createWorker("nor+eng", 1, {
    cachePath: path.join(os.tmpdir(), "projectx-tesseract-cache"),
    logger: () => undefined,
    errorHandler: (error: string) => {
      const message = summarizeRecognitionError(error);
      if (message.length > 0) {
        pushSuppressedFailure(suppressedFailures, message);
      }
    },
  });

  try {
    const pages: AnnualReportParsedPage[] = [];

    for (const page of screenshots.pages) {
      const validation = validateOcrImageRegion({
        pageNumber: page.pageNumber,
        imageBuffer: Buffer.from(page.data),
      });
      if (!validation.ok) {
        if (validation.category === "tiny_crop") {
          diagnostics.tinyCropSkippedCount += 1;
        } else {
          diagnostics.invalidCropCount += 1;
        }

        diagnostics.regionFailures.push({
          pageNumber: page.pageNumber,
          stage: "pre_ocr_validation",
          category: validation.category,
          message: validation.message,
        });
        pushSuppressedFailure(suppressedFailures, validation.message);
        continue;
      }

      const imagePath = path.join(os.tmpdir(), `projectx-financials-${page.pageNumber}.png`);
      const imageBuffer = Buffer.from(page.data);
      await fs.writeFile(imagePath, imageBuffer);
      const recognitionResults: Array<{
        lines: ExtractedLine[];
        text: string;
        modeName: string;
        structured: ReturnType<typeof buildStructuredOcrPage> | null;
      }> = [];
      let recognitionFailed = false;

      for (const mode of OCR_RECOGNITION_MODES) {
        diagnostics.ocrAttemptCount += 1;

        try {
          const configurableWorker = worker as unknown as {
            setParameters?: (parameters: Record<string, string>) => Promise<void>;
          };
          if (typeof configurableWorker.setParameters === "function") {
            await configurableWorker.setParameters(mode.parameters);
          }

          const result = await worker.recognize(imagePath, {}, { text: true, tsv: true });
          const data = result.data as {
            text?: string;
            words?: Array<{
              text: string;
              confidence: number;
              bbox: { x0: number; y0: number; x1: number; y1: number };
              line_num?: number;
            }>;
          };

          const words: ExtractedWord[] = (data.words ?? [])
            .map((word) => ({
              text: word.text,
              normalizedText: normalizeNorwegianText(word.text),
              x: word.bbox.x0,
              y: word.bbox.y0,
              width: Math.max(1, word.bbox.x1 - word.bbox.x0),
              height: Math.max(1, word.bbox.y1 - word.bbox.y0),
              confidence: Number.isFinite(word.confidence) ? word.confidence / 100 : 0.6,
              lineNumber: word.line_num,
            }))
            .filter((word) => Boolean(word.text?.trim()));

          const linesFromWords = buildLinesFromWords(words);
          const lines =
            linesFromWords.length > 0
              ? linesFromWords
              : buildLinesFromRawText(data.text ?? "");
          const text = lines
            .map((line) => line.text)
            .join("\n")
            .trim();
          const structured =
            lines.length > 0 && text.length >= 8
              ? buildStructuredOcrPage({
                  pageNumber: page.pageNumber,
                  lines,
                  text,
                })
              : null;

          recognitionResults.push({
            lines,
            text,
            modeName: mode.name,
            structured,
          });
        } catch (error) {
          recognitionFailed = true;
          diagnostics.ocrFailureCount += 1;
          const message = summarizeRecognitionError(error);
          diagnostics.regionFailures.push({
            pageNumber: page.pageNumber,
            stage: "recognition",
            category: "ocr_failure",
            message,
          });
          pushSuppressedFailure(suppressedFailures, message);
        }
      }

      const bestRecognition = recognitionResults
        .sort((left, right) => {
          const scoreDifference =
            scoreRecognitionCandidate({
              text: right.text,
              lines: right.lines,
              rowCandidateCount: right.structured?.rowCandidateCount ?? 0,
              yearHeaderCandidateCount: right.structured?.yearHeaderCandidateCount ?? 0,
              statementLikePage: right.structured?.statementLikePage ?? false,
            }) -
            scoreRecognitionCandidate({
              text: left.text,
              lines: left.lines,
              rowCandidateCount: left.structured?.rowCandidateCount ?? 0,
              yearHeaderCandidateCount: left.structured?.yearHeaderCandidateCount ?? 0,
              statementLikePage: left.structured?.statementLikePage ?? false,
            });

          if (scoreDifference !== 0) {
            return scoreDifference;
          }

          return right.modeName.localeCompare(left.modeName);
        })[0];
      const lines = bestRecognition?.lines ?? [];
      const text = bestRecognition?.text ?? "";

      if (lines.length === 0 || text.length < 8) {
        diagnostics.regionFailures.push({
          pageNumber: page.pageNumber,
          stage: "recognition",
          category: "ocr_quality_too_weak",
          message:
            recognitionFailed
              ? "OCR did not recover enough text after fallback recognition passes."
              : "OCR produced no usable lines for this page-level region.",
        });
        pushSuppressedFailure(
          suppressedFailures,
          recognitionFailed
            ? "OCR did not recover enough text after fallback recognition passes."
            : "OCR produced no usable lines for this page-level region.",
        );
        continue;
      }

      diagnostics.usableOcrRegionCount += 1;
      diagnostics.usableLineCount += lines.length;

      const structured =
        bestRecognition?.structured ??
        buildStructuredOcrPage({
          pageNumber: page.pageNumber,
          lines,
          text,
        });
      diagnostics.rowCandidateCount += structured.rowCandidateCount;
      diagnostics.yearHeaderCandidateCount += structured.yearHeaderCandidateCount;
      diagnostics.reconstructedNumericCellCount += structured.reconstructedNumericCellCount;
      diagnostics.mergedNumericTokenCount += structured.mergedNumericTokenCount;
      diagnostics.rowsWithAssignedYearColumns += structured.rowsWithAssignedYearColumns;
      diagnostics.ambiguousRowCount += structured.ambiguousRowCount;
      if (structured.statementLikePage) {
        diagnostics.statementLikePageCount += 1;
      }

      pages.push(structured.page);
    }

    if (diagnostics.usableOcrRegionCount === 0) {
      diagnostics.manualReviewDueToOcrQualityCount = 1;
    }

    return {
      pages: pages.sort((left, right) => left.pageNumber - right.pageNumber),
      diagnostics: finalizeDiagnostics(diagnostics, suppressedFailures),
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractOcrPages(pdfBuffer: Buffer, pageNumbers?: number[]) {
  const result = await extractOcrPagesWithDiagnostics(pdfBuffer, pageNumbers);
  return result.pages;
}
