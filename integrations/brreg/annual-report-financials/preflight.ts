import { PDFParse } from "pdf-parse";

import {
  ExtractedLine,
  PageTextLayer,
  PreflightResult,
} from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText, stripDuplicateWhitespace } from "@/integrations/brreg/annual-report-financials/text";

function buildEmbeddedTextLines(text: string): ExtractedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => stripDuplicateWhitespace(line))
    .filter(Boolean)
    .map((line, index) => ({
      text: line,
      normalizedText: normalizeNorwegianText(line),
      x: 0,
      y: index * 16,
      width: line.length * 7,
      height: 12,
      confidence: 0.95,
      words: line.split(/\s+/).map((word, wordIndex) => ({
        text: word,
        normalizedText: normalizeNorwegianText(word),
        x: wordIndex * 40,
        y: index * 16,
        width: Math.max(8, word.length * 7),
        height: 12,
        confidence: 0.95,
        lineNumber: index,
      })),
    }));
}

export async function preflightAnnualReportDocument(pdfBuffer: Buffer): Promise<PreflightResult> {
  const parser = new PDFParse({ data: pdfBuffer });

  try {
    const textResult = await parser.getText();
    const parsedPages: PageTextLayer[] = textResult.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text ?? "",
      normalizedText: normalizeNorwegianText(page.text ?? ""),
      lines: buildEmbeddedTextLines(page.text ?? ""),
      hasEmbeddedText: Boolean(stripDuplicateWhitespace(page.text ?? "")),
    }));

    const pagesWithText = parsedPages.filter((page) => page.hasEmbeddedText);
    const averageTextLength =
      pagesWithText.length > 0
        ? pagesWithText.reduce((sum, page) => sum + page.text.length, 0) / pagesWithText.length
        : 0;

    return {
      pageCount: textResult.total,
      hasTextLayer: pagesWithText.length > 0,
      hasReliableTextLayer: pagesWithText.length > 0 && averageTextLength >= 120,
      parsedPages,
    };
  } finally {
    await parser.destroy();
  }
}
