import {
  PageClassification,
  PageTextLayer,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  normalizeRowLabel,
  parseFinancialInteger,
  stripDuplicateWhitespace,
} from "@/integrations/brreg/annual-report-financials/text";

function isNumericToken(token: string) {
  return /^-?\d[\d\s.]*$/.test(token.trim());
}

function inferNoteReference(tokens: string[], firstNumericIndex: number) {
  if (firstNumericIndex <= 0) {
    return null;
  }

  const noteCandidate = tokens[firstNumericIndex - 1]?.trim() ?? "";
  if (/^\d{1,2}$/.test(noteCandidate)) {
    return noteCandidate;
  }

  return null;
}

function buildRowsForPage(page: PageTextLayer, classification: PageClassification) {
  if (
    classification.type === "AUDITOR_REPORT" ||
    classification.type === "BOARD_REPORT" ||
    classification.type === "COVER"
  ) {
    return [] as ReconstructedRow[];
  }

  return page.lines
    .map((line) => {
      const tokens = line.text.split(/\s{2,}|\t+/).flatMap((part) => part.split(/\s+/)).filter(Boolean);
      const numericIndexes = tokens
        .map((token, index) => ({ token, index }))
        .filter((candidate) => isNumericToken(candidate.token));

      if (numericIndexes.length === 0) {
        return null;
      }

      const firstNumericIndex = numericIndexes[0]?.index ?? -1;
      if (firstNumericIndex <= 0) {
        return null;
      }

      const noteReference = inferNoteReference(tokens, firstNumericIndex);
      const labelTokens = tokens.slice(0, noteReference ? firstNumericIndex - 1 : firstNumericIndex);
      const label = stripDuplicateWhitespace(labelTokens.join(" "));
      const normalizedLabel = normalizeRowLabel(label);

      if (!normalizedLabel || normalizedLabel.length < 3) {
        return null;
      }

      const values = numericIndexes
        .slice(-2)
        .map(({ token }, valueIndex) => ({
          value: parseFinancialInteger(token),
          columnIndex: valueIndex,
          x: line.x + valueIndex * 100,
        }))
        .filter((cell): cell is { value: number; columnIndex: number; x: number } => cell.value !== null);

      if (values.length === 0) {
        return null;
      }

      return {
        pageNumber: page.pageNumber,
        sectionType: classification.type,
        unitScale: classification.unitScale ?? 1,
        label,
        normalizedLabel,
        noteReference,
        rowText: line.text,
        y: line.y,
        confidence: Math.max(0.2, Math.min(0.99, line.confidence)),
        values,
      } satisfies ReconstructedRow;
    })
    .filter((row): row is ReconstructedRow => row !== null);
}

export function reconstructStatementRows(
  pages: PageTextLayer[],
  classifications: PageClassification[],
) {
  const classificationByPage = new Map(classifications.map((classification) => [classification.pageNumber, classification]));

  return pages
    .flatMap((page) => {
      const classification = classificationByPage.get(page.pageNumber);
      return classification ? buildRowsForPage(page, classification) : [];
    })
    .sort((left, right) => left.pageNumber - right.pageNumber || left.y - right.y);
}
