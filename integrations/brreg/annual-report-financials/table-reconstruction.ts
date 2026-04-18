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

function isHeaderOrNoiseLine(line: string, classification: PageClassification) {
  const normalized = normalizeRowLabel(line);
  if (!normalized) {
    return true;
  }

  if (classification.heading && normalized === normalizeRowLabel(classification.heading)) {
    return true;
  }

  if (/^(20\d{2}\s*){1,3}$/.test(line.trim())) {
    return true;
  }

  if (
    normalized.includes("belop i") ||
    normalized.includes("alle tall") ||
    normalized.includes("note ") ||
    normalized.includes("regnskapsprinsipper")
  ) {
    return true;
  }

  return false;
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

function tokenizeLine(page: PageTextLayer, lineIndex: number) {
  const line = page.lines[lineIndex];
  if (!line) {
    return [];
  }

  if (line.words.length > 0) {
    return line.words.map((word) => ({
      token: word.text.trim(),
      x: word.x,
    }));
  }

  return line.text
    .split(/\s{2,}|\t+|\s+/)
    .filter(Boolean)
    .map((token, tokenIndex) => ({
      token,
      x: tokenIndex * 100,
    }));
}

function buildRowsForPage(page: PageTextLayer, classification: PageClassification) {
  if (
    classification.type === "AUDITOR_REPORT" ||
    classification.type === "BOARD_REPORT" ||
    classification.type === "COVER"
  ) {
    return [] as ReconstructedRow[];
  }

  const rows: ReconstructedRow[] = [];

  for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex += 1) {
    const line = page.lines[lineIndex];
    if (!line || isHeaderOrNoiseLine(line.text, classification)) {
      continue;
    }

    const tokens = tokenizeLine(page, lineIndex)
      .map((item) => item.token)
      .filter(Boolean);
    const numericIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter((candidate) => isNumericToken(candidate.token));

    if (numericIndexes.length === 0) {
      continue;
    }

    const firstNumericIndex = numericIndexes[0]?.index ?? -1;
    if (firstNumericIndex <= 0) {
      continue;
    }

    const noteReference = inferNoteReference(tokens, firstNumericIndex);
    const labelTokens = tokens.slice(0, noteReference ? firstNumericIndex - 1 : firstNumericIndex);
    const label = stripDuplicateWhitespace(labelTokens.join(" "));
    const normalizedLabel = normalizeRowLabel(label);

    if (!normalizedLabel || normalizedLabel.length < 3) {
      continue;
    }

    const values = numericIndexes
      .slice(-Math.max(2, classification.yearHeaderYears.length || 2))
      .map(({ token, index }, valueIndex) => ({
        value: parseFinancialInteger(token),
        columnIndex: valueIndex,
        x: line.words[index]?.x ?? line.x + valueIndex * 100,
      }))
      .filter((cell): cell is { value: number; columnIndex: number; x: number } => cell.value !== null);

    if (values.length === 0) {
      continue;
    }

    rows.push({
      pageNumber: page.pageNumber,
      sectionType: classification.type,
      unitScale: classification.unitScale ?? 1,
      label,
      normalizedLabel,
      noteReference,
      rowText: line.text,
      y: line.y,
      confidence: Math.max(0.25, Math.min(0.995, line.confidence)),
      values,
    });
  }

  return rows;
}

export function reconstructStatementRows(
  pages: PageTextLayer[],
  classifications: PageClassification[],
) {
  const classificationByPage = new Map(
    classifications.map((classification) => [classification.pageNumber, classification]),
  );

  return pages
    .flatMap((page) => {
      const classification = classificationByPage.get(page.pageNumber);
      return classification ? buildRowsForPage(page, classification) : [];
    })
    .sort((left, right) => left.pageNumber - right.pageNumber || left.y - right.y);
}
