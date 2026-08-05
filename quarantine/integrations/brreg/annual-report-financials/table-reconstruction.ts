import { toAnnualReportParsedPages } from "@/integrations/brreg/annual-report-financials/page-model";
import {
  normalizeRowLabel,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
  stripDuplicateWhitespace,
} from "@/lib/norwegian-text";
import {
  AnnualReportParsedInputPage,
  AnnualReportParsedPage,
  AnnualReportTableRow,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

function isNumericToken(token: string) {
  return /^[(\-]?\d[\d\s.,)]*-?$/.test(token.trim());
}

/**
 * Detects a liability sub-section heading ("Langsiktig gjeld" / "Kortsiktig
 * gjeld") so the reconstructor can tag the rows that follow. Used to route
 * maturity-split components (e.g. "Gjeld til kredittinstitusjoner", which
 * appears under BOTH sections) to the correct canonical key. Returns null for
 * lines that aren't a maturity heading (so the running context is preserved).
 */
function detectLiabilitySection(text: string): "LONG_TERM" | "CURRENT" | null {
  const normalized = normalizeRowLabel(text);
  if (!normalized) return null;
  if (normalized.includes("langsiktig gjeld")) return "LONG_TERM";
  if (normalized.includes("kortsiktig gjeld")) return "CURRENT";
  return null;
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

function mergeThousandGroupTokens(items: Array<{ token: string; x: number }>) {
  type MergeRecord = {
    token: string;
    x: number;
    sourceTokens?: string[]; // original digit-group tokens that formed this merged token
    sourceStart?: number; // index in `items` of the leading source token
  };

  const result: MergeRecord[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    // Merge up to 4 consecutive groups (covers up to 999,999,999,999 = ~1
    // trillion NOK — sufficient for the largest Norwegian holdings such as
    // Canica AS where konsern totals reach ~17 billion NOK = 11 digits = 4
    // groups). Previously capped at 3 groups, which truncated 10+ digit
    // values like "12 860 898 352" into "12860898" + "352", causing
    // total_equity to be read as 639 (a stray trailing token) instead of
    // 12,860,898,352.
    //
    // The 4-group ceiling is deliberate: going to 5 over-merges adjacent
    // year-value sequences such as "3 086 817 561 099 629 184" into one
    // 13-digit number ("3086817561099") rather than the correct year1
    // "3 086 817 561" + year2 "99 629 184" split.
    if (/^-?\d{1,3}$/.test(item.token)) {
      let j = i + 1;
      let merged = item.token;
      const sourceTokens: string[] = [item.token];
      while (j < items.length && j - i < 4 && /^\d{3}$/.test(items[j]!.token)) {
        merged += items[j]!.token;
        sourceTokens.push(items[j]!.token);
        j++;
      }
      if (j > i + 1) {
        result.push({ token: merged, x: item.x, sourceTokens, sourceStart: i });
        i = j;
        continue;
      }
    }
    result.push({ token: item.token, x: item.x });
    i++;
  }

  // Post-process: rebalance fat (≥ 12 digit) merged tokens that are
  // actually two fused year values. This happens when the original token
  // sequence is all 3-digit groups, so limit-4 greedy fills its 4-token
  // budget on the first number ("826 794 725 256" → "826794725256")
  // leaving the remainder as a tiny year-2 ("729 264" → "729264"). The
  // diagnostic signal is a 12+ digit leading token. We recover the
  // original digit-group tokens and apply a balanced-split partition
  // that minimises the digit-count gap between the two halves.
  //
  // The post-process is intentionally narrow: it only fires when the
  // FAT token has source-token metadata AND the partition produces two
  // halves whose imbalance is strictly less than (12 - merged_second_digits).
  // This means we never replace a well-balanced two-token greedy result
  // with a worse re-split.
  for (let k = 0; k < result.length; k++) {
    const rec = result[k]!;
    const recDigits = rec.token.replace(/-/g, "").length;
    if (recDigits < 12) continue;
    if (!rec.sourceTokens || rec.sourceTokens.length < 4) continue;

    // Combine this fat token's source tokens with any following adjacent
    // merged numeric tokens that are themselves digit groups — together
    // they form the full original numeric sequence to rebalance.
    const adjacentMergedIndexes: number[] = [k];
    const combinedSourceTokens: string[] = [...rec.sourceTokens];
    let cursor = k + 1;
    while (cursor < result.length) {
      const next = result[cursor]!;
      if (!next.sourceTokens || next.sourceTokens.length === 0) break;
      // Only fold in if it is contiguous in the original source stream.
      const prev = result[cursor - 1]!;
      if (
        prev.sourceStart === undefined ||
        next.sourceStart === undefined ||
        next.sourceStart !== prev.sourceStart + (prev.sourceTokens?.length ?? 0)
      ) {
        break;
      }
      adjacentMergedIndexes.push(cursor);
      combinedSourceTokens.push(...next.sourceTokens);
      cursor++;
    }
    if (combinedSourceTokens.length < 4) continue;

    const partition = balancedPartition(combinedSourceTokens);
    if (partition === null || partition.length < 2) continue;

    // Only adopt the rebalance when the result is more balanced than the
    // current greedy output for the same source range. Current imbalance:
    // |digits(fat) - sum of trailing merged digits|.
    const currentDigitCounts = adjacentMergedIndexes.map((idx) =>
      result[idx]!.token.replace(/-/g, "").length,
    );
    const currentImbalance = Math.abs(
      currentDigitCounts[0]! - currentDigitCounts.slice(1).reduce((s, d) => s + d, 0),
    );
    const newDigitCounts = partition.map((g) => g.reduce((s, t) => s + t.replace(/-/g, "").length, 0));
    const newImbalance =
      newDigitCounts.length === 1
        ? newDigitCounts[0]!
        : Math.abs(newDigitCounts[0]! - newDigitCounts.slice(1).reduce((s, d) => s + d, 0));
    if (newImbalance >= currentImbalance) continue;

    // Replace the adjacent merged records with the rebalanced partition.
    const baseX = rec.x;
    const replacement: MergeRecord[] = partition.map((group, idx) => ({
      token: group.join(""),
      x: baseX + idx * 12,
    }));
    result.splice(adjacentMergedIndexes[0]!, adjacentMergedIndexes.length, ...replacement);
    // Step past the replacements; outer-loop k will advance.
    k = adjacentMergedIndexes[0]! + replacement.length - 1;
  }

  return result.map(({ token, x }) => ({ token, x }));
}

function tokenizeLine(page: AnnualReportParsedPage, lineIndex: number) {
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

function inferStructuredNoteReference(row: AnnualReportTableRow) {
  const noteCell = row.cells.find((cell) => cell.role === "note");
  if (noteCell && /^\d{1,2}$/.test(noteCell.text.trim())) {
    return noteCell.text.trim();
  }

  const merged = row.text.match(/\bnote\s*(\d{1,2})\b/i);
  return merged?.[1] ?? null;
}

function isStructuredHeaderRow(row: AnnualReportTableRow) {
  const years = row.cells
    .map((cell) => cell.text.match(/\b20\d{2}\b/g) ?? [])
    .flat();
  const numericValues = row.cells.filter((cell) => cell.numericValue !== null);
  return years.length >= 2 && numericValues.length === years.length;
}

function isValidLeadingNumberToken(token: string): boolean {
  return /^-?\d{1,3}$/.test(token);
}

/**
 * Returns true if `tokens` form one valid Norwegian financial number:
 * a 1-3 digit (optionally negative) leading group followed by zero or
 * more exactly-3-digit groups.
 */
function isValidNumberTokenSeq(tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  if (!isValidLeadingNumberToken(tokens[0]!)) return false;
  for (let i = 1; i < tokens.length; i++) {
    if (!/^\d{3}$/.test(tokens[i]!)) return false;
  }
  return true;
}

function digitCount(tokens: string[]): number {
  let count = 0;
  for (const token of tokens) count += token.replace(/-/g, "").length;
  return count;
}

/**
 * Partition a flat token list of raw digit-groups into the most-balanced
 * pair (or triple) of valid financial numbers. Used when greedy merging
 * cannot find a natural break — i.e. when every token after the leading
 * one is also 3 digits, leaving no "1-2 digit boundary" to split on.
 *
 * Strategy:
 *   1. Try every split position from 1 to length-1 and keep candidates
 *      where both halves are individually valid financial numbers. Score
 *      each by |digits(left) - digits(right)| and pick the smallest
 *      (most-balanced) split. Year values within a single row are
 *      usually within an order of magnitude of each other, so a balanced
 *      digit count is the best non-contextual signal.
 *   2. If the token list starts with a 1-2 digit standalone token, also
 *      try peeling it as a note and balanced-splitting the remainder.
 *      Keep the (note, year1, year2) result when both halves are valid
 *      and remain balanced.
 *
 * Returns null when no valid partition exists (caller should fall back
 * to greedy).
 */
function balancedPartition(tokens: string[]): string[][] | null {
  if (tokens.length < 2) return tokens.length === 1 ? [tokens] : null;

  let bestPair: { left: string[]; right: string[]; imbalance: number } | null =
    null;
  for (let split = 1; split < tokens.length; split++) {
    const left = tokens.slice(0, split);
    const right = tokens.slice(split);
    if (!isValidNumberTokenSeq(left) || !isValidNumberTokenSeq(right)) continue;
    const imbalance = Math.abs(digitCount(left) - digitCount(right));
    if (bestPair === null || imbalance < bestPair.imbalance) {
      bestPair = { left, right, imbalance };
    }
  }

  // Try note-peel + balanced split of rest.
  if (tokens.length >= 4 && /^\d{1,2}$/.test(tokens[0]!)) {
    const rest = tokens.slice(1);
    let bestRestPair: { left: string[]; right: string[]; imbalance: number } | null =
      null;
    for (let split = 1; split < rest.length; split++) {
      const left = rest.slice(0, split);
      const right = rest.slice(split);
      if (!isValidNumberTokenSeq(left) || !isValidNumberTokenSeq(right)) continue;
      const imbalance = Math.abs(digitCount(left) - digitCount(right));
      if (bestRestPair === null || imbalance < bestRestPair.imbalance) {
        bestRestPair = { left, right, imbalance };
      }
    }
    if (
      bestRestPair !== null &&
      // Only prefer note-peel when the rest split is at least as balanced
      // as the no-peel split. Otherwise, the leading token is more likely
      // a millions-digit of year1 than an actual note reference.
      (bestPair === null || bestRestPair.imbalance < bestPair.imbalance)
    ) {
      return [[tokens[0]!], bestRestPair.left, bestRestPair.right];
    }
  }

  return bestPair === null ? null : [bestPair.left, bestPair.right];
}

/**
 * Re-derive a row's financial values from its raw text. Docling's hybrid
 * backend frequently splits a single Norwegian-formatted number across
 * several numeric cells — "51 110 434 61 557 749" on page 6 of CANICA AS
 * 2024 came back as cells {note=51, value=110, value=434, value=61557}
 * with the trailing "749" dropped entirely. The structural cell role
 * cannot be trusted in those cases, but `row.text` preserves the original
 * token sequence, so we tokenize it and apply a two-stage partition:
 *
 *   1. Greedy merge (limit 4 groups, see mergeThousandGroupTokens). Works
 *      cleanly when adjacent year values are separated by a 1-2 digit
 *      leading token of year2 (e.g. "12 860 898 352 12 364 195 639" →
 *      [12860898352, 12364195639]).
 *
 *   2. Balanced halve fallback. When greedy fuses every token into one
 *      fat number (all groups are exactly 3 digits, so no break point
 *      exists), pick the split that minimises the digit-count difference
 *      between the two halves. This recovers cases like
 *      "826 794 725 256 729 264" → [826794725, 256729264] and
 *      "3 086 817 561 099 629 184" → [3086817561, 99629184].
 *
 * The trailing N values (N = expected year columns, normally 2) are
 * returned. Any leading note/reference numbers identified during
 * balanced halve are excluded from the returned values — they remain in
 * the row's audit trail via row.text.
 */
function reparseRowValuesFromText(
  rowText: string,
  valueSlots: number,
): Array<{ value: number; columnIndex: number; x: number }> {
  const tokens = rowText
    .split(/\s+/)
    .filter(Boolean)
    .map((token, index) => ({ token, x: index * 12 }));
  const merged = mergeThousandGroupTokens(tokens);

  // Locate the trailing run of numeric tokens — that's where the year
  // values sit. Anything before is label.
  const trailingNumericIndexes: number[] = [];
  for (let i = merged.length - 1; i >= 0; i--) {
    if (/^-?\d[\d.,]*$/.test(merged[i]!.token)) {
      trailingNumericIndexes.unshift(i);
    } else if (trailingNumericIndexes.length > 0) {
      break; // hit a label token after numerics; stop
    }
  }
  if (trailingNumericIndexes.length === 0) return [];

  let numericTokens = trailingNumericIndexes.map((i) => merged[i]!);

  // Balanced halve fallback: limit-4 greedy fuses year1 and year2 into a
  // single 12-digit leading token whenever the original raw token sequence
  // is all-3-digit groups (so greedy never finds a "stop" boundary). The
  // most common form is 6 raw 3-digit groups (e.g. "826 794 725 256 729
  // 264") where limit-4 takes the first 4 ("826,794,725,256" = 12 digits)
  // and dumps the remainder ("729 264" = 6 digits) into a tiny second
  // value. A 12+ digit leading number is implausible for any Norwegian
  // line item (would be tens of trillions of NOK) so it's a reliable
  // signal of fusion. Re-tokenise from the raw text and apply a
  // balanced-split partition that minimises the digit-count gap.
  const firstDigits =
    numericTokens.length >= 1 ? digitCount([numericTokens[0]!.token]) : 0;
  if (
    numericTokens.length >= 1 &&
    numericTokens.length <= 2 &&
    firstDigits >= 12
  ) {
    const rawTokens = rowText.split(/\s+/).filter(Boolean);
    // Locate the trailing run of digit-group tokens that fed the fused
    // numeric token. Walk back from the end while tokens are 1-3 digits.
    let firstNumericIndex = rawTokens.length;
    for (let i = rawTokens.length - 1; i >= 0; i--) {
      if (/^-?\d{1,3}$/.test(rawTokens[i]!)) {
        firstNumericIndex = i;
      } else if (firstNumericIndex < rawTokens.length) {
        break;
      }
    }
    if (firstNumericIndex < rawTokens.length) {
      const tail = rawTokens.slice(firstNumericIndex);
      const groups = balancedPartition(tail);
      if (groups !== null && groups.length >= 1) {
        const baseX = merged[trailingNumericIndexes[0]!]!.x;
        numericTokens = groups.map((group, idx) => ({
          token: group.join(""),
          x: baseX + idx * 100,
        }));
      }
    }
  }

  return numericTokens
    .slice(-valueSlots)
    .map(({ token, x }, index) => {
      const value = parseFinancialInteger(token);
      return value === null ? null : { value, columnIndex: index, x };
    })
    .filter(
      (cell): cell is { value: number; columnIndex: number; x: number } =>
        cell !== null,
    );
}

function buildRowsFromStructuredTables(
  page: AnnualReportParsedPage,
  classification: PageClassification,
) {
  const rows: ReconstructedRow[] = [];
  let liabilitySection: "LONG_TERM" | "CURRENT" | null = null;

  for (const table of page.tables) {
    for (const row of table.rows) {
      // Update maturity context from heading rows before they're skipped.
      const detected = detectLiabilitySection(row.text);
      if (detected) liabilitySection = detected;

      if (isStructuredHeaderRow(row) || isHeaderOrNoiseLine(row.text, classification)) {
        continue;
      }

      const labelCells = row.cells.filter((cell) =>
        ["label", "text"].includes(cell.role),
      );
      const numericCells = row.cells.filter((cell) => cell.numericValue !== null);
      if (labelCells.length === 0 || numericCells.length === 0) {
        // No numeric cells. Rescue a labeled row as 0 when an explicit dash
        // ("-"/"–"/"—") nil marker appears in any cell — a genuinely empty
        // row (section header) is left out.
        const hasZeroMarker = row.cells.some((cell) => /^[-–—_]$/.test(cell.text.trim()));
        if (labelCells.length > 0 && hasZeroMarker) {
          const nilLabel = stripDuplicateWhitespace(labelCells.map((cell) => cell.text).join(" "));
          const nilNormalized = normalizeRowLabel(nilLabel);
          if (nilNormalized && nilNormalized.length >= 3) {
            rows.push({
              pageNumber: page.pageNumber,
              sectionType: classification.type,
              unitScale: classification.unitScale ?? 1,
              label: nilLabel,
              normalizedLabel: nilNormalized,
              noteReference: inferStructuredNoteReference(row),
              rowText: row.text,
              y: row.bbox?.top ?? 0,
              confidence: 0.96,
              values: [{ value: 0, columnIndex: 0, x: 0 }],
              liabilitySection,
            });
          }
        }
        continue;
      }

      const label = stripDuplicateWhitespace(labelCells.map((cell) => cell.text).join(" "));
      const normalizedLabel = normalizeRowLabel(label);
      if (!normalizedLabel || normalizedLabel.length < 3) {
        continue;
      }

      // Detect over-split numeric cells. A Norwegian statement row almost
      // always carries 2 year values (and optionally a note) — so more than
      // 3 numeric cells, or any numeric cell that fails to round-trip into
      // an integer ≥ 1 (a single stray digit group), is a strong signal
      // that Docling's table parser shattered a "211 739 845"-style value
      // across multiple value cells. In that case the row.text re-parse
      // produces correct numbers; the cell view does not.
      const valueSlots = Math.max(2, classification.yearHeaderYears.length || 2);
      const cellsLookOverSplit =
        numericCells.length > valueSlots + 1 || // > note + year1 + year2
        numericCells.some((cell) => {
          const raw = cell.text.replace(/\s+/g, "");
          return raw.length > 0 && raw.length < 3 && cell !== numericCells[0];
        });

      let values: Array<{ value: number; columnIndex: number; x: number }>;
      if (cellsLookOverSplit) {
        const reparsed = reparseRowValuesFromText(row.text, valueSlots);
        if (reparsed.length >= 1) {
          values = reparsed;
        } else {
          values = numericCells.map((cell, index) => ({
            value: cell.numericValue!,
            columnIndex: index,
            x: cell.bbox?.left ?? index * 100,
          }));
        }
      } else {
        values = numericCells.map((cell, index) => ({
          value: cell.numericValue!,
          columnIndex: index,
          x: cell.bbox?.left ?? index * 100,
        }));
      }

      rows.push({
        pageNumber: page.pageNumber,
        sectionType: classification.type,
        unitScale: classification.unitScale ?? 1,
        label,
        normalizedLabel,
        noteReference: inferStructuredNoteReference(row),
        rowText: row.text,
        y: row.bbox?.top ?? 0,
        confidence: 0.96,
        values,
        liabilitySection,
      });
    }
  }

  return rows;
}

function buildRowsFromLegacyLines(
  page: AnnualReportParsedPage,
  classification: PageClassification,
) {
  const rows: ReconstructedRow[] = [];
  // Running liability sub-section context, updated by "Langsiktig/Kortsiktig
  // gjeld" headers as we read top-to-bottom. Tagged onto each row so the
  // canonical mapper can route maturity-split components correctly.
  let liabilitySection: "LONG_TERM" | "CURRENT" | null = null;

  for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex += 1) {
    const line = page.lines[lineIndex];
    if (!line) continue;

    // Update maturity context even for value-less heading lines (which are
    // skipped below as noise/empty) — that's exactly where the headers live.
    const detectedSection = detectLiabilitySection(line.text);
    if (detectedSection) liabilitySection = detectedSection;

    if (isHeaderOrNoiseLine(line.text, classification)) {
      continue;
    }

    const rawTokenItems = mergeThousandGroupTokens(tokenizeLine(page, lineIndex));
    // A standalone dash ("-", "–", "—") or underscore in the amount column is
    // the Norwegian accounting convention for a nil/zero value. Detect it
    // BEFORE filtering dashes out so a "label + dash" line can be rescued as 0
    // instead of being dropped as a value-less row.
    const hasZeroMarker = rawTokenItems.some((item) => /^[-–—_]$/.test(item.token.trim()));
    const tokenItems = rawTokenItems.filter(
      (item) => !/^[-–—_]$/.test(item.token.trim()),
    );
    const tokens = tokenItems.map((item) => item.token);
    const numericIndexes = tokenItems
      .map((item, index) => ({ token: item.token, index, x: item.x }))
      .filter((candidate) => isNumericToken(candidate.token));

    if (numericIndexes.length === 0) {
      // No real numbers. Only rescue the row when there is an explicit zero
      // marker (dash) — a genuinely empty line is a section header
      // ("Inntekter", "Anleggsmidler") and must NOT become 0.
      if (hasZeroMarker) {
        const label = stripDuplicateWhitespace(tokens.join(" "));
        const normalizedLabel = normalizeRowLabel(label);
        if (normalizedLabel && normalizedLabel.length >= 3) {
          rows.push({
            pageNumber: page.pageNumber,
            sectionType: classification.type,
            unitScale: classification.unitScale ?? 1,
            label,
            normalizedLabel,
            noteReference: inferNoteReference(tokens, tokens.length),
            rowText: line.text,
            y: line.y,
            confidence: Math.max(0.25, Math.min(0.995, line.confidence)),
            values: [{ value: 0, columnIndex: 0, x: 0 }],
            liabilitySection,
          });
        }
      }
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
      .map(({ token, x }, valueIndex) => ({
        value: parseFinancialInteger(token),
        columnIndex: valueIndex,
        x,
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
      liabilitySection,
    });
  }

  return rows;
}

function buildRowsForPage(page: AnnualReportParsedPage, classification: PageClassification) {
  if (
    classification.type === "AUDITOR_REPORT" ||
    classification.type === "BOARD_REPORT" ||
    classification.type === "COVER"
  ) {
    return [] as ReconstructedRow[];
  }

  if (page.tables.length > 0) {
    return buildRowsFromStructuredTables(page, classification);
  }

  return buildRowsFromLegacyLines(page, classification);
}

export function reconstructStatementRows(
  pages: AnnualReportParsedInputPage[],
  classifications: PageClassification[],
) {
  const normalizedPages = toAnnualReportParsedPages(pages);
  const classificationByPage = new Map(
    classifications.map((classification) => [classification.pageNumber, classification]),
  );

  return normalizedPages
    .flatMap((page) => {
      const classification = classificationByPage.get(page.pageNumber);
      return classification ? buildRowsForPage(page, classification) : [];
    })
    .sort((left, right) => left.pageNumber - right.pageNumber || left.y - right.y);
}
