import type {
  AnnualReportParsedInputPage,
  PageClassification,
} from "@/integrations/brreg/annual-report-financials/types";

const MAX_CONTEXT_CHARS = 1200;
const MAX_TOP_LINES = 12;
const MAX_ROW_LABELS = 24;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripNumericTokens(value: string) {
  return normalizeWhitespace(
    value
      .replace(/\b20\d{2}\b/g, " ")
      .replace(/[-+]?[\d\s.,]+/g, " ")
      .replace(/\b(?:nok|kr|tnok)\b/gi, " "),
  );
}

function uniqueCapped(values: string[], max: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

function rowLabelCandidates(page: AnnualReportParsedInputPage) {
  return page.lines
    .filter((line) => /[a-z]{4,}/.test(line.normalizedText) && /\d/.test(line.text))
    .map((line) => stripNumericTokens(line.text))
    .filter((line) => line.length >= 3);
}

/**
 * Builds the same kind of page-level text that the unit-scale model is trained
 * on: page/scope/section metadata, top-of-page unit declarations, and row
 * labels. The row extractor still owns numeric extraction; this text only
 * helps the unit-scale model resolve the page multiplier.
 */
export function buildUnitScalePredictionText(input: {
  page: AnnualReportParsedInputPage;
  classification: PageClassification;
}) {
  const topLines = input.page.lines
    .slice(0, MAX_TOP_LINES)
    .map((line) => line.text)
    .filter((line) => line.trim().length > 0);
  const labels = uniqueCapped(rowLabelCandidates(input.page), MAX_ROW_LABELS);

  const parts = [
    `page=${input.page.pageNumber}`,
    `scope=${input.classification.statementScope}`,
    `section=${input.classification.type}`,
    ...topLines,
    ...labels,
  ];

  return normalizeWhitespace(parts.join(" | ")).slice(0, MAX_CONTEXT_CHARS);
}
