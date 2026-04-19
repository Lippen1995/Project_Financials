import {
  ExtractedLine,
  ExtractedWord,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  normalizeNorwegianText,
  stripDuplicateWhitespace,
} from "@/integrations/brreg/annual-report-financials/text";
import {
  NormalizedDocument,
  NormalizedDocumentBlock,
  OpenDataLoaderBoundingBox,
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
  const joined = stripDuplicateWhitespace(
    candidates
      .flatMap(flattenUnknownText)
      .join("\n")
      .replace(/\r\n/g, "\n"),
  );
  return joined.trim();
}

function mapBlockKind(rawType: string): NormalizedDocumentBlock["kind"] {
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

function extractElements(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload as OpenDataLoaderRawElement[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["elements", "items", "blocks", "data"]) {
      if (Array.isArray(record[key])) {
        return record[key] as OpenDataLoaderRawElement[];
      }
    }
  }

  return [];
}

export function normalizeOpenDataLoaderPayload(input: {
  payload: unknown;
  engineVersion?: string | null;
  hasEmbeddedText?: boolean;
}) {
  const elements = extractElements(input.payload);
  const pages = new Map<number, NormalizedDocument["pages"][number]>();

  elements.forEach((element, index) => {
    const pageNumber = extractPageNumber(element);
    if (!pageNumber) {
      return;
    }

    const rawType = typeof element.type === "string" ? element.type.trim().toLowerCase() : "other";
    const block: NormalizedDocumentBlock = {
      id: String(element.id ?? `block-${pageNumber}-${index}`),
      kind: mapBlockKind(rawType),
      rawType,
      pageNumber,
      order: index,
      bbox: normalizeBoundingBox(element["bounding box"] ?? element.boundingBox),
      text: extractElementText(element),
      suspiciousNoise: rawType === "other" && extractElementText(element).length < 2,
      metadata:
        element && typeof element === "object"
          ? {
              headingLevel: readNumber(element["heading level"]),
              level: element.level ?? null,
            }
          : undefined,
    };

    const page =
      pages.get(pageNumber) ??
      {
        pageNumber,
        blocks: [],
        text: "",
        hasEmbeddedText: input.hasEmbeddedText ?? true,
      };
    page.blocks.push(block);
    pages.set(pageNumber, page);
  });

  const normalizedPages = Array.from(pages.values())
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => ({
      ...page,
      blocks: page.blocks.sort((left, right) => left.order - right.order),
      text: page.blocks
        .map((block) => block.text)
        .filter((text) => text.length > 0)
        .join("\n"),
    }));

  return {
    engine: "OPENDATALOADER",
    engineVersion: input.engineVersion ?? null,
    pageCount: normalizedPages.length,
    pages: normalizedPages,
  } satisfies NormalizedDocument;
}

function buildWordsForLine(lineText: string, xStart: number, y: number): ExtractedWord[] {
  const tokens = lineText.split(/\s+/).filter(Boolean);
  let currentX = xStart;

  return tokens.map((token, index) => {
    const width = Math.max(10, token.length * 6);
    const word = {
      text: token,
      normalizedText: normalizeNorwegianText(token),
      x: currentX,
      y,
      width,
      height: 12,
      confidence: 0.94,
      lineNumber: index,
    } satisfies ExtractedWord;
    currentX += width + 8;
    return word;
  });
}

export function convertNormalizedDocumentToPageTextLayers(document: NormalizedDocument) {
  return document.pages.map((page) => {
    const lines: ExtractedLine[] = [];

    page.blocks.forEach((block, blockIndex) => {
      const blockLines = block.text
        .split(/\n+/)
        .map((line) => stripDuplicateWhitespace(line).trim())
        .filter((line) => line.length > 0);

      blockLines.forEach((lineText, lineIndex) => {
        const y = blockIndex * 18 + lineIndex * 14 + 40;
        const x = block.bbox?.left ?? 40;
        const words = buildWordsForLine(lineText, x, y);
        lines.push({
          text: lineText,
          normalizedText: normalizeNorwegianText(lineText),
          x,
          y,
          width: Math.max(100, lineText.length * 6),
          height: 12,
          confidence: 0.94,
          words,
        });
      });
    });

    const text = lines.map((line) => line.text).join("\n");
    return {
      pageNumber: page.pageNumber,
      text,
      normalizedText: normalizeNorwegianText(text),
      lines,
      hasEmbeddedText: page.hasEmbeddedText,
    } satisfies PageTextLayer;
  });
}
