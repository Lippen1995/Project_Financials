import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

import {
  ExtractedLine,
  ExtractedWord,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText, stripDuplicateWhitespace } from "@/integrations/brreg/annual-report-financials/text";

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

export async function extractOcrPages(pdfBuffer: Buffer, pageNumbers?: number[]) {
  const parser = new PDFParse({ data: pdfBuffer });
  const screenshots = await parser.getScreenshot({
    partial: pageNumbers,
    scale: 3,
  });
  await parser.destroy();

  const worker = await createWorker("nor+eng", 1, {
    cachePath: path.join(os.tmpdir(), "projectx-tesseract-cache"),
  });

  try {
    const pages: PageTextLayer[] = [];

    for (const page of screenshots.pages) {
      const imagePath = path.join(os.tmpdir(), `projectx-financials-${page.pageNumber}.png`);
      await fs.writeFile(imagePath, Buffer.from(page.data));
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

      const lines = buildLinesFromWords(words);
      const text = stripDuplicateWhitespace(
        lines
          .map((line) => line.text)
          .join("\n")
          .trim(),
      );

      pages.push({
        pageNumber: page.pageNumber,
        text,
        normalizedText: normalizeNorwegianText(text),
        lines,
        hasEmbeddedText: false,
      });
    }

    return pages.sort((left, right) => left.pageNumber - right.pageNumber);
  } finally {
    await worker.terminate();
  }
}
