import { toAnnualReportParsedPages } from "@/integrations/brreg/annual-report-financials/page-model";
import {
  normalizeNorwegianText,
  normalizeRowLabel,
  parseFinancialInteger,
  repairOcrTokenBoundaries,
  stripDuplicateWhitespace,
} from "@/integrations/brreg/annual-report-financials/text";
import {
  AnnualReportParsedInputPage,
  AnnualReportParsedPage,
  ExtractedLine,
  PageClassification,
  ReconstructedRow,
  ReconstructedValueCell,
} from "@/integrations/brreg/annual-report-financials/types";
import type { LiabilitySection } from "@/integrations/brreg/annual-report-financials/taxonomy";

// ─────────────────────────────────────────────────────────────────────────
// Geometry-first reconstruction
//
// The reconstruction branch of the self-correcting loop. The default
// reconstruction (buildRowsFromLegacyLines + partitionNumericTokens) blends
// position with combinatorial content heuristics — and ~40 % of rows on a
// scanned filing came out "ambiguous" (the Canica diagnostics). When a page
// is diagnosed as reconstruction-weak yet recognition is good (page-confidence
// "reconstruction"), the loop calls this branch instead.
//
// The idea is to trust geometry alone:
//   1. Find the year-header line and read each year's x-coordinate as a
//      column anchor.
//   2. For every data row below, assign each numeric token to the column
//      whose anchor is nearest in x.
//   3. Tokens that land in the same column on the same row concatenate
//      left-to-right into a single value — that is how "1 234 567" was
//      printed and how it should be rebuilt. No partition search.
//
// This requires real word geometry. OCR pages have it (Tesseract word
// boxes). Embedded-text and engines that emit lines without per-word
// positions fall through: this branch returns no rows for such pages and
// the loop must keep the default reconstruction for them.
// ─────────────────────────────────────────────────────────────────────────

export type ColumnAnchor = { year: number; x: number };

/**
 * Convenience wrapper: returns the column anchors that
 * `reconstructStatementRowsGeometryFirst` would use for the given page, or
 * an empty array when no anchors can be detected. Callers that want to
 * thread anchors across a sequence of pages (e.g. inherit from a parent
 * statement page to its continuation) read the anchors of the parent with
 * this helper, then pass them as `inheritedAnchors` to the continuation
 * call.
 */
export function detectYearColumnAnchorsForPage(
  inputPage: AnnualReportParsedInputPage,
): ColumnAnchor[] {
  const [page] = toAnnualReportParsedPages([inputPage]);
  if (!page) return [];
  return findYearColumnAnchors(page);
}

const NUMERIC_TOKEN_RE = /^[(\-]?\d[\d\s.,)]*-?$/;
const YEAR_TOKEN_RE = /^20\d{2}$/;
const YEAR_IN_TEXT_RE = /\b20\d{2}\b/;
const PERIOD_YEAR_IN_TEXT_RE = /\b(?:31[./-]12[./-]?)(\d{2})\b/;
const TRUNCATED_20XX_YEAR_RE = /^0(\d{2})$/;

function isNumericToken(token: string): boolean {
  return NUMERIC_TOKEN_RE.test(token.trim());
}

type PositionedToken = { token: string; x: number; rightX: number };
type NumberCluster = { tokens: PositionedToken[]; rightX: number };

function extractYearFromHeaderToken(token: string): number | null {
  const fullYear = token.match(YEAR_IN_TEXT_RE)?.[0];
  if (fullYear) return Number(fullYear);

  const periodYear = token.match(PERIOD_YEAR_IN_TEXT_RE)?.[1];
  if (periodYear) return 2000 + Number(periodYear);

  const truncated = token.match(TRUNCATED_20XX_YEAR_RE)?.[1];
  if (truncated) return 2000 + Number(truncated);

  return null;
}

function tokensWithPositions(line: ExtractedLine): PositionedToken[] {
  if (line.words.length === 0) {
    // No per-word geometry. Geometry-first cannot do useful work here.
    return [];
  }
  const result: PositionedToken[] = [];
  for (const word of line.words) {
    const repaired = repairOcrTokenBoundaries(word.text);
    const parts = repaired.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      result.push({ token: parts[0]!, x: word.x, rightX: word.x + word.width });
      continue;
    }
    // A word that repaired into multiple tokens: distribute them across the
    // word's bounding box so each gets a distinct x (and right edge).
    const step = Math.max(1, Math.floor(word.width / parts.length));
    for (let i = 0; i < parts.length; i++) {
      result.push({ token: parts[i]!, x: word.x + i * step, rightX: word.x + (i + 1) * step });
    }
  }
  return result;
}

/**
 * Scans the top of the page for a line containing two or more 4-digit years
 * and returns each year together with the x-coordinate of its word box.
 * Returns the empty list when no such header is found or word geometry is
 * missing.
 */
function findYearColumnAnchors(page: AnnualReportParsedPage): ColumnAnchor[] {
  const topLines = page.lines.slice(0, Math.min(15, page.lines.length));

  // First pass: a single line containing ≥ 2 years — the normal case where
  // the year header survived OCR as one block ("Beløp i NOK Note 2024 2023").
  for (const line of topLines) {
    const anchors: ColumnAnchor[] = [];
    for (const word of line.words) {
      const year = extractYearFromHeaderToken(word.text);
      if (year) {
        anchors.push({ year, x: word.x });
      }
    }
    if (anchors.length >= 2) {
      return anchors.sort((a, b) => a.x - b.x);
    }
  }

  // Second pass: years split across multiple lines at the same y position.
  // This is common with Docling output for tightly-spaced statement
  // headers — page 6 of CANICA AS 2024 emits the year header as a
  // `heading` block "Beløp i NOK Note 2024" PLUS a separate `paragraph`
  // block holding only "2023", both at the same y in the source PDF. The
  // single-line scan above can't see both years on any one line, so we
  // group year tokens by y-bucket (±4 px tolerance for sub-pixel OCR
  // jitter) and accept the topmost bucket containing ≥ 2 distinct years.
  const Y_BUCKET_TOLERANCE = 4;
  type YearWord = { year: number; x: number; y: number };
  const candidates: YearWord[] = [];
  for (const line of topLines) {
    for (const word of line.words) {
      const year = extractYearFromHeaderToken(word.text);
      if (year) {
        candidates.push({ year, x: word.x, y: line.y });
      }
    }
  }

  // Iterate sorted by descending y so the topmost header bucket wins —
  // year headers always sit above their data rows.
  candidates.sort((a, b) => b.y - a.y);
  for (let i = 0; i < candidates.length; i++) {
    const seed = candidates[i]!;
    const bucket: YearWord[] = [seed];
    for (let j = i + 1; j < candidates.length; j++) {
      if (Math.abs(candidates[j]!.y - seed.y) <= Y_BUCKET_TOLERANCE) {
        bucket.push(candidates[j]!);
      }
    }
    const distinctYears = new Set(bucket.map((b) => b.year));
    if (distinctYears.size >= 2) {
      // Use the leftmost x per distinct year (in case OCR emitted the
      // year twice — once in the heading, once duplicated elsewhere).
      const byYear = new Map<number, number>();
      for (const yw of bucket) {
        const existing = byYear.get(yw.year);
        if (existing === undefined || yw.x < existing) {
          byYear.set(yw.year, yw.x);
        }
      }
      const anchors: ColumnAnchor[] = Array.from(byYear, ([year, x]) => ({ year, x }));
      return anchors.sort((a, b) => a.x - b.x);
    }
  }

  return [];
}

function nearestColumnIndex(x: number, anchors: ColumnAnchor[]): number {
  let bestIndex = 0;
  let bestDistance = Math.abs(x - anchors[0]!.x);
  for (let i = 1; i < anchors.length; i++) {
    const distance = Math.abs(x - anchors[i]!.x);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

const NOTE_HEADER_RE = /^note(r|nr)?\.?$/i;

/**
 * Finds the x-position of the "Note" column header, if present. Brønnøysund
 * statements print a note-reference column ("Note") between the row labels and
 * the year value columns. Its single-digit references (e.g. "2", "3") sit at
 * the same x as the header and would otherwise be bucketed into the first year
 * column — fusing the note number onto the front of the value (note "2" +
 * 3398713005 → 23398713005). Returns null when no note header is found.
 */
function findNoteColumnX(page: AnnualReportParsedPage): number | null {
  const topLines = page.lines.slice(0, Math.min(15, page.lines.length));
  for (const line of topLines) {
    for (const word of line.words) {
      if (NOTE_HEADER_RE.test(word.text.trim())) {
        return word.x;
      }
    }
  }
  return null;
}

/**
 * True when a token at position x belongs to the note-reference column rather
 * than a year value column: it is closer to the note-header x than to the
 * nearest year anchor. Only applies to short tokens (1–2 digit note refs);
 * a genuine multi-digit value sitting near the note column is not dropped.
 */
function isNoteReferenceToken(
  token: { token: string; x: number },
  noteColumnX: number | null,
  anchors: ColumnAnchor[],
): boolean {
  if (noteColumnX === null) return false;
  const digits = token.token.replace(/\D/g, "");
  if (digits.length > 2) return false; // note refs are 1–2 digits
  const distToNote = Math.abs(token.x - noteColumnX);
  let distToNearestYear = Infinity;
  for (const anchor of anchors) {
    distToNearestYear = Math.min(distToNearestYear, Math.abs(token.x - anchor.x));
  }
  return distToNote < distToNearestYear;
}

function digitText(token: string): string {
  return token.replace(/\D/g, "");
}

function isGroupedFinancialNumber(tokens: PositionedToken[]): boolean {
  if (tokens.length === 0) return false;
  const groups = tokens.map((token) => digitText(token.token));
  const [first, ...rest] = groups;
  if (!first || first.length < 1 || first.length > 3) return false;
  return rest.every((group) => group.length === 3);
}

function tokenGap(left: NumberCluster, right: NumberCluster): number {
  const firstRightToken = right.tokens[0];
  return firstRightToken ? firstRightToken.x - left.rightX : Infinity;
}

/**
 * Rejoins thousands groups that OCR separated into multiple geometry clusters.
 * The first value column is the vulnerable case: a leading 1-2 digit group can
 * sit in the gap between the label/note area and the first year anchor. If the
 * gap to the next group is slightly wider than the normal intra-number
 * threshold, the old logic dropped the leading group as note-zone noise and
 * read "12 560 000" as "560000". This pass is conservative: it only joins
 * adjacent clusters when their combined tokens are still a valid Norwegian
 * grouped integer and their right edge belongs to the same year column.
 */
function rejoinSplitNumberClusters(
  clusters: NumberCluster[],
  anchors: ColumnAnchor[],
  columnSpacing: number,
): NumberCluster[] {
  if (clusters.length < 2 || !Number.isFinite(columnSpacing)) return clusters;

  const maxRepairGap = Math.max(80, columnSpacing * 0.35);
  const repaired: NumberCluster[] = [];

  let i = 0;
  while (i < clusters.length) {
    let current: NumberCluster = {
      tokens: [...clusters[i]!.tokens],
      rightX: clusters[i]!.rightX,
    };
    let j = i + 1;

    while (j < clusters.length) {
      const next = clusters[j]!;
      const gap = tokenGap(current, next);
      if (gap < 0 || gap > maxRepairGap) break;

      const combined: NumberCluster = {
        tokens: [...current.tokens, ...next.tokens],
        rightX: Math.max(current.rightX, next.rightX),
      };
      if (!isGroupedFinancialNumber(combined.tokens)) break;

      const currentColumn = nearestColumnIndex(current.rightX, anchors);
      const combinedColumn = nearestColumnIndex(combined.rightX, anchors);
      if (currentColumn !== combinedColumn) break;

      current = combined;
      j++;
    }

    repaired.push(current);
    i = j;
  }

  return repaired;
}

type TextParsedValue = ReconstructedValueCell & { score: number };

function numericRunToken(token: string): boolean {
  return /^[(\-]?\d[\d.,)]*-?$/.test(token.trim());
}

function groupDigitCounts(tokens: string[]): number[] {
  return tokens.map((token) => token.replace(/\D/g, "").length);
}

function isWellFormedNorwegianGroupedNumber(tokens: string[]): boolean {
  const digitCounts = groupDigitCounts(tokens);
  if (digitCounts.length === 0) return false;
  if (digitCounts[0]! < 1 || digitCounts[0]! > 3) return false;
  return digitCounts.slice(1).every((digits) => digits === 3);
}

function partitionGroupedTail(
  tokens: string[],
  slots: number,
): Array<{ groups: string[][]; score: number }> {
  if (slots <= 0 || tokens.length < slots) return [];

  const results: Array<{ groups: string[][]; score: number }> = [];

  function visit(start: number, slot: number, groups: string[][]) {
    if (slot === slots) {
      if (start === tokens.length) {
        let score = 0;
        for (const group of groups) {
          const parsed = parseFinancialInteger(group.join(" "));
          if (parsed === null) return;
          const digits = group.join("").replace(/\D/g, "").length;
          if (digits === 0) return;
          if (isWellFormedNorwegianGroupedNumber(group)) score += group.length > 1 ? 8 : 3;
          if (group.length === 1 && digits <= 2) score -= 4;
          score += Math.min(digits, 12) / 3;
        }
        const digitCounts = groups.map((group) => group.join("").replace(/\D/g, "").length);
        const imbalance = Math.max(...digitCounts) - Math.min(...digitCounts);
        score -= imbalance * 0.15;
        results.push({ groups, score });
      }
      return;
    }

    const remainingSlots = slots - slot - 1;
    const maxEnd = tokens.length - remainingSlots;
    for (let end = start + 1; end <= maxEnd; end++) {
      const group = tokens.slice(start, end);
      if (!isWellFormedNorwegianGroupedNumber(group)) continue;
      visit(end, slot + 1, [...groups, group]);
    }
  }

  visit(0, 0, []);
  return results;
}

function digitCountForGroup(group: string[]): number {
  return group.join("").replace(/\D/g, "").length;
}

function looksLikeInferredLeadingNoteSkip(groups: string[][]): boolean {
  if (groups.length < 2) return false;
  const firstGroupFirstDigits = groups[0]?.[0]?.replace(/\D/g, "") ?? "";
  if (firstGroupFirstDigits.startsWith("0")) return false;
  const digitCounts = groups.map(digitCountForGroup);
  const first = digitCounts[0] ?? 0;
  const rest = digitCounts.slice(1);
  if (first < 3 || rest.length === 0) return false;
  const maxRest = Math.max(...rest);
  const minRest = Math.min(...rest);

  // A skipped note reference should leave current/prior-year values with
  // the same magnitude. If skipping would make the first year smaller than the
  // comparative year, the skipped token was probably a genuine leading
  // thousands group (e.g. "7 345 508 000").
  return first === minRest && first === maxRest;
}

function repairMissingLeadingOneAfterNote(
  skippedTokens: string[],
  groups: string[][],
): string[][] | null {
  const skippedLooksLikeTwoDigitNote =
    skippedTokens.length > 0 &&
    skippedTokens.every((token) => token.replace(/\D/g, "").length === 2);
  if (!skippedLooksLikeTwoDigitNote || groups.length < 2) return null;
  const allGroupsStartWithZero = groups.every((group) => {
    const firstDigits = group[0]?.replace(/\D/g, "") ?? "";
    return firstDigits.length === 3 && firstDigits.startsWith("0");
  });
  if (!allGroupsStartWithZero) return null;
  return groups.map((group) => ["1", ...group]);
}

function parseSingleGroupedValueTail(tokens: string[]): TextParsedValue | null {
  if (tokens.length !== 3) return null;
  if (!isWellFormedNorwegianGroupedNumber(tokens)) return null;
  const value = parseFinancialInteger(tokens.join(" "));
  if (value === null) return null;
  return { value, columnIndex: 0, x: 0, score: 40 };
}

function scoreGroupedValues(groups: string[][]) {
  let score = 0;
  for (const group of groups) {
    const parsed = parseFinancialInteger(group.join(" "));
    if (parsed === null) return null;
    const digits = digitCountForGroup(group);
    if (digits === 0) return null;
    if (isWellFormedNorwegianGroupedNumber(group)) score += group.length > 1 ? 8 : 3;
    if (group.length === 1 && digits <= 2) score -= 4;
    score += Math.min(digits, 12) / 3;
  }
  const digitCounts = groups.map(digitCountForGroup);
  const imbalance = Math.max(...digitCounts) - Math.min(...digitCounts);
  score -= imbalance * 0.15;
  return score;
}

function reparseGroupedValuesFromRowText(
  rowText: string,
  valueSlots: number,
  preferredLeadingSkip = 0,
  allowMissingLeadingOneAfterNote = false,
): TextParsedValue[] {
  const rawTokens = repairOcrTokenBoundaries(rowText).split(/\s+/).filter(Boolean);
  const tail: string[] = [];
  for (let i = rawTokens.length - 1; i >= 0; i--) {
    const token = rawTokens[i]!;
    if (numericRunToken(token)) {
      tail.unshift(token);
      continue;
    }
    if (tail.length > 0) break;
  }
  if (tail.length < valueSlots) return [];

  let best: { groups: string[][]; score: number } | null = null;
  const maxSkip = Math.min(2, Math.max(0, tail.length - valueSlots));
  for (let skip = 0; skip <= maxSkip; skip++) {
    const skipped = tail.slice(0, skip);
    const skipLooksLikeNote = skipped.every((token) => token.replace(/\D/g, "").length <= 2);
    if (skip > 0 && !skipLooksLikeNote) continue;

    for (const candidate of partitionGroupedTail(tail.slice(skip), valueSlots)) {
      const preferredSkipBonus =
        preferredLeadingSkip > 0 ? (skip === preferredLeadingSkip ? 10 : -10) : 0;
      const inferredSkippedTokenLengths = skipped.map((token) => token.replace(/\D/g, "").length);
      const repairedMissingOneGroups = allowMissingLeadingOneAfterNote
        ? repairMissingLeadingOneAfterNote(skipped, candidate.groups)
        : null;
      const repairedMissingOneScore =
        repairedMissingOneGroups === null ? null : scoreGroupedValues(repairedMissingOneGroups);
      const groups =
        repairedMissingOneGroups !== null && repairedMissingOneScore !== null
          ? repairedMissingOneGroups
          : candidate.groups;
      const inferredNoteSkipBonus =
        preferredLeadingSkip === 0 &&
        skip > 0 &&
        skipLooksLikeNote &&
        inferredSkippedTokenLengths.every((length) => length === 2) &&
        looksLikeInferredLeadingNoteSkip(candidate.groups)
          ? 18
          : 0;
      const repairedMissingOneBonus =
        repairedMissingOneGroups !== null && repairedMissingOneScore !== null ? 24 : 0;
      const score =
        (repairedMissingOneScore ?? candidate.score) -
        skip * 1.25 +
        preferredSkipBonus +
        inferredNoteSkipBonus +
        repairedMissingOneBonus;
      if (best === null || score > best.score) {
        best = { groups, score };
      }
    }
  }
  if (best === null) return [];

  const values = best.groups
    .map((group, columnIndex) => {
      const value = parseFinancialInteger(group.join(" "));
      if (value === null) return null;
      return { value, columnIndex, x: columnIndex * 100, score: best.score };
    })
    .filter((cell): cell is TextParsedValue => cell !== null);

  let bestSingle: TextParsedValue | null = null;
  for (let skip = 0; skip <= Math.min(2, Math.max(0, tail.length - 3)); skip++) {
    const skipped = tail.slice(0, skip);
    const skipLooksLikeNote = skipped.every((token) => token.replace(/\D/g, "").length <= 2);
    if (skip > 0 && !skipLooksLikeNote) continue;
    const single = parseSingleGroupedValueTail(tail.slice(skip));
    if (!single) continue;
    const score = single.score - skip;
    if (!bestSingle || score > bestSingle.score) {
      bestSingle = { ...single, score };
    }
  }

  if (bestSingle && bestSingle.score > best.score) {
    return [bestSingle];
  }

  return values;
}

function shouldPreferTextParsedValues(
  geometryValues: ReconstructedValueCell[],
  textValues: TextParsedValue[],
): boolean {
  if (geometryValues.length === 0 && textValues.length > 0) return true;
  if (textValues.length === 1 && geometryValues.length >= 2) {
    const textDigits = Math.abs(textValues[0]!.value).toString();
    const geometryDigits = [...geometryValues]
      .sort((left, right) => left.columnIndex - right.columnIndex)
      .map((value, index) => {
        const digits = Math.abs(value.value).toString();
        return index === 0 && value.value < 0 ? `-${digits}` : digits;
      })
      .join("")
      .replace(/^-/, "");
    return geometryDigits === textDigits;
  }
  if (textValues.length < 2) return false;
  if (geometryValues.length !== textValues.length) return true;

  let restoredMagnitude = false;
  let removedLeadingNoteReference = false;
  for (const textValue of textValues) {
    const geometryValue = geometryValues.find((value) => value.columnIndex === textValue.columnIndex);
    if (!geometryValue) return true;
    const geometryDigits = Math.abs(geometryValue.value).toString().length;
    const textDigits = Math.abs(textValue.value).toString().length;
    if (textDigits >= geometryDigits + 2) {
      restoredMagnitude = true;
    }
    const geometryDigitText = Math.abs(geometryValue.value).toString();
    const textDigitText = Math.abs(textValue.value).toString();
    const leadingDigits = geometryDigitText.slice(0, geometryDigitText.length - textDigitText.length);
    if (
      geometryDigits > textDigits &&
      geometryDigits <= textDigits + 2 &&
      geometryDigitText.endsWith(textDigitText) &&
      /^[1-9]\d?$/.test(leadingDigits)
    ) {
      removedLeadingNoteReference = true;
    }
  }

  return restoredMagnitude || removedLeadingNoteReference;
}

function countStrictLeadingNoteReferences(
  numericTokensIncludingNotes: PositionedToken[],
  noteColumnX: number | null,
): number {
  if (noteColumnX === null) return 0;
  let count = 0;
  for (const token of [...numericTokensIncludingNotes].sort((a, b) => a.x - b.x)) {
    const digits = token.token.replace(/\D/g, "");
    if (digits.length > 0 && digits.length <= 2 && Math.abs(token.x - noteColumnX) <= 35) {
      count++;
      continue;
    }
    break;
  }
  return count;
}

// Bare statement section headers (normalized). These sit above their rows as
// label-only lines but are NOT part of any row's label, so they must never be
// merged into a wrapped-label fragment. A genuine wrap fragment ("Sum
// finansielle") is multi-word and not in this set, so it still merges.
const SECTION_HEADER_WORDS = new Set([
  "inntekter",
  "driftsinntekter",
  "driftskostnader",
  "kostnader",
  "finansinntekter",
  "finanskostnader",
  "eiendeler",
  "anleggsmidler",
  "immaterielle eiendeler",
  "varige driftsmidler",
  "finansielle anleggsmidler",
  "omlopsmidler",
  "omløpsmidler",
  "fordringer",
  "investeringer",
  "egenkapital",
  "innskutt egenkapital",
  "opptjent egenkapital",
  "gjeld",
  "kortsiktig gjeld",
  "langsiktig gjeld",
  "avsetning for forpliktelser",
]);

/**
 * Re-groups OCR lines that belong to the same printed row. Tesseract's layout
 * analysis sometimes fragments a statement row into MANY one-token "lines"
 * (NORGESGRUPPEN p3: "Utsatt skattefordel" and each numeric group "11", "118",
 * "972", "000" came back as seven separate lines, all at the same y). The
 * reconstruction walks lines one at a time, so each fragment became its own
 * bogus row ("sum omløpsmidler" -> 3911) and the entire page was lost. The
 * fragments share their printed row's y-coordinate, so lines whose vertical
 * midpoints sit within ~60 % of the line height are re-merged into one logical
 * row before reconstruction. Statement rows are pitched well over one line
 * height apart (~54 px pitch vs ~34 px height on the Brønnøysund forms), so
 * distinct rows never merge.
 */
function mergeLinesByVerticalOverlap(lines: ExtractedLine[]): ExtractedLine[] {
  const sorted = [...lines].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x,
  );
  const groups: ExtractedLine[][] = [];
  for (const line of sorted) {
    const group = groups[groups.length - 1];
    if (group) {
      const groupMid =
        group.reduce((sum, l) => sum + l.y + l.height / 2, 0) / group.length;
      const tolerance =
        Math.max(...group.map((l) => l.height), line.height) * 0.6;
      if (Math.abs(line.y + line.height / 2 - groupMid) <= tolerance) {
        group.push(line);
        continue;
      }
    }
    groups.push([line]);
  }
  return groups.map((group) => {
    if (group.length === 1) return group[0]!;
    const byX = [...group].sort((a, b) => a.x - b.x);
    const words = group.flatMap((l) => l.words).sort((a, b) => a.x - b.x);
    const text = stripDuplicateWhitespace(byX.map((l) => l.text).join(" "));
    const x = Math.min(...group.map((l) => l.x));
    const y = Math.min(...group.map((l) => l.y));
    const right = Math.max(...group.map((l) => l.x + l.width));
    const bottom = Math.max(...group.map((l) => l.y + l.height));
    return {
      text,
      normalizedText: normalizeNorwegianText(text),
      x,
      y,
      width: right - x,
      height: bottom - y,
      confidence:
        group.reduce((sum, l) => sum + l.confidence, 0) / group.length,
      words,
    };
  });
}

function isNoiseLine(text: string): boolean {
  const normalized = normalizeRowLabel(repairOcrTokenBoundaries(text));
  if (!normalized) return true;
  if (
    normalized.includes("belop i") ||
    normalized.includes("alle tall") ||
    normalized.includes("organisasjonsnummer") ||
    normalized.includes("organisasjonsnr") ||
    normalized.includes("regnskapsprinsipper") ||
    normalized.startsWith("side ")
  ) {
    return true;
  }
  // A line that is just years (e.g. a repeated header).
  if (/^(20\d{2}\s*){1,4}$/.test(text.trim())) return true;
  return false;
}

function detectLiabilitySection(text: string): LiabilitySection | null {
  const normalized = normalizeRowLabel(text);
  if (!normalized) return null;
  if (normalized.includes("langsiktig gjeld")) return "LONG_TERM";
  if (normalized.includes("kortsiktig gjeld")) return "CURRENT";
  return null;
}

function valueByColumn(row: ReconstructedRow, columnIndex: number): number | null {
  return row.values.find((value) => value.columnIndex === columnIndex)?.value ?? null;
}

function repairProvisionSubtotalRows(rows: ReconstructedRow[]): ReconstructedRow[] {
  return rows.map((row, index) => {
    if (!row.normalizedLabel.includes("sum avsetninger for forpliktelser")) {
      return row;
    }

    const addends: ReconstructedRow[] = [];
    for (let cursor = index - 1; cursor >= 0 && addends.length < 4; cursor--) {
      const candidate = rows[cursor]!;
      if (candidate.pageNumber !== row.pageNumber) break;
      if (candidate.normalizedLabel.startsWith("sum ")) break;
      if (
        candidate.normalizedLabel.includes("egenkapital") ||
        candidate.normalizedLabel.includes("langsiktig gjeld") ||
        candidate.normalizedLabel.includes("kortsiktig gjeld")
      ) {
        break;
      }
      addends.unshift(candidate);
    }

    if (addends.length < 2) return row;

    let changed = false;
    const repairedValues = row.values.map((value) => {
      const parts = addends
        .map((addend) => valueByColumn(addend, value.columnIndex))
        .filter((part): part is number => part !== null);
      if (parts.length !== addends.length) return value;

      const expected = parts.reduce((sum, part) => sum + part, 0);
      const currentDigits = Math.abs(value.value).toString();
      const expectedDigits = Math.abs(expected).toString();
      if (
        expected > value.value &&
        expectedDigits.length > currentDigits.length &&
        expectedDigits.endsWith(currentDigits)
      ) {
        changed = true;
        return { ...value, value: expected };
      }
      return value;
    });

    return changed ? { ...row, values: repairedValues } : row;
  });
}

function rowReconciliationKey(row: ReconstructedRow) {
  return [
    row.pageNumber,
    row.sectionType,
    row.liabilitySection ?? "",
    row.normalizedLabel,
  ].join("|");
}

function rowValueSignature(row: ReconstructedRow) {
  return row.values
    .map((value) => `${value.columnIndex}:${value.value}`)
    .sort()
    .join("|");
}

function hasSamePageValues(rows: ReconstructedRow[], row: ReconstructedRow) {
  const signature = rowValueSignature(row);
  if (!signature) return false;
  return rows.some(
    (candidate) =>
      candidate.pageNumber === row.pageNumber &&
      rowValueSignature(candidate) === signature,
  );
}

function valueMap(row: ReconstructedRow) {
  return new Map(row.values.map((value) => [value.columnIndex, value.value]));
}

function isPlausibleLargerRepair(current: number, candidate: number) {
  if (candidate <= current || current <= 0) return false;
  if (candidate > current * 25) return false;
  const currentDigits = String(Math.abs(current));
  const candidateDigits = String(Math.abs(candidate));
  return (
    candidateDigits.endsWith(currentDigits) ||
    candidateDigits.slice(-Math.min(9, currentDigits.length)) ===
      currentDigits.slice(-Math.min(9, currentDigits.length))
  );
}

function digitHammingDistance(left: string, right: string) {
  if (left.length !== right.length) return Infinity;
  let distance = 0;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function isPlausibleSingleDigitRepair(current: number, candidate: number) {
  if (candidate <= 0 || current <= 0) return false;
  const currentDigits = String(Math.abs(current));
  const candidateDigits = String(Math.abs(candidate));
  if (currentDigits.length < 6 || currentDigits.length !== candidateDigits.length) return false;
  return digitHammingDistance(currentDigits, candidateDigits) === 1;
}

function hasImplausibleMagnitude(row: ReconstructedRow) {
  return row.values.some((value) => Math.abs(value.value) > 100_000_000_000_000);
}

function rowHasBetterValues(candidate: ReconstructedRow, current: ReconstructedRow) {
  if (candidate.values.length > current.values.length) return true;
  if (candidate.values.length < current.values.length) return false;

  const candidateValues = valueMap(candidate);
  const currentValues = valueMap(current);
  let repairedMagnitude = false;
  for (const [columnIndex, candidateValue] of candidateValues) {
    const currentValue = currentValues.get(columnIndex);
    if (currentValue === undefined) continue;
    if (candidateValue === currentValue) continue;
    if (isPlausibleLargerRepair(currentValue, candidateValue)) {
      repairedMagnitude = true;
      continue;
    }
    if (isPlausibleSingleDigitRepair(currentValue, candidateValue)) {
      repairedMagnitude = true;
      continue;
    }
    if (isPlausibleLargerRepair(candidateValue, currentValue)) {
      return false;
    }
  }
  return repairedMagnitude;
}

function withColumnValue(row: ReconstructedRow, columnIndex: number, value: number) {
  const values = [...row.values];
  const existingIndex = values.findIndex((cell) => cell.columnIndex === columnIndex);
  if (existingIndex >= 0) {
    values[existingIndex] = { ...values[existingIndex]!, value };
  } else {
    values.push({ value, columnIndex, x: columnIndex * 100 });
  }
  values.sort((left, right) => left.columnIndex - right.columnIndex);
  return { ...row, values };
}

function replaceRow(rows: ReconstructedRow[], target: ReconstructedRow, replacement: ReconstructedRow) {
  const index = rows.indexOf(target);
  if (index === -1) return rows;
  const copy = [...rows];
  copy[index] = replacement;
  return copy;
}

function normalizedIncludes(row: ReconstructedRow, needle: string) {
  return row.normalizedLabel.includes(needle);
}

function findLiabilityRow(rows: ReconstructedRow[], predicate: (row: ReconstructedRow) => boolean) {
  return rows.find((row) => row.values.length > 0 && predicate(row)) ?? null;
}

function repairDifferenceRow(input: {
  rows: ReconstructedRow[];
  target: ReconstructedRow | null;
  minuend: ReconstructedRow | null;
  subtrahend: ReconstructedRow | null;
}) {
  if (!input.target || !input.minuend || !input.subtrahend) return input.rows;
  let target = input.target;
  let changed = false;
  for (const value of input.minuend.values) {
    const subtract = valueByColumn(input.subtrahend, value.columnIndex);
    const current = valueByColumn(target, value.columnIndex);
    if (subtract === null || current === null) continue;
    const expected = value.value - subtract;
    if (expected <= 0) continue;
    if (expected === current) continue;
    if (
      expected > current &&
      (isPlausibleLargerRepair(current, expected) || expected >= current * 1.1)
    ) {
      target = withColumnValue(target, value.columnIndex, expected);
      changed = true;
    }
  }
  return changed ? replaceRow(input.rows, input.target, target) : input.rows;
}

function candidateRepairsForSubtotal(value: number, subtotal: number) {
  const candidates = new Set<number>([value]);
  if (value <= 0 || subtotal <= value) return [...candidates];
  const digits = String(Math.abs(value));
  const leadingGroupLength = digits.length % 3 || 3;

  if (digits.length % 3 === 0) {
    const magnitude = 10 ** digits.length;
    for (let leading = 1; leading <= 9; leading++) {
      const candidate = leading * magnitude + value;
      if (candidate > value && candidate <= subtotal) candidates.add(candidate);
    }
  }

  if (leadingGroupLength < 3) {
    const currentLeading = Number(digits.slice(0, leadingGroupLength));
    const rest = digits.slice(leadingGroupLength);
    if (currentLeading === 1) {
      for (let leading = currentLeading + 1; leading <= 9; leading++) {
        const candidate = Number(`${leading}${rest}`);
        if (candidate > value && candidate <= subtotal) candidates.add(candidate);
      }
    }
  }

  return [...candidates].sort((left, right) => left - right);
}

function repairComponentsToSubtotal(rows: ReconstructedRow[], subtotal: ReconstructedRow | null, components: ReconstructedRow[]) {
  if (!subtotal || components.length < 2) return rows;
  let repairedRows = rows;
  const working = new Map<ReconstructedRow, Map<number, number>>(
    components.map((row) => [row, valueMap(row)]),
  );
  const subtotalValues = valueMap(subtotal);
  const columnIndexes = [...subtotalValues.keys()].sort((left, right) => left - right);

  for (const columnIndex of columnIndexes) {
    const subtotalValue = subtotalValues.get(columnIndex);
    if (subtotalValue === undefined) continue;
    const currentValues = components.map((row) => working.get(row)?.get(columnIndex) ?? null);
    if (!currentValues.every((value): value is number => value !== null)) continue;
    const currentSum = currentValues.reduce((sum, value) => sum + value, 0);
    if (currentSum === subtotalValue) continue;
    if (currentSum > subtotalValue) continue;

    const candidateSets = components.map((row, index) => {
      const current = currentValues[index]!;
      return candidateRepairsForSubtotal(current, subtotalValue);
    });
    let bestValues: number[] | null = null;
    let bestScore = Infinity;

    function visit(index: number, selected: number[]) {
      if (index === candidateSets.length) {
        const sum = selected.reduce((acc, value) => acc + value, 0);
        if (sum !== subtotalValue) return;
        let score = 0;
        for (let i = 0; i < selected.length; i++) {
          const row = components[i]!;
          const original = currentValues[i]!;
          const value = selected[i]!;
          if (value !== original) score += 1;
          const referenceColumn = columnIndex === 0 ? 1 : 0;
          const reference = working.get(row)?.get(referenceColumn);
          if (reference && reference > 0 && value > 0) {
            score += Math.abs(Math.log(value / reference));
          }
        }
        if (score < bestScore) {
          bestValues = selected;
          bestScore = score;
        }
        return;
      }
      for (const candidate of candidateSets[index]!) {
        visit(index + 1, [...selected, candidate]);
      }
    }

    visit(0, []);
    if (!bestValues) continue;
    for (let index = 0; index < components.length; index++) {
      working.get(components[index]!)?.set(columnIndex, bestValues[index]!);
    }
  }

  for (const row of components) {
    let replacement = row;
    const values = working.get(row);
    if (!values) continue;
    for (const [columnIndex, value] of values) {
      if (valueByColumn(replacement, columnIndex) !== value) {
        replacement = withColumnValue(replacement, columnIndex, value);
      }
    }
    if (replacement !== row) {
      repairedRows = replaceRow(repairedRows, row, replacement);
    }
  }

  return repairedRows;
}

function repairLiabilityRowsByEquations(rows: ReconstructedRow[]): ReconstructedRow[] {
  let repaired = [...rows];
  const pages = new Set(repaired.map((row) => row.pageNumber));

  for (const pageNumber of pages) {
    const pageRows = () => repaired.filter((row) => row.pageNumber === pageNumber);
    const sumGjeld = () =>
      findLiabilityRow(pageRows(), (row) => row.normalizedLabel === "sum gjeld");
    const sumKortsiktig = () =>
      findLiabilityRow(pageRows(), (row) => row.normalizedLabel === "sum kortsiktig gjeld");
    const sumLangsiktig = () =>
      findLiabilityRow(pageRows(), (row) => row.normalizedLabel === "sum langsiktig gjeld");
    const sumAvsetninger = () =>
      findLiabilityRow(pageRows(), (row) =>
        normalizedIncludes(row, "sum avsetninger for forpliktelser"),
      );
    const sumAnnenLangsiktig = () =>
      findLiabilityRow(pageRows(), (row) => row.normalizedLabel === "sum annen langsiktig gjeld");

    repaired = repairDifferenceRow({
      rows: repaired,
      target: sumKortsiktig(),
      minuend: sumGjeld(),
      subtrahend: sumLangsiktig(),
    });
    repaired = repairDifferenceRow({
      rows: repaired,
      target: sumLangsiktig(),
      minuend: sumGjeld(),
      subtrahend: sumKortsiktig(),
    });
    repaired = repairDifferenceRow({
      rows: repaired,
      target: sumAnnenLangsiktig(),
      minuend: sumLangsiktig(),
      subtrahend: sumAvsetninger(),
    });

    const longComponents = pageRows().filter(
      (row) =>
        row.liabilitySection === "LONG_TERM" &&
        !row.normalizedLabel.startsWith("sum ") &&
        (normalizedIncludes(row, "interest-bearing debt") ||
          normalizedIncludes(row, "other non-current liabilities")),
    );
    repaired = repairComponentsToSubtotal(repaired, sumAnnenLangsiktig(), longComponents);

    const currentComponents = pageRows().filter(
      (row) =>
        row.liabilitySection === "CURRENT" &&
        !row.normalizedLabel.startsWith("sum ") &&
        (normalizedIncludes(row, "interest-bearing debt") ||
          normalizedIncludes(row, "leverand") ||
          normalizedIncludes(row, "tax payable") ||
          normalizedIncludes(row, "tax pav") ||
          normalizedIncludes(row, "betalbar skatt") ||
          normalizedIncludes(row, "other current liabilities")),
    );
    repaired = repairComponentsToSubtotal(repaired, sumKortsiktig(), currentComponents);
  }

  return repaired;
}

export function reconcileStatementRowsAcrossOcrScales(
  primaryRows: ReconstructedRow[],
  secondaryRows: ReconstructedRow[],
): ReconstructedRow[] {
  const selected = [...secondaryRows];
  const selectedByKey = new Map(selected.map((row) => [rowReconciliationKey(row), row]));

  for (const primary of primaryRows) {
    if (hasImplausibleMagnitude(primary)) continue;
    if (hasSamePageValues(selected, primary)) continue;
    const key = rowReconciliationKey(primary);
    const current = selectedByKey.get(key);
    if (!current) {
      selected.push(primary);
      selectedByKey.set(key, primary);
      continue;
    }
    if (rowHasBetterValues(primary, current)) {
      const index = selected.indexOf(current);
      if (index >= 0) selected[index] = primary;
      selectedByKey.set(key, primary);
    }
  }

  return repairLiabilityRowsByEquations(
    selected.sort((left, right) => left.pageNumber - right.pageNumber || left.y - right.y),
  );
}

/**
 * Rebuilds the rows of a single statement page using year-column anchors and
 * x-distance assignment. Returns the empty list when geometry is unavailable
 * or no year header is detected — the loop should keep the default
 * reconstruction for the page in that case.
 *
 * Accepts an optional `inheritedAnchors` fallback for CONTINUATION pages
 * that legitimately lack a year header of their own (e.g. balance-sheet
 * "egenkapital og gjeld" pages whose header lives on the previous
 * "eiendeler" page). When the page has no detectable header but the
 * caller knows the geometry from a preceding page, the inherited anchors
 * are used so the reconstruction can still proceed.
 */
export function reconstructStatementRowsGeometryFirst(
  inputPage: AnnualReportParsedInputPage,
  classification: PageClassification,
  inheritedAnchors?: ColumnAnchor[],
): ReconstructedRow[] {
  if (
    classification.type === "AUDITOR_REPORT" ||
    classification.type === "BOARD_REPORT" ||
    classification.type === "COVER"
  ) {
    return [];
  }

  const [rawPage] = toAnnualReportParsedPages([inputPage]);
  if (!rawPage) return [];
  const page: AnnualReportParsedPage = {
    ...rawPage,
    lines: mergeLinesByVerticalOverlap(rawPage.lines),
  };

  let anchors = findYearColumnAnchors(page);
  if (anchors.length < 2 && inheritedAnchors && inheritedAnchors.length >= 2) {
    anchors = inheritedAnchors;
  }
  if (anchors.length < 2) return [];

  const yearHeaderIndex = page.lines.findIndex((line) =>
    line.words.some((word) => YEAR_IN_TEXT_RE.test(word.text)),
  );

  // The note-reference column, if the statement has one. Note references are
  // single-digit tokens at this x; excluding them prevents the note number from
  // fusing onto the front of the first year value.
  const noteColumnX = findNoteColumnX(page);

  const rows: ReconstructedRow[] = [];

  // Wrapped-label fragments from preceding label-only lines. Brønnøysund forms
  // wrap long labels, and OCR emits the wrap as its own line with the value on
  // the LAST line — "Sum finansielle" / "anleggsmidler  12 328 727 170". Without
  // re-joining, the value row is labelled just "anleggsmidler" and won't match
  // its registry alias ("sum finansielle anleggsmidler"). We remember each
  // label-only line and prepend the fragment(s) directly above a value line.
  let pendingLabel: Array<{ text: string; y: number; height: number }> = [];
  let liabilitySection: LiabilitySection | null = null;

  for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex++) {
    if (lineIndex === yearHeaderIndex) {
      pendingLabel = [];
      continue;
    }
    const line = page.lines[lineIndex]!;
    if (isNoiseLine(line.text)) {
      pendingLabel = [];
      continue;
    }
    const detectedLiabilitySection = detectLiabilitySection(line.text);
    if (detectedLiabilitySection) {
      liabilitySection = detectedLiabilitySection;
    }

    const tokens = tokensWithPositions(line);
    if (tokens.length === 0) {
      pendingLabel = [];
      continue;
    }

    // Drop year-shaped tokens (fiscal-year references) and note-reference
    // tokens — neither is a statement value, and both would otherwise be
    // column-assigned and fused into a value.
    const numericTokensIncludingNotes = tokens.filter(
      (t) => isNumericToken(t.token) && !YEAR_TOKEN_RE.test(t.token),
    );
    const numericTokens = numericTokensIncludingNotes.filter(
      (t) =>
        !isNoteReferenceToken(t, noteColumnX, anchors),
    );
    if (numericTokens.length === 0) {
      // Label-only line: a wrapped-label fragment OR a section header. Keep a
      // genuine wrap fragment as a prefix for the value line below, but NEVER a
      // bare section header ("Inntekter", "Fordringer") — merging those mislabels
      // the next row.
      const fragText = stripDuplicateWhitespace(tokens.map((t) => t.token).join(" "));
      const fragNorm = normalizeRowLabel(fragText);
      if (fragNorm && /[a-zæøå]/i.test(fragNorm) && !SECTION_HEADER_WORDS.has(fragNorm)) {
        pendingLabel.push({ text: fragText, y: line.y, height: line.height });
        if (pendingLabel.length > 2) pendingLabel = pendingLabel.slice(-2);
      } else {
        pendingLabel = [];
      }
      continue;
    }

    // Label = everything strictly to the left of the first numeric token, with
    // any wrapped-label fragment(s) sitting just above this value line prepended.
    const firstNumericX = numericTokens[0]!.x;
    const labelTokens = tokens.filter((t) => t.x < firstNumericX);
    const ownLabel = stripDuplicateWhitespace(labelTokens.map((t) => t.token).join(" "));

    const prefixFragments: string[] = [];
    let cutoffY = line.y;
    for (let k = pendingLabel.length - 1; k >= 0; k--) {
      const frag = pendingLabel[k]!;
      const gap = cutoffY - frag.y;
      // 2.0× line height: one printed-row pitch runs ~54-62px at ~32-46px line
      // height on the Brønnøysund forms, so a directly-adjacent wrap fragment
      // can sit just past 1.6× (NORGESGRUPPEN: "Andre immaterielle" 58px above
      // its value line at height 36 → 1.6× = 57.6px missed it by 0.4px and the
      // row was labelled bare "eiendeler"). Two rows up is ~110px+, still well
      // beyond 2.0×, so unrelated fragments stay excluded.
      if (gap > 0 && gap <= Math.max(line.height, frag.height) * 2.0) {
        prefixFragments.unshift(frag.text);
        cutoffY = frag.y;
      } else {
        break;
      }
    }
    pendingLabel = [];

    const label = stripDuplicateWhitespace([...prefixFragments, ownLabel].join(" "));
    const normalizedLabel = normalizeRowLabel(label);
    if (!normalizedLabel || normalizedLabel.length < 3) continue;

    // Cluster numeric tokens into printed numbers by whitespace gaps, THEN
    // assign each whole cluster to a year column. A right-aligned number's
    // digit groups sit a small gap apart (~40px); the gap between the two year
    // columns is several times larger (~200px+). Assigning per-token by nearest
    // anchor splits a WIDE number across columns: an 11-digit balance total
    // pushes its leftmost group to the midpoint between anchors, where the
    // tie breaks toward the current-year column and that group fuses onto the
    // current-year value (the "16 021 578 171" + "16" → 1602157817116 bug).
    // Clustering keeps each printed number whole; the cluster is then placed by
    // its RIGHT edge, since the columns are right-aligned.
    const sortedNumeric = [...numericTokens].sort((a, b) => a.x - b.x);
    const columnSpacing =
      anchors.length >= 2
        ? Math.abs(anchors[anchors.length - 1]!.x - anchors[0]!.x) / (anchors.length - 1)
        : Number.POSITIVE_INFINITY;
    // A gap wider than ~1/5 of the inter-column spacing is a column break, not
    // a thousands separator. Within-number gaps measured ~40px vs ~200px+
    // between columns on the Canica statements, so this sits well clear of both.
    const clusterGap = columnSpacing * 0.2;
    const clusters: NumberCluster[] = [];
    for (const token of sortedNumeric) {
      const last = clusters[clusters.length - 1];
      if (last && token.x - last.rightX <= clusterGap) {
        last.tokens.push(token);
        last.rightX = Math.max(last.rightX, token.rightX);
      } else {
        clusters.push({ tokens: [token], rightX: token.rightX });
      }
    }
    const repairedClusters = rejoinSplitNumberClusters(clusters, anchors, columnSpacing);

    // Header-independent note-column guard. The "Note" reference column sits in
    // the gap between the row label and the first value column; its refs form
    // their own cluster well LEFT of the leftmost (right-aligned) year anchor.
    // nearestColumnIndex would still bucket that cluster into column 0 — fusing
    // the note number onto the front of the current-year value ("16" +
    // 13 334 998 420 → 1613334998420), standing in as a bogus value ("9"), or —
    // for multi-refs like "8,10" — poisoning the concatenation so the REAL value
    // is destroyed ("8,10" + 817 929 000 → parses as 8). isNoteReferenceToken
    // only fires when the "Note" header was OCR'd; this positional rule covers
    // the common case where it was not.
    //
    // A genuine value cluster always right-aligns AT an anchor, so its rightX is
    // never in the note zone — ANY cluster ending left of the value zone is a
    // note ref or stray label numerics, never a statement value. (A long value
    // whose leading groups extend left is safe: the guard tests the cluster's
    // RIGHT edge, which sits at the anchor.)
    const leftmostAnchorX = Math.min(...anchors.map((a) => a.x));
    const noteZoneRightBound =
      Number.isFinite(columnSpacing) ? leftmostAnchorX - columnSpacing * 0.5 : -Infinity;

    const tokensByColumn = new Map<number, PositionedToken[]>();
    for (const cluster of repairedClusters) {
      if (cluster.rightX < noteZoneRightBound) {
        continue; // left of the value zone — note reference or label numerics
      }
      const columnIndex = nearestColumnIndex(cluster.rightX, anchors);
      const bucket = tokensByColumn.get(columnIndex) ?? [];
      bucket.push(...cluster.tokens);
      tokensByColumn.set(columnIndex, bucket);
    }

    // Tokens that share a column concatenate left-to-right into one value:
    // "1 234 567" becomes 1234567. No partition search, no scoring — only
    // the geometry decides what is one number.
    const values: ReconstructedValueCell[] = [];
    const sortedColumns = [...tokensByColumn.entries()].sort((a, b) => a[0] - b[0]);
    for (const [columnIndex, columnTokens] of sortedColumns) {
      const sorted = [...columnTokens].sort((a, b) => a.x - b.x);
      // Structural corruption check. In a thousands-grouped number every group
      // after the first has EXACTLY 3 digits, so a non-first token whose digit
      // count is not a multiple of 3 proves OCR inserted or dropped a digit
      // ("6 8792 042 000" — "879" misread as "8792" → 68 792 042 000, a 10×
      // error for a 6 879 042 000 cell). Emitting nothing is strictly better
      // than emitting a corrupt magnitude: the cell stays blank for review
      // instead of publishing a wrong figure. Multiples of 3 stay allowed so a
      // token that merged complete groups ("817929") still parses.
      const corrupted = sorted.some((t, index) => {
        if (index === 0) return false;
        const digits = t.token.replace(/\D/g, "");
        return digits.length > 0 && digits.length % 3 !== 0;
      });
      if (corrupted) continue;
      const combined = sorted.map((t) => t.token).join("");
      const value = parseFinancialInteger(combined);
      if (value === null) continue;
      values.push({ value, columnIndex, x: sorted[0]!.x });
    }
    const preferredLeadingSkip = countStrictLeadingNoteReferences(
      numericTokensIncludingNotes,
      noteColumnX,
    );
    const textParsedValues = reparseGroupedValuesFromRowText(
      line.text,
      anchors.length,
      preferredLeadingSkip,
      classification.type !== "STATUTORY_INCOME" &&
        classification.type !== "SUPPLEMENTARY_INCOME" &&
        normalizedLabel.includes("utsatt skatt"),
    );
    const finalValues = shouldPreferTextParsedValues(values, textParsedValues)
      ? textParsedValues.map(({ score: _score, ...value }) => value)
      : values;
    if (finalValues.length === 0) continue;

    rows.push({
      pageNumber: page.pageNumber,
      sectionType: classification.type,
      unitScale: classification.unitScale ?? 1,
      label,
      normalizedLabel,
      noteReference: null,
      rowText: line.text,
      y: line.y,
      confidence: Math.max(0.25, Math.min(0.995, line.confidence)),
      values: finalValues,
      liabilitySection,
    });
  }

  return repairProvisionSubtotalRows(rows);
}
