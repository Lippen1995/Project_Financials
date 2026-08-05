import {
  extractIntegers,
  normalizeNorwegianText,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
  stripDuplicateWhitespace,
} from "@/lib/norwegian-text";
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

function extractListItemTexts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return flattenUnknownText(item);
    }

    const record = item as Record<string, unknown>;
    return [
      record.content,
      record.markdown,
      record.description,
      record.caption,
      record.kids,
      record["list items"],
    ].flatMap((candidate) =>
      candidate === record.kids || candidate === record["list items"]
        ? extractListItemTexts(candidate)
        : flattenUnknownText(candidate),
    );
  });
}

function extractElementText(element: OpenDataLoaderRawElement) {
  const candidates = [
    element.content,
    element.markdown,
    element.description,
    element.caption,
    element.rows,
    element.cells,
    extractListItemTexts(element["list items"]),
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
    case "section_header":  // Docling v2 label for section headings
    case "section-header":  // alternative hyphenated form
    case "title":           // Docling page/section title label
      return "heading";
    case "paragraph":
    case "text":            // Docling plain-text label
      return "paragraph";
    case "table":
      return "table";
    case "list":
    case "list_item":       // Docling list item label
      return "list";
    case "picture":
    case "image":
    case "figure":
      return "picture";
    case "caption":
      return "caption";
    case "formula":
    case "equation":
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

function summarizeContainerValue(
  key: string,
  value: unknown,
): OpenDataLoaderRawOutputSummary["topLevelContainerDiagnostics"][number] {
  if (Array.isArray(value)) {
    const firstItem = value[0];
    return {
      key,
      valueType: "array",
      length: value.length,
      sampleItemType:
        firstItem === null
          ? "null"
          : Array.isArray(firstItem)
            ? "array"
            : typeof firstItem,
      sampleItemKeys:
        firstItem && typeof firstItem === "object" && !Array.isArray(firstItem)
          ? Object.keys(firstItem as Record<string, unknown>).sort().slice(0, 20)
          : [],
    };
  }

  if (value === null || value === undefined) {
    return {
      key,
      valueType: "null",
      length: null,
      sampleItemType: null,
      sampleItemKeys: [],
    };
  }

  if (typeof value === "object") {
    return {
      key,
      valueType: "object",
      length: Object.keys(value as Record<string, unknown>).length,
      sampleItemType: null,
      sampleItemKeys: Object.keys(value as Record<string, unknown>).sort().slice(0, 20),
    };
  }

  if (typeof value === "string") {
    return {
      key,
      valueType: "string",
      length: value.length,
      sampleItemType: null,
      sampleItemKeys: [],
    };
  }

  if (typeof value === "number") {
    return {
      key,
      valueType: "number",
      length: null,
      sampleItemType: null,
      sampleItemKeys: [],
    };
  }

  if (typeof value === "boolean") {
    return {
      key,
      valueType: "boolean",
      length: null,
      sampleItemType: null,
      sampleItemKeys: [],
    };
  }

  return {
    key,
    valueType: "other",
    length: null,
    sampleItemType: null,
    sampleItemKeys: [],
  };
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

// Detect and extract from Docling DoclingDocument format (export_to_dict output)
// Format: {schema_name: "DoclingDocument", texts: [...], tables: [...], pages: {...}}
// Also handles the hybrid server HTTP response: {document: {json_content: <DoclingDocument>}}
function unwrapDoclingHttpResponse(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const doc = record.document;
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    const jsonContent = (doc as Record<string, unknown>).json_content;
    if (jsonContent && typeof jsonContent === "object" && !Array.isArray(jsonContent)) {
      return jsonContent;
    }
  }
  return payload;
}

function isDoclingDocumentFormat(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return (
    (typeof record.schema_name === "string" && record.schema_name.includes("DoclingDocument")) ||
    (Array.isArray(record.texts) && record.texts.length > 0)
  );
}

function extractElementsFromDoclingFormat(payload: unknown): OpenDataLoaderRawElement[] {
  const doc = payload as {
    texts?: Array<{
      self_ref?: string;
      label?: string;
      prov?: Array<{ page_no?: number; bbox?: { l: number; t: number; r: number; b: number } }>;
      text?: string;
      orig?: string;
    }>;
    tables?: Array<{
      self_ref?: string;
      label?: string;
      prov?: Array<{ page_no?: number; bbox?: { l: number; t: number; r: number; b: number } }>;
      data?: {
        table_cells?: Array<{
          start_row_offset_idx: number;
          start_col_offset_idx: number;
          text?: string;
        }>;
        num_rows?: number;
        num_cols?: number;
      };
    }>;
  };

  const elements: OpenDataLoaderRawElement[] = [];
  let idCounter = 1;

  for (const textItem of doc.texts ?? []) {
    const prov = textItem.prov?.[0];
    if (!prov?.page_no) continue;
    const bbox = prov.bbox;
    elements.push({
      type: textItem.label ?? "paragraph",
      id: idCounter++,
      "page number": prov.page_no,
      content: textItem.text ?? textItem.orig ?? "",
      "bounding box": bbox ? [bbox.l, bbox.b, bbox.r, bbox.t] : undefined,
    });
  }

  for (const tableItem of doc.tables ?? []) {
    const prov = tableItem.prov?.[0];
    if (!prov?.page_no) continue;
    const bbox = prov.bbox;
    const data = tableItem.data;
    if (!data) continue;

    const numRows = data.num_rows ?? 0;
    const numCols = data.num_cols ?? 0;
    const grid: string[][] = Array.from({ length: numRows }, () => Array<string>(numCols).fill(""));
    for (const cell of data.table_cells ?? []) {
      const r = cell.start_row_offset_idx;
      const c = cell.start_col_offset_idx;
      if (r < numRows && c < numCols) {
        grid[r][c] = cell.text ?? "";
      }
    }

    elements.push({
      type: "table",
      id: idCounter++,
      "page number": prov.page_no,
      rows: grid,
      "bounding box": bbox ? [bbox.l, bbox.b, bbox.r, bbox.t] : undefined,
    });
  }

  return elements;
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
  const elementTypeCounts = elements.reduce<Record<string, number>>((counts, element) => {
    const key =
      typeof element.type === "string" && element.type.trim().length > 0
        ? element.type.trim().toLowerCase()
        : "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const sampleElement = elements[0] && typeof elements[0] === "object"
    ? (elements[0] as Record<string, unknown>)
    : null;
  const topLevelContainerDiagnostics =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.entries(payload as Record<string, unknown>)
          .filter(([, value]) =>
            Array.isArray(value) || (value !== null && typeof value === "object"),
          )
          .map(([key, value]) => summarizeContainerValue(key, value))
      : [];

  return {
    topLevelType,
    topLevelKeys,
    elementCount: elements.length,
    pageCount: pageNumbers.length,
    tableCount,
    textElementCount,
    elementTypeCounts,
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
    topLevelContainerDiagnostics,
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

// Extracts text from a single table cell. Handles three formats:
// 1. Plain string cell (DoclingDocument grid output)
// 2. Java CLI cell with nested kids: {type:"table cell", kids:[{content:"..."}]}
// 3. Generic fallback via flattenUnknownText
function extractCellText(rawCell: unknown): string {
  if (typeof rawCell === "string") return rawCell;
  if (!rawCell || typeof rawCell !== "object" || Array.isArray(rawCell)) {
    return flattenUnknownText(rawCell).join(" ");
  }
  const cell = rawCell as Record<string, unknown>;
  // Prefer direct text fields
  for (const key of ["content", "text", "markdown"]) {
    if (typeof cell[key] === "string" && cell[key]) return cell[key] as string;
  }
  // Java CLI format: kids array with nested text elements
  if (Array.isArray(cell.kids) && cell.kids.length > 0) {
    const parts: string[] = [];
    for (const kid of cell.kids as unknown[]) {
      parts.push(extractCellText(kid));
    }
    return parts.filter(Boolean).join(" ");
  }
  // Last resort: flattenUnknownText on known text-only keys
  const textKeys = ["content", "text", "markdown", "description", "caption"];
  const parts = textKeys.flatMap((k) => (cell[k] !== undefined ? flattenUnknownText(cell[k]) : []));
  return parts.join(" ");
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
        const text = stripDuplicateWhitespace(extractCellText(rawCell));
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

// ────────────────────────────────────────────────────────────────────────────
// Tabular-paragraph segmentation for Docling-produced Del 1 statement pages.
//
// Why this exists
// ───────────────
// When Docling's hybrid backend OCRs a Brønnøysund statutory form (Del 1),
// the income statement and balance sheet pages frequently come back as ONE
// giant `paragraph` block whose `text` contains the entire statement on a
// single logical line — every row label, every note reference and every
// number concatenated together with normal spaces and no `\n` between rows.
//
// The downstream geometry-first row reconstructor expects one line per
// statement row and depends on word-level x positions to bucket numeric
// tokens into year columns. With one mega-line and evenly-spread synthetic
// x positions there are no detectable column anchors → 0 rows → 0 facts.
//
// This module splits such a paragraph into its constituent statement rows
// and assigns each token a synthetic x position so the row label sits on
// the left and value tokens sit near the year-column anchors of the page.
//
// Detection
// ─────────
// A block is considered "tabular paragraph collapse" when its text holds
// enough number tokens (≥ TABULAR_MIN_NUMERIC_TOKENS) and enough alphabetic
// tokens (≥ TABULAR_MIN_ALPHA_TOKENS) to plausibly be a statement, and the
// raw text contains at most one line break. This avoids touching prose
// blocks in the board report and short single-row paragraphs.
//
// Row segmentation
// ────────────────
// Tokens are classified as either numeric (`-?\d+`) or alphabetic (contains
// a letter). A new row starts whenever an alphabetic token follows at least
// two numeric tokens, which is the universal shape of a Norwegian
// statement row: `<label words> [note] <year1 value> <year2 value>`.
//
// Number grouping
// ───────────────
// Within a row, consecutive numeric tokens are partitioned into 1–4
// distinct "financial numbers". A financial number is a leading 1-3 digit
// token (possibly negative) followed by zero or more trailing 3-digit
// groups. The partitioner prefers MORE numbers over fewer, because rows
// typically encode 2-3 column values (note + year1 + year2 or year1 +
// year2). When multiple valid partitions exist the one with the most
// numbers wins; ties go to the partition with the shortest leading number,
// which keeps note references separate from year values.
//
// X-position assignment
// ─────────────────────
// For each row, label tokens are stacked from the block's left edge across
// the LABEL_FRACTION (60%) of the block width. The right 40% is divided
// equally among the row's numeric groups so each group's center x sits
// near the year header anchors. This places year-1 values around the
// year-1 column anchor and year-2 values around the year-2 anchor, so the
// downstream geometry-first reconstructor correctly buckets them.
// ────────────────────────────────────────────────────────────────────────────

const TABULAR_MIN_NUMERIC_TOKENS = 6;
const TABULAR_MIN_ALPHA_TOKENS = 4;
const LABEL_FRACTION = 0.6;
const NUMERIC_TOKEN_RE = /^-?\d+$/;
const ALPHA_TOKEN_RE = /[A-Za-zÆØÅæøå]/;
const ROW_HEIGHT = 14;

interface TabularRow {
  labelTokens: string[];
  numericGroups: string[][]; // each inner array is the digit-group tokens of one financial number
}

function isNumericToken(token: string): boolean {
  return NUMERIC_TOKEN_RE.test(token);
}

function hasAlpha(token: string): boolean {
  return ALPHA_TOKEN_RE.test(token);
}

/**
 * Returns true when the tokens form one valid Norwegian financial number:
 * a leading 1-3 digit group (optionally negative) followed by zero or more
 * exactly-3-digit groups. "211 739 845" ✓, "20 000" ✓, "12" ✓, "20 00" ✗.
 */
function isValidNumberSequence(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  if (!/^-?\d{1,3}$/.test(tokens[0]!)) return false;
  for (let i = 1; i < tokens.length; i++) {
    if (!/^\d{3}$/.test(tokens[i]!)) return false;
  }
  return true;
}

/**
 * Greedy partition: consume the leading 1-3 digit (possibly negative) token,
 * then keep absorbing trailing tokens for as long as they are exactly 3
 * digits. Repeat until tokens are exhausted. This matches the natural
 * Norwegian financial number format ("211 739 845" → one number).
 */
function greedyPartition(numericTokens: string[]): string[][] {
  const result: string[][] = [];
  let i = 0;
  while (i < numericTokens.length) {
    if (!/^-?\d{1,3}$/.test(numericTokens[i]!)) {
      // Leading group must be 1-3 digits. Skip a malformed token rather
      // than crash; partitioning is best-effort here.
      i++;
      continue;
    }
    const group: string[] = [numericTokens[i]!];
    i++;
    while (i < numericTokens.length && /^\d{3}$/.test(numericTokens[i]!)) {
      group.push(numericTokens[i]!);
      i++;
    }
    result.push(group);
  }
  return result;
}

/**
 * Partitions `numericTokens` into the most plausible sequence of financial
 * numbers. Returns null when no valid partition exists.
 *
 * Strategy:
 *   1. Try to peel off a note prefix. A note is a 1-2 digit standalone
 *      token at the start when greedy-partitioning the remainder yields
 *      exactly 2 values (the typical {note, year1, year2} row shape).
 *      Without this peel, greedy would absorb the note into year1
 *      ("2 211 739 845" → one number 2,211,739,845, wrong).
 *   2. Run pure greedy on the (possibly peeled) tokens.
 *   3. If greedy collapses everything into a single number with ≥ 4
 *      tokens, try halving it — "910 404 454 052" should be year1
 *      "910 404" and year2 "454 052" not a single 12-digit number. The
 *      halving is only kept when both halves are individually valid.
 *
 * The `maxNumbers` cap (typically 4) guards against pathological inputs
 * where some rows might fragment into many tiny numbers.
 */
/**
 * Total digit count (ignoring leading minus) of a single financial number,
 * used to decide whether greedy's first group is suspiciously large and
 * therefore likely a mis-parsed note + value sequence.
 */
function digitCountOfGroup(group: string[]): number {
  let count = 0;
  for (const token of group) count += token.replace(/-/g, "").length;
  return count;
}

/**
 * The ambiguity at the heart of partitioning: a leading 1-2 digit token can
 * be either a NOTE reference ("2" in "Sumn inntekter 2 211 739 845 20 000")
 * or the millions digit of a year-1 value ("5" in "Inntekt på investering
 * datterselskap 5 359 186 34 212 057"). Both inputs look identical at the
 * token level.
 *
 * Disambiguation rule (10-digit threshold): if greedy's first group has ≥ 10
 * digits, it represents a value ≥ 1 000 000 000 NOK (one billion). Single
 * statement-row line items rarely exceed a billion NOK, so a 10+ digit
 * leading group is strong evidence that the parser absorbed a note into
 * year-1 and should be re-split with peel. When greedy's first group has
 * < 10 digits, trust greedy — the leading 1-2 digit token is part of year-1.
 *
 * This threshold matches the values seen for Canica AS 2024 page 2:
 *   "Sumn inntekter 2 211 739 845 20 000"
 *     greedy → [2 211 739 845, 20 000] → 2.2B (10 digits) → peel ✓
 *   "Inntekt på investering ... 5 359 186 34 212 057"
 *     greedy → [5 359 186, 34 212 057] → 5.4M (7 digits) → no peel ✓
 *   "Renteinntekt fra foretak ... 39 632 040 43 125 107"
 *     greedy → [39 632 040, 43 125 107] → 40M (8 digits) → no peel ✓
 */
const NOTE_PEEL_DIGIT_THRESHOLD = 10;

function partitionFinancialNumbers(
  numericTokens: string[],
  maxNumbers: number,
): string[][] | null {
  if (numericTokens.length === 0) return [];

  // Step 1: greedy partition is the default. It correctly handles rows
  // where the note token naturally breaks the 3-digit-group chain (e.g.
  // "Lønnskostnad 3 36 735 687 36 464 192" — greedy yields 3 groups).
  const greedy = greedyPartition(numericTokens);
  if (greedy.length === 0) return null;
  if (!greedy.every(isValidNumberSequence)) return null;

  // Step 2: detect "note absorbed into year-1" pattern. Only relevant when
  // greedy returned exactly 2 groups (which is the only case where a 1-2
  // digit lead can hide inside a longer first group).
  if (
    greedy.length === 2 &&
    digitCountOfGroup(greedy[0]!) >= NOTE_PEEL_DIGIT_THRESHOLD &&
    /^\d{1,2}$/.test(numericTokens[0]!) &&
    numericTokens.length >= 4
  ) {
    const rest = greedyPartition(numericTokens.slice(1));
    if (rest.length === 2 && rest.every(isValidNumberSequence)) {
      const peeled = [[numericTokens[0]!], ...rest];
      if (peeled.length <= maxNumbers) return peeled;
    }
  }

  // Step 3: when greedy fuses everything into a single fat number with ≥ 4
  // tokens, try a balanced split. Statement rows almost never legitimately
  // have a single value spanning 4+ digit groups (trillions of NOK).
  if (greedy.length === 1 && greedy[0]!.length >= 4) {
    const tokens = greedy[0]!;
    const half = Math.floor(tokens.length / 2);
    const left = tokens.slice(0, half);
    const right = tokens.slice(half);
    if (isValidNumberSequence(left) && isValidNumberSequence(right)) {
      return [left, right];
    }
  }

  if (greedy.length > maxNumbers) {
    // Truncate to maxNumbers by merging trailing groups into the last.
    const trimmed = greedy.slice(0, maxNumbers - 1);
    const tail = greedy.slice(maxNumbers - 1).flat();
    if (isValidNumberSequence(tail)) {
      return [...trimmed, tail];
    }
  }

  return greedy;
}

/**
 * Splits the paragraph token stream into rows. Each row starts when an
 * alphabetic token follows ≥ 2 numeric tokens in the current row buffer.
 */
function splitTokensIntoTabularRows(tokens: string[]): TabularRow[] {
  const rows: TabularRow[] = [];
  let currentLabel: string[] = [];
  let currentNumeric: string[] = [];
  let collectingNumbers = false;

  const flush = () => {
    if (currentLabel.length === 0 && currentNumeric.length === 0) return;
    if (currentNumeric.length === 0) {
      // A label-only segment (section header like "Inntekter"). Skip it —
      // it will get prepended to the next row's label below.
      return;
    }
    const groups = partitionFinancialNumbers(currentNumeric, 4) ?? [currentNumeric];
    rows.push({ labelTokens: [...currentLabel], numericGroups: groups });
    currentLabel = [];
    currentNumeric = [];
    collectingNumbers = false;
  };

  let pendingLabelCarry: string[] = [];

  for (const token of tokens) {
    const numeric = isNumericToken(token);
    const alpha = hasAlpha(token);
    if (!numeric && !alpha) continue; // punctuation / symbols

    if (alpha) {
      // Transition NUMBER → ALPHA: emit row if we have enough numeric tokens.
      if (collectingNumbers && currentNumeric.length >= 2) {
        flush();
        currentLabel = [...pendingLabelCarry];
        pendingLabelCarry = [];
      }
      // Still in label-collection mode (no numbers yet) OR fresh row.
      if (currentNumeric.length === 0) {
        currentLabel.push(token);
      } else {
        // Saw 1 stray digit but not enough to be a row — treat as part of
        // a noisy label and reset numeric buffer.
        currentLabel.push(...currentNumeric.map(String));
        currentNumeric = [];
        currentLabel.push(token);
        collectingNumbers = false;
      }
    } else {
      // numeric token
      currentNumeric.push(token);
      collectingNumbers = true;
    }
  }
  flush();

  return rows;
}

/** Counts how many tokens in the raw text are alphabetic / numeric. */
function classifyParagraphTokens(text: string): { numericCount: number; alphaCount: number; tokens: string[] } {
  const tokens = text.split(/\s+/).filter(Boolean);
  let numericCount = 0;
  let alphaCount = 0;
  for (const token of tokens) {
    if (isNumericToken(token)) numericCount++;
    else if (hasAlpha(token)) alphaCount++;
  }
  return { numericCount, alphaCount, tokens };
}

// Year-column anchor positions, expressed as a fraction of block width.
//
// The Brønnøysund statutory form year header is normally six tokens
// ("Beløp i NOK Note 2024 2023") that `buildWordsFromBlockText` distributes
// evenly across the heading block's bbox. The years land at indices 4 and 5
// out of 6 ⇒ x ≈ 67 % and ≈ 83 % of the block width respectively.
// We deliberately place value groups at the SAME relative positions so that
// `findYearColumnAnchors` (which inspects the heading block) and the
// downstream geometry-first reconstructor (which inspects each row line)
// agree on what x belongs to which year column.
const YEAR1_X_FRACTION = 0.67;
const YEAR2_X_FRACTION = 0.83;
const NOTE_X_FRACTION = 0.55; // far enough from YEAR1 (0.67) to stay separable
const YEAR_VALUE_COLUMNS = 2;

/**
 * Build a synthetic ExtractedLine for a single segmented row.
 *
 * Layout per row:
 *   • Label words: stacked across the left 0–60 % of the block.
 *   • Leading "note" groups (everything beyond the trailing 2 financial
 *     numbers): folded into the label area at ~55 % of width as label tokens
 *     so they never compete for a year-column bucket. Critically these are
 *     **dropped** from the value list — they aren't financial amounts.
 *   • The trailing 2 financial numbers: positioned with their token cluster
 *     centred exactly on YEAR1_X_FRACTION and YEAR2_X_FRACTION so they
 *     bucket cleanly into their respective year columns downstream.
 *
 * Why drop the note?  Geometry-first treats every numeric token as a value
 * candidate and bucket-assigns it to the nearest year-column anchor. A note
 * reference like "2" near the label would still end up assigned to year 1
 * and would corrupt the value (e.g. "2 211 739 845" → "2211739845"). By
 * keeping the note in the label area as a *non-numeric appearance* word
 * (we still emit it as a token but place its x at NOTE_X_FRACTION, well
 * inside the label region, AND we deliberately drop its tokens from the
 * value-column emission), we get the row's actual financial figures into
 * the correct columns without losing the row identity.
 *
 * Each row gets a distinct y so the downstream sorter (descending y) keeps
 * statement order: earlier rows higher up the page.
 */
function buildLineFromTabularRow(
  block: NormalizedDocumentBlock,
  row: TabularRow,
  rowIndex: number,
  totalRows: number,
): ExtractedLine {
  const bbox = toGeometryBox(block.bbox);
  const left = bbox?.left ?? 40;
  const right = bbox?.right ?? 520;
  const top = bbox?.top ?? 12;
  const bottom = bbox?.bottom ?? 0;
  const width = Math.max(120, right - left);
  const blockHeight = Math.max(12, top - bottom);

  const rowHeight = totalRows > 0 ? blockHeight / totalRows : ROW_HEIGHT;
  const rowBottom = bottom + (totalRows - 1 - rowIndex) * rowHeight;

  const labelWidth = width * LABEL_FRACTION;

  // Decide which numeric groups are notes (folded into the label area) and
  // which are the real year values (placed at year-column anchors).
  const groupCount = row.numericGroups.length;
  const valueGroupCount = Math.min(YEAR_VALUE_COLUMNS, groupCount);
  const noteGroupCount = groupCount - valueGroupCount;
  const noteGroups = row.numericGroups.slice(0, noteGroupCount);
  const valueGroups = row.numericGroups.slice(noteGroupCount);

  const words: ExtractedWord[] = [];

  // Label tokens: stack across the left LABEL_FRACTION of the block. With
  // labelWidth divided by the label-token count, tokens land at evenly
  // spaced x positions that all fall well to the left of year anchors.
  //
  // IMPORTANT: purely-numeric label tokens are NOT emitted as words even
  // though they remain in the row's label text and audit trail. Numeric
  // text like "1" (often OCR-mistaken for the letter "i" inside Norwegian
  // labels — "investering i datterselskap" → "...investering 1
  // datterselskap...") would otherwise satisfy isNumericToken() in
  // geometry-first and be bucket-assigned to the nearest year column,
  // corrupting that year's value with a stray leading digit. By omitting
  // their word entry, the only numeric tokens left in the line are real
  // financial values that belong to year columns.
  if (row.labelTokens.length > 0) {
    const labelTokenWidth = labelWidth / Math.max(row.labelTokens.length, 1);
    for (let i = 0; i < row.labelTokens.length; i++) {
      const token = row.labelTokens[i]!;
      if (NUMERIC_TOKEN_RE.test(token)) continue;
      words.push({
        text: token,
        normalizedText: normalizeNorwegianText(token),
        x: left + i * labelTokenWidth,
        y: rowBottom,
        width: labelTokenWidth,
        height: rowHeight,
        confidence: 0.92,
        lineNumber: rowIndex,
      });
    }
  }

  // Note groups are deliberately NOT emitted as words.
  //
  // Geometry-first treats every numeric token as a year-column value
  // candidate (no opt-out): a note reference like "2" would otherwise be
  // bucketed to the nearest year anchor and corrupt that year's value
  // (e.g. "Sumn inntekter 2 211 739 845 20 000" → year-1 column gets
  // "2" + "211 739 845" concatenated → "2 211 739 845" misread as 2.2B).
  //
  // Keeping the note text in `rowText` preserves the row's audit trail
  // while omitting the note tokens from `words` ensures only true value
  // tokens contribute to year-column bucketing downstream. The note
  // reference is metadata, not a financial figure.
  void noteGroups; // intentionally unused — see comment above

  // Year-value tokens: cluster each group around its anchor position so all
  // tokens of one financial number bucket into the same year column.
  const anchorFractions = [YEAR1_X_FRACTION, YEAR2_X_FRACTION];
  for (let groupIndex = 0; groupIndex < valueGroups.length; groupIndex++) {
    const groupTokens = valueGroups[groupIndex]!;
    const groupCenter = left + anchorFractions[groupIndex]! * width;
    // Cluster radius: ~6 px so all digit-groups of a number share a column.
    const innerSpan = 6;
    const innerStep = groupTokens.length > 1 ? innerSpan / (groupTokens.length - 1) : 0;
    const groupStart = groupCenter - innerSpan / 2;
    for (let i = 0; i < groupTokens.length; i++) {
      const token = groupTokens[i]!;
      words.push({
        text: token,
        normalizedText: normalizeNorwegianText(token),
        x: groupStart + i * innerStep,
        y: rowBottom,
        width: Math.max(8, innerSpan / Math.max(groupTokens.length, 1)),
        height: rowHeight,
        confidence: 0.92,
        lineNumber: rowIndex,
      });
    }
  }

  const rowText = [
    row.labelTokens.join(" "),
    ...row.numericGroups.map((g) => g.join(" ")),
  ]
    .filter((part) => part.length > 0)
    .join(" ");

  return {
    text: rowText,
    normalizedText: normalizeNorwegianText(rowText),
    x: left,
    y: rowBottom,
    width,
    height: rowHeight,
    confidence: 0.92,
    words,
  };
}

/**
 * If the block looks like a collapsed Del 1 statement page (many numbers,
 * many alphabetic labels, one logical line), return one ExtractedLine per
 * reconstructed statement row. Otherwise return null and let the caller
 * fall back to ordinary `\n`-based line splitting.
 */
function tryBuildLinesFromTabularBlock(block: NormalizedDocumentBlock): ExtractedLine[] | null {
  if (block.kind !== "paragraph" && block.kind !== "heading") return null;
  const rawText = block.text ?? "";
  if (rawText.length === 0) return null;
  // Bail out early when the block already has its own line breaks — those
  // pages don't need segmentation help.
  const newlineCount = (rawText.match(/\n/g) || []).length;
  if (newlineCount >= 2) return null;

  const { numericCount, alphaCount, tokens } = classifyParagraphTokens(rawText);
  if (numericCount < TABULAR_MIN_NUMERIC_TOKENS) return null;
  if (alphaCount < TABULAR_MIN_ALPHA_TOKENS) return null;

  const rows = splitTokensIntoTabularRows(tokens);
  // Need at least 2 rows to justify the rewrite — a single row would have
  // been handled fine by the default single-line path.
  if (rows.length < 2) return null;

  return rows.map((row, index) => buildLineFromTabularRow(block, row, index, rows.length));
}

// Exported for unit tests.
export const __internal = {
  splitTokensIntoTabularRows,
  partitionFinancialNumbers,
  isValidNumberSequence,
  tryBuildLinesFromTabularBlock,
};

export function normalizeOpenDataLoaderPayload(input: {
  payload: unknown;
  engineVersion?: string | null;
  engineMode?: OpenDataLoaderExecutionMode;
  hasEmbeddedText?: boolean;
}) {
  const engineMode = input.engineMode ?? "local";

  // Pre-process: unwrap Docling HTTP response wrapper and handle DoclingDocument format
  const unwrapped = unwrapDoclingHttpResponse(input.payload);
  const elements = isDoclingDocumentFormat(unwrapped)
    ? extractElementsFromDoclingFormat(unwrapped)
    : extractElements(input.payload);
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

      // Del 1 statement pages from Docling frequently collapse to a single
      // paragraph block that contains the whole resultatregnskap or balanse
      // on one logical line. Detect that shape and rebuild proper rows so
      // the downstream geometry-first reconstructor can extract facts.
      const tabularLines = tryBuildLinesFromTabularBlock(block);
      if (tabularLines !== null) {
        return tabularLines;
      }

      return block.text
        .split(/\n+/)
        .map((line) => stripDuplicateWhitespace(line).trim())
        .filter((line) => line.length > 0)
        .map((line, lineIndex) => buildLineFromBlock(block, line, lineIndex));
    });

    // Sort descending by y: ODL blocks use PDF coordinates where y increases upward,
    // so higher y = higher on page. Descending gives reading order (top-to-bottom).
    const lines = [...blockLines, ...tableLines].sort((left, right) => right.y - left.y);
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
