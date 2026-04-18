import {
  PageClassification,
  PageTextLayer,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  normalizeRowLabel,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
  stripDuplicateWhitespace,
} from "@/integrations/brreg/annual-report-financials/text";

function isNumericToken(token: string) {
  return /^[(\-]?\d[\d\s.,)]*-?$/.test(token.trim());
}

function isHeaderOrNoiseLine(line: string, classification: PageClassification) {
  const repaired = repairOcrTokenBoundaries(line);
  const normalized = normalizeRowLabel(repaired);
  if (!normalized) {
    return true;
  }

  if (classification.heading && normalized === normalizeRowLabel(classification.heading)) {
    return true;
  }

  if (/^(20\d{2}\s*){1,4}$/.test(repaired.trim())) {
    return true;
  }

  if (
    normalized.includes("belop i") ||
    normalized.includes("alle tall") ||
    normalized.includes("regnskapsprinsipper") ||
    normalized.includes("org nr") ||
    normalized.includes("organisasjonsnummer") ||
    normalized.startsWith("side ") ||
    /^[-_=]{3,}$/.test(repaired.trim())
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

  const mergedCandidate = tokens[firstNumericIndex]?.trim() ?? "";
  const mergedMatch = mergedCandidate.match(/^(\d{1,2})([-(].*)$/);
  if (mergedMatch) {
    return mergedMatch[1];
  }

  return null;
}

function splitMergedTokens(token: string) {
  return repairOcrTokenBoundaries(token)
    .split(/\s+/)
    .flatMap((part) => part.split(/(?<=\))(?=\d)|(?<=[A-Za-z])(?=\d)|(?<=\d)(?=[A-Za-z(])/))
    .filter(Boolean);
}

function tokenizeLine(page: PageTextLayer, lineIndex: number) {
  const line = page.lines[lineIndex];
  if (!line) {
    return [];
  }

  if (line.words.length > 0) {
    return line.words.flatMap((word) =>
      splitMergedTokens(word.text.trim()).map((token, tokenIndex) => ({
        token,
        x: word.x + tokenIndex * 12,
      })),
    );
  }

  return line.text
    .split(/\s{2,}|\t+|\s+/)
    .filter(Boolean)
    .flatMap((token, tokenIndex) =>
      splitMergedTokens(token).map((part, partIndex) => ({
        token: part,
        x: tokenIndex * 100 + partIndex * 12,
      })),
    );
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
      .filter((token) => token !== "-" && token !== "_");
    const numericIndexes = tokens
      .map((token, index) => ({ token, index }))
      .filter((candidate) => isNumericToken(candidate.token));

    if (numericIndexes.length === 0) {
      continue;
    }

    let firstValueNumericIndex = numericIndexes[0]?.index ?? -1;
    let labelStartIndex = 0;
    let noteReference: string | null = null;

    if (classification.type === "NOTE") {
      const firstToken = tokens[0]?.trim() ?? "";
      const secondToken = tokens[1]?.trim() ?? "";
      const mergedNoteMatch = firstToken.match(/^note\s*(\d{1,2})$/i);

      if (/^note$/i.test(firstToken) && /^\d{1,2}$/.test(secondToken)) {
        noteReference = secondToken;
        labelStartIndex = 2;
        firstValueNumericIndex =
          numericIndexes.find((candidate) => candidate.index > labelStartIndex)?.index ?? -1;
      } else if (mergedNoteMatch) {
        noteReference = mergedNoteMatch[1];
        labelStartIndex = 1;
        firstValueNumericIndex =
          numericIndexes.find((candidate) => candidate.index >= labelStartIndex)?.index ?? -1;
      }
    }

    if (firstValueNumericIndex <= labelStartIndex) {
      continue;
    }

    if (!noteReference) {
      noteReference = inferNoteReference(tokens, firstValueNumericIndex);
    }

    const labelEndIndex =
      noteReference && labelStartIndex === 0 ? firstValueNumericIndex - 1 : firstValueNumericIndex;
    const labelTokens = tokens.slice(labelStartIndex, labelEndIndex);
    const label = stripDuplicateWhitespace(labelTokens.join(" "));
    const normalizedLabel = normalizeRowLabel(label);

    if (!normalizedLabel || normalizedLabel.length < 3) {
      continue;
    }

    const valueSlots = Math.max(2, classification.yearHeaderYears.length || 2);
    const values = numericIndexes
      .filter((candidate) => candidate.index >= firstValueNumericIndex)
      .slice(-valueSlots)
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
