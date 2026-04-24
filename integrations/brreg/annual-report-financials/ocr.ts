import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

import {
  AnnualReportOcrDiagnostics,
  AnnualReportOcrExtractionResult,
  ExtractedLine,
  ExtractedWord,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText, stripDuplicateWhitespace } from "@/integrations/brreg/annual-report-financials/text";

const OCR_MIN_WIDTH_PX = 64;
const OCR_MIN_HEIGHT_PX = 64;
const OCR_MIN_AREA_PX = 8_192;

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
    pageCount,
    imageRegionCount: 0,
    tinyCropSkippedCount: 0,
    invalidCropCount: 0,
    ocrAttemptCount: 0,
    ocrFailureCount: 0,
    usableOcrRegionCount: 0,
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
    scale: 3,
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
    const pages: PageTextLayer[] = [];

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
      diagnostics.ocrAttemptCount += 1;

      let result;
      try {
        result = await worker.recognize(imagePath, {}, { text: true, tsv: true });
      } catch (error) {
        diagnostics.ocrFailureCount += 1;
        const message = summarizeRecognitionError(error);
        diagnostics.regionFailures.push({
          pageNumber: page.pageNumber,
          stage: "recognition",
          category: "ocr_failure",
          message,
        });
        pushSuppressedFailure(suppressedFailures, message);
        continue;
      }

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

      const lines = buildLinesFromWords(words);
      const text = stripDuplicateWhitespace(
        lines
          .map((line) => line.text)
          .join("\n")
          .trim(),
      );

      if (lines.length === 0 || text.length < 8) {
        diagnostics.regionFailures.push({
          pageNumber: page.pageNumber,
          stage: "recognition",
          category: "ocr_quality_too_weak",
          message: "OCR produced no usable lines for this page-level region.",
        });
        pushSuppressedFailure(
          suppressedFailures,
          "OCR produced no usable lines for this page-level region.",
        );
        continue;
      }

      diagnostics.usableOcrRegionCount += 1;

      pages.push({
        pageNumber: page.pageNumber,
        text,
        normalizedText: normalizeNorwegianText(text),
        lines,
        hasEmbeddedText: false,
      });
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
