import {
  extractIntegers,
  normalizeNorwegianText,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
  stripDuplicateWhitespace,
} from "@/integrations/brreg/annual-report-financials/text";
import {
  AnnualReportGeometryBox,
  AnnualReportPageBlock,
  AnnualReportParsedPage,
  AnnualReportTable,
  AnnualReportTableCell,
  AnnualReportTableRow,
  ExtractedLine,
  ExtractedWord,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  NormalizedDocument,
  NormalizedDocumentBlock,
  OpenDataLoaderBoundingBox,
  OpenDataLoaderExecutionMode,
  OpenDataLoaderRawOutputSummary,
  OpenDataLoaderRawElement,
} from "@/server/document-understanding/opendataloader-types";

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBoundingBox(value: unknown): OpenDataLoaderBoundingBox | null {
  if (!Array.isArray(value) || value.length < 4) {
    return null;
  }

  const [left, bottom, right, top] = value;
  const parsed = [left, bottom, right, top].map(readNumber);
  if (parsed.some((item) => item === null)) {
    return null;
  }

  return {
    left: parsed[0]!,
    bottom: parsed[1]!,
    right: parsed[2]!,
    top: parsed[3]!,
  };
}

function toGeometryBox(
  value: OpenDataLoaderBoundingBox | null,
): AnnualReportGeometryBox | null {
  if (!value) {
    return null;
  }

  return {
    left: value.left,
    bottom: value.bottom,
    right: value.right,
    top: value.top,
  };
}

function flattenUnknownText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenUnknownText);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(flattenUnknownText);
  }

  return [];
}

function extractElementText(element: OpenDataLoaderRawElement) {
  const candidates = [
    element.content,
    element.markdown,
    element.description,
    element.caption,
    element.rows,
    element.cells,
  ];
  const joined = candidates
    .flatMap(flattenUnknownText)
    .join("\n")
    .replace(/\r\n/g, "\n");

  return joined
    .split(/\n+/)
    .map((line) => stripDuplicateWhitespace(line))
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function mapBlockKind(rawType: string): AnnualReportPageBlock["kind"] {
  switch (rawType) {
    case "heading":
      return "heading";
    case "paragraph":
      return "paragraph";
    case "table":
      return "table";
    case "list":
      return "list";
    case "picture":
    case "image":
      return "picture";
    case "caption":
      return "caption";
    case "formula":
      return "formula";
    default:
      return "other";
  }
}

function extractPageNumber(element: OpenDataLoaderRawElement) {
  const pageNumber =
    readNumber(element["page number"]) ??
    readNumber(element.pageNumber) ??
    readNumber(element.page);
  return pageNumber && pageNumber > 0 ? pageNumber : null;
}

function topLevelTypeOf(payload: unknown): OpenDataLoaderRawOutputSummary["topLevelType"] {
  if (Array.isArray(payload)) {
    return "array";
  }

  if (payload && typeof payload === "object") {
    return "object";
  }

  if (payload === null || payload === undefined) {
    return "null";
  }

  return "other";
}

function readContainerPageNumber(value: Record<string, unknown>) {
  const pageNumber =
    readNumber(value["page number"]) ??
    readNumber(value.pageNumber) ??
    readNumber(value.page) ??
    readNumber(value.number) ??
    readNumber(value.index);

  return pageNumber && pageNumber > 0 ? pageNumber : null;
}

function isRawElementLike(value: unknown): value is OpenDataLoaderRawElement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type === "string" && record.type.trim().length > 0) {
    return true;
  }

  const pageNumber =
    readNumber(record["page number"]) ??
    readNumber(record.pageNumber) ??
    readNumber(record.page);
  const hasTextSignal =
    typeof record.content === "string" ||
    typeof record.markdown === "string" ||
    typeof record.description === "string" ||
    typeof record.caption === "string" ||
    Array.isArray(record.rows) ||
    Array.isArray(record.cells);

  return Boolean(pageNumber && pageNumber > 0 && hasTextSignal);
}

function withInheritedPageNumber(
  element: OpenDataLoaderRawElement,
  inheritedPageNumber: number | null,
) {
  if (!inheritedPageNumber || extractPageNumber(element)) {
    return element;
  }

  return {
    ...element,
    "page number": inheritedPageNumber,
  };
}

const KNOWN_ELEMENT_CONTAINER_KEYS = [
  "elements",
  "items",
  "blocks",
  "data",
  "children",
  "kids",
  "content",
] as const;

function collectElementsFromPayload(input: {
  payload: unknown;
  path?: string;
  inheritedPageNumber?: number | null;
  containerPaths?: Set<string>;
}): OpenDataLoaderRawElement[] {
  const path = input.path ?? "$";
  const inheritedPageNumber = input.inheritedPageNumber ?? null;
  const containerPaths = input.containerPaths ?? new Set<string>();

  if (Array.isArray(input.payload)) {
    const directElements = input.payload.filter(isRawElementLike);
    if (directElements.length === input.payload.length && directElements.length > 0) {
      containerPaths.add(path);
      return directElements.map((element) =>
        withInheritedPageNumber(element, inheritedPageNumber),
      );
    }

    return input.payload.flatMap((item, index) =>
      collectElementsFromPayload({
        payload: item,
        path: `${path}[${index}]`,
        inheritedPageNumber,
        containerPaths,
      }),
    );
  }

  if (!input.payload || typeof input.payload !== "object") {
    return [];
  }

  const record = input.payload as Record<string, unknown>;
  if (isRawElementLike(record)) {
    return [withInheritedPageNumber(record, inheritedPageNumber)];
  }

  const pageNumber = readContainerPageNumber(record) ?? inheritedPageNumber;
  const elements: OpenDataLoaderRawElement[] = [];

  const pages = record.pages;
  if (Array.isArray(pages)) {
    pages.forEach((page, index) => {
      const pageRecord = page && typeof page === "object" && !Array.isArray(page)
        ? (page as Record<string, unknown>)
        : null;
      elements.push(
        ...collectElementsFromPayload({
          payload: page,
          path: `${path}.pages[${index}]`,
          inheritedPageNumber: pageRecord
            ? readContainerPageNumber(pageRecord) ?? index + 1
            : index + 1,
          containerPaths,
        }),
      );
    });
  } else if (pages && typeof pages === "object") {
    Object.entries(pages as Record<string, unknown>).forEach(([key, value]) => {
      const numericKey = Number(key);
      elements.push(
        ...collectElementsFromPayload({
          payload: value,
          path: `${path}.pages.${key}`,
          inheritedPageNumber: Number.isFinite(numericKey) && numericKey > 0
            ? numericKey
            : pageNumber,
          containerPaths,
        }),
      );
    });
  }

  for (const key of KNOWN_ELEMENT_CONTAINER_KEYS) {
    if (key === "content" && typeof record[key] === "string") {
      continue;
    }

    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }

    elements.push(
      ...collectElementsFromPayload({
        payload: value,
        path: `${path}.${key}`,
        inheritedPageNumber: pageNumber,
        containerPaths,
      }),
    );
  }

  return elements;
}

function extractElementsWithContainerPaths(payload: unknown) {
  const containerPaths = new Set<string>();
  const elements = collectElementsFromPayload({
    payload,
    containerPaths,
  });

  return {
    elements,
    containerPaths: Array.from(containerPaths).sort(),
  };
}

function extractElements(payload: unknown) {
  return extractElementsWithContainerPaths(payload).elements;
}

export function summarizeOpenDataLoaderRawPayload(
  payload: unknown,
): OpenDataLoaderRawOutputSummary {
  const topLevelType = topLevelTypeOf(payload);
  const topLevelKeys =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.keys(payload as Record<string, unknown>).sort()
      : [];
  const { elements, containerPaths } = extractElementsWithContainerPaths(payload);
  const pageNumbers = Array.from(
    new Set(
      elements
        .map((element) => extractPageNumber(element))
        .filter((pageNumber): pageNumber is number => pageNumber !== null),
    ),
  ).sort((left, right) => left - right);
  const tableCount = elements.filter((element) =>
    typeof element.type === "string" && element.type.trim().toLowerCase() === "table",
  ).length;
  const textElementCount = elements.filter((element) => extractElementText(element).length > 0).length;
  const sampleElement = elements[0] && typeof elements[0] === "object"
    ? (elements[0] as Record<string, unknown>)
    : null;

  return {
    topLevelType,
    topLevelKeys,
    elementCount: elements.length,
    pageCount: pageNumbers.length,
    tableCount,
    textElementCount,
    elementContainerPaths: containerPaths,
    pageNumbers,
    sampleElementKeys: sampleElement ? Object.keys(sampleElement).sort().slice(0, 20) : [],
    sampleElementTypes: Array.from(
      new Set(
        elements
          .map((element) => typeof element.type === "string" ? element.type : null)
          .filter((value): value is string => Boolean(value)),
      ),
    ).slice(0, 20),
  };
}

function detectCellRole(text: string, rowIndex: number, numericValue: number | null) {
  const normalized = normalizeNorwegianText(text);
  if (rowIndex === 0 && /\b20\d{2}\b/.test(text)) {
    return "year_header" as const;
  }
  if (/^\d{1,2}$/.test(text.trim())) {
    return "note" as const;
  }
  if (numericValue !== null) {
    return "value" as const;
  }
  if (normalized.length > 0) {
    return "label" as const;
  }
  return "text" as const;
}

function splitFallbackRowText(line: string) {
  const tokens = repairOcrTokenBoundaries(line).split(/\s+/).filter(Boolean);
  let splitIndex = tokens.length;

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (parseFinancialInteger(tokens[index]) === null) {
      splitIndex = index + 1;
      break;
    }

    if (index === 0) {
      splitIndex = 0;
    }
  }

  const labelTokens = tokens.slice(0, splitIndex);
  const trailingNumericTokens = tokens.slice(splitIndex).filter(
    (token) => parseFinancialInteger(token) !== null,
  );
  const label = stripDuplicateWhitespace(labelTokens.join(" "));
  const numericTexts =
    trailingNumericTokens.length >= 2
      ? trailingNumericTokens
      : extractIntegers(line).flatMap((match) => {
          const matchTokens = repairOcrTokenBoundaries(match)
            .split(/\s+/)
            .filter((token) => parseFinancialInteger(token) !== null);
          return matchTokens.length >= 2 ? matchTokens : [match];
        });

  return {
    label,
    numericTexts,
  };
}

function buildFallbackTableRowsFromText(input: {
  text: string;
  tableBbox: AnnualReportGeometryBox | null;
  pageNumber: number;
  blockId: string;
  engineMode: OpenDataLoaderExecutionMode;
}) {
  const rawLines = input.text
    .split(/\n+/)
    .map((line) => stripDuplicateWhitespace(repairOcrTokenBoundaries(line)))
    .filter((line) => line.length > 0);

  const rowCount = rawLines.length || 1;
  const left = input.tableBbox?.left ?? 40;
  const right = input.tableBbox?.right ?? 540;
  const bottom = input.tableBbox?.bottom ?? 40;
  const top = input.tableBbox?.top ?? bottom + rowCount * 20;
  const tableWidth = Math.max(120, right - left);
  const rowHeight = Math.max(14, (top - bottom) / rowCount);

  return rawLines.map((line, rowIndex) => {
    const { label: labelText, numericTexts } = splitFallbackRowText(line);
    const textCells = [labelText, ...numericTexts].filter((value) => value.length > 0);
    const numericColumnCount = Math.max(1, numericTexts.length);
    const labelWidth = numericTexts.length > 0 ? tableWidth * 0.58 : tableWidth;
    const numericWidth = numericTexts.length > 0 ? (tableWidth - labelWidth) / numericColumnCount : 0;

    const rowTop = top - rowIndex * rowHeight;
    const rowBottom = rowTop - rowHeight;

    const cells = textCells.map((cellText, columnIndex) => {
      const isLabelCell = columnIndex === 0 && labelText.length > 0;
      const numericValue = parseFinancialInteger(cellText);
      const cellLeft = isLabelCell ? left : left + labelWidth + (columnIndex - 1) * numericWidth;
      const cellRight = isLabelCell ? left + labelWidth : cellLeft + numericWidth;

      return {
        id: `${input.blockId}-row-${rowIndex}-cell-${columnIndex}`,
        rowIndex,
        columnIndex,
        text: cellText,
        normalizedText: normalizeNorwegianText(cellText),
        bbox: {
          left: cellLeft,
          bottom: rowBottom,
          right: cellRight,
          top: rowTop,
        },
        isNumeric: numericValue !== null,
        numericValue,
        role: detectCellRole(cellText, rowIndex, numericValue),
        source: {
          engine: "OPENDATALOADER",
          engineMode: input.engineMode,
          sourceElementId: input.blockId,
          sourceRawType: "table",
          order: rowIndex,
        },
      } satisfies AnnualReportTableCell;
    });

    return {
      id: `${input.blockId}-row-${rowIndex}`,
      rowIndex,
      text: line,
      normalizedText: normalizeNorwegianText(line),
      bbox: {
        left,
        bottom: rowBottom,
        right,
        top: rowTop,
      },
      cells,
      source: {
        engine: "OPENDATALOADER",
        engineMode: input.engineMode,
        sourceElementId: input.blockId,
        sourceRawType: "table",
        order: rowIndex,
      },
    } satisfies AnnualReportTableRow;
  });
}

function normalizeTableStructure(input: {
  element: OpenDataLoaderRawElement;
  blockId: string;
  pageNumber: number;
  bbox: AnnualReportGeometryBox | null;
  text: string;
  engineMode: OpenDataLoaderExecutionMode;
}): AnnualReportTable | null {
  const rawRows = Array.isArray(input.element.rows) ? input.element.rows : null;
  if (rawRows && rawRows.length > 0) {
    const normalizedRows = rawRows.map((rawRow, rowIndex) => {
      const rawCells = Array.isArray(rawRow)
        ? rawRow
        : rawRow && typeof rawRow === "object" && Array.isArray((rawRow as Record<string, unknown>).cells)
          ? ((rawRow as Record<string, unknown>).cells as unknown[])
          : [];
      const rowText = stripDuplicateWhitespace(flattenUnknownText(rawRow).join(" "));
      const cells = rawCells.map((rawCell, columnIndex) => {
        const text = stripDuplicateWhitespace(flattenUnknownText(rawCell).join(" "));
        const numericValue = parseFinancialInteger(text);
        return {
          id: `${input.blockId}-row-${rowIndex}-cell-${columnIndex}`,
          rowIndex,
          columnIndex,
          text,
          normalizedText: normalizeNorwegianText(text),
          bbox: null,
          isNumeric: numericValue !== null,
          numericValue,
          role: detectCellRole(text, rowIndex, numericValue),
          source: {
            engine: "OPENDATALOADER",
            engineMode: input.engineMode,
            sourceElementId: input.blockId,
            sourceRawType: "table",
            order: rowIndex,
          },
        } satisfies AnnualReportTableCell;
      });

      return {
        id: `${input.blockId}-row-${rowIndex}`,
        rowIndex,
        text: rowText,
        normalizedText: normalizeNorwegianText(rowText),
        bbox: null,
        cells,
        source: {
          engine: "OPENDATALOADER",
          engineMode: input.engineMode,
          sourceElementId: input.blockId,
          sourceRawType: "table",
          order: rowIndex,
        },
      } satisfies AnnualReportTableRow;
    });

    return {
      id: `${input.blockId}-table`,
      pageNumber: input.pageNumber,
      bbox: input.bbox,
      rowCount: normalizedRows.length,
      columnCount: Math.max(...normalizedRows.map((row) => row.cells.length), 0),
      rows: normalizedRows,
      source: {
        engine: "OPENDATALOADER",
        engineMode: input.engineMode,
        sourceElementId: input.blockId,
        sourceRawType: "table",
        order: 0,
      },
    };
  }

  if (!input.text) {
    return null;
  }

  const rows = buildFallbackTableRowsFromText({
    text: input.text,
    tableBbox: input.bbox,
    pageNumber: input.pageNumber,
    blockId: input.blockId,
    engineMode: input.engineMode,
  });

  return {
    id: `${input.blockId}-table`,
    pageNumber: input.pageNumber,
    bbox: input.bbox,
    rowCount: rows.length,
    columnCount: Math.max(...rows.map((row) => row.cells.length), 0),
    rows,
    source: {
      engine: "OPENDATALOADER",
      engineMode: input.engineMode,
      sourceElementId: input.blockId,
      sourceRawType: "table",
      order: 0,
    },
  };
}

function buildWordsFromBlockText(input: {
  text: string;
  bbox: AnnualReportGeometryBox | null;
  lineIndex: number;
}) {
  const tokens = input.text.split(/\s+/).filter(Boolean);
  const availableWidth = Math.max(80, (input.bbox?.right ?? 520) - (input.bbox?.left ?? 40));
  const defaultLeft = input.bbox?.left ?? 40;
  const tokenWidth = Math.max(10, availableWidth / Math.max(tokens.length, 1));

  return tokens.map((token, tokenIndex) => ({
    text: token,
    normalizedText: normalizeNorwegianText(token),
    x: defaultLeft + tokenIndex * tokenWidth,
    y: input.bbox?.bottom ?? input.lineIndex * 14,
    width: tokenWidth,
    height: Math.max(12, (input.bbox?.top ?? 12) - (input.bbox?.bottom ?? 0)),
    confidence: 0.94,
    lineNumber: input.lineIndex,
  } satisfies ExtractedWord));
}

function buildLineFromTableRow(row: AnnualReportTableRow): ExtractedLine {
  const words = row.cells.flatMap((cell) =>
    cell.text
      .split(/\s+/)
      .filter(Boolean)
      .map((token, tokenIndex) => ({
        text: token,
        normalizedText: normalizeNorwegianText(token),
        x: (cell.bbox?.left ?? 0) + tokenIndex * 12,
        y: row.bbox?.bottom ?? 0,
        width: 12,
        height: (row.bbox?.top ?? 12) - (row.bbox?.bottom ?? 0),
        confidence: 0.96,
        lineNumber: row.rowIndex,
      })),
  );

  return {
    text: row.text,
    normalizedText: row.normalizedText,
    x: row.bbox?.left ?? 0,
    y: row.bbox?.bottom ?? 0,
    width: (row.bbox?.right ?? 100) - (row.bbox?.left ?? 0),
    height: (row.bbox?.top ?? 12) - (row.bbox?.bottom ?? 0),
    confidence: 0.96,
    words,
  };
}

function buildLineFromBlock(block: NormalizedDocumentBlock, lineText: string, lineIndex: number): ExtractedLine {
  const words = buildWordsFromBlockText({
    text: lineText,
    bbox: toGeometryBox(block.bbox),
    lineIndex,
  });
  return {
    text: lineText,
    normalizedText: normalizeNorwegianText(lineText),
    x: block.bbox?.left ?? 40,
    y: (block.bbox?.bottom ?? 40) + lineIndex * 14,
    width: (block.bbox?.right ?? 520) - (block.bbox?.left ?? 40),
    height: Math.max(12, (block.bbox?.top ?? 12) - (block.bbox?.bottom ?? 0)),
    confidence: 0.94,
    words,
  };
}

export function normalizeOpenDataLoaderPayload(input: {
  payload: unknown;
  engineVersion?: string | null;
  engineMode?: OpenDataLoaderExecutionMode;
  hasEmbeddedText?: boolean;
}) {
  const engineMode = input.engineMode ?? "local";
  const elements = extractElements(input.payload);
  const pages = new Map<number, NormalizedDocument["pages"][number]>();

  elements.forEach((element, index) => {
    const pageNumber = extractPageNumber(element);
    if (!pageNumber) {
      return;
    }

    const rawType = typeof element.type === "string" ? element.type.trim().toLowerCase() : "other";
    const blockId = String(element.id ?? `block-${pageNumber}-${index}`);
    const bbox = normalizeBoundingBox(element["bounding box"] ?? element.boundingBox);
    const geometryBox = toGeometryBox(bbox);
    const text = extractElementText(element);
    const table =
      rawType === "table"
        ? normalizeTableStructure({
            element,
            blockId,
            pageNumber,
            bbox: geometryBox,
            text,
            engineMode,
          })
        : null;
    const block: NormalizedDocumentBlock = {
      id: blockId,
      kind: mapBlockKind(rawType),
      rawType,
      pageNumber,
      order: index,
      bbox,
      text,
      suspiciousNoise: rawType === "other" && text.length < 2,
      headingLevel: readNumber(element["heading level"]) ?? readNumber(element.level),
      table,
      source: {
        engine: "OPENDATALOADER",
        engineMode,
        sourceElementId: blockId,
        sourceRawType: rawType,
        order: index,
      },
      metadata:
        element && typeof element === "object"
          ? {
              headingLevel: readNumber(element["heading level"]),
              level: element.level ?? null,
              font: element.font ?? null,
            }
          : undefined,
    };

    const page =
      pages.get(pageNumber) ?? {
        pageNumber,
        blocks: [],
        tables: [],
        text: "",
        hasEmbeddedText: input.hasEmbeddedText ?? true,
        source: {
          engine: "OPENDATALOADER" as const,
          engineMode,
        },
      };
    page.blocks.push(block);
    if (table) {
      page.tables.push(table);
    }
    pages.set(pageNumber, page);
  });

  const normalizedPages = Array.from(pages.values())
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => ({
      ...page,
      blocks: page.blocks.sort((left, right) => {
        const leftTop = left.bbox?.top ?? 0;
        const rightTop = right.bbox?.top ?? 0;
        if (rightTop !== leftTop) {
          return rightTop - leftTop;
        }
        return left.order - right.order;
      }),
      tables: page.tables.sort((left, right) => {
        const leftTop = left.bbox?.top ?? 0;
        const rightTop = right.bbox?.top ?? 0;
        return rightTop - leftTop;
      }),
      text: page.blocks
        .map((block) => block.text)
        .filter((text) => text.length > 0)
        .join("\n"),
    }));

  return {
    engine: "OPENDATALOADER",
    engineVersion: input.engineVersion ?? null,
    engineMode,
    pageCount: normalizedPages.length,
    pages: normalizedPages,
  } satisfies NormalizedDocument;
}

export function convertNormalizedDocumentToAnnualReportPages(
  document: NormalizedDocument,
) {
  return document.pages.map((page) => {
    const tableLines = page.tables.flatMap((table) =>
      table.rows.map((row) => buildLineFromTableRow(row)),
    );

    const blockLines = page.blocks.flatMap((block) => {
      if (block.kind === "table" && block.table) {
        return [];
      }

      return block.text
        .split(/\n+/)
        .map((line) => stripDuplicateWhitespace(line).trim())
        .filter((line) => line.length > 0)
        .map((line, lineIndex) => buildLineFromBlock(block, line, lineIndex));
    });

    const lines = [...blockLines, ...tableLines].sort((left, right) => left.y - right.y);
    const text = lines.map((line) => line.text).join("\n");

    return {
      pageNumber: page.pageNumber,
      text,
      normalizedText: normalizeNorwegianText(text),
      lines,
      hasEmbeddedText: page.hasEmbeddedText,
      blocks: page.blocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        rawType: block.rawType,
        text: block.text,
        normalizedText: normalizeNorwegianText(block.text),
        bbox: toGeometryBox(block.bbox),
        headingLevel: block.headingLevel ?? null,
        table: block.table ?? null,
        metadata: block.metadata,
        source: block.source,
      })),
      tables: page.tables,
      source: {
        engine: "OPENDATALOADER",
        engineMode: document.engineMode,
        sourceElementId: `page-${page.pageNumber}`,
        sourceRawType: "page",
        order: page.pageNumber,
      },
      metadata: page.metadata,
    } satisfies AnnualReportParsedPage;
  });
}
