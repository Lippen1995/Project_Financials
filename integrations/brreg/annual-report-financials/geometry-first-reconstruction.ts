import { toAnnualReportParsedPages } from "@/integrations/brreg/annual-report-financials/page-model";
import {
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

function isNumericToken(token: string): boolean {
  return NUMERIC_TOKEN_RE.test(token.trim());
}

function tokensWithPositions(line: ExtractedLine): Array<{ token: string; x: number }> {
  if (line.words.length === 0) {
    // No per-word geometry. Geometry-first cannot do useful work here.
    return [];
  }
  const result: Array<{ token: string; x: number }> = [];
  for (const word of line.words) {
    const repaired = repairOcrTokenBoundaries(word.text);
    const parts = repaired.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      result.push({ token: parts[0]!, x: word.x });
      continue;
    }
    // A word that repaired into multiple tokens: distribute them across the
    // word's bounding box so each gets a distinct x.
    const step = Math.max(1, Math.floor(word.width / parts.length));
    for (let i = 0; i < parts.length; i++) {
      result.push({ token: parts[i]!, x: word.x + i * step });
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
      const match = word.text.match(YEAR_IN_TEXT_RE);
      if (match) {
        anchors.push({ year: Number(match[0]), x: word.x });
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
      const match = word.text.match(YEAR_IN_TEXT_RE);
      if (match) {
        candidates.push({ year: Number(match[0]), x: word.x, y: line.y });
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

  const [page] = toAnnualReportParsedPages([inputPage]);
  if (!page) return [];

  let anchors = findYearColumnAnchors(page);
  if (anchors.length < 2 && inheritedAnchors && inheritedAnchors.length >= 2) {
    anchors = inheritedAnchors;
  }
  if (anchors.length < 2) return [];

  const yearHeaderIndex = page.lines.findIndex((line) =>
    line.words.some((word) => YEAR_IN_TEXT_RE.test(word.text)),
  );

  const rows: ReconstructedRow[] = [];

  for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex++) {
    if (lineIndex === yearHeaderIndex) continue;
    const line = page.lines[lineIndex]!;
    if (isNoiseLine(line.text)) continue;

    const tokens = tokensWithPositions(line);
    if (tokens.length === 0) continue;

    // Drop year-shaped tokens — they are references to a fiscal year, not a
    // statement value, and they would otherwise be column-assigned.
    const numericTokens = tokens.filter(
      (t) => isNumericToken(t.token) && !YEAR_TOKEN_RE.test(t.token),
    );
    if (numericTokens.length === 0) continue;

    // Label = everything strictly to the left of the first numeric token.
    const firstNumericX = numericTokens[0]!.x;
    const labelTokens = tokens.filter((t) => t.x < firstNumericX);
    const label = stripDuplicateWhitespace(labelTokens.map((t) => t.token).join(" "));
    const normalizedLabel = normalizeRowLabel(label);
    if (!normalizedLabel || normalizedLabel.length < 3) continue;

    // Bucket each numeric token into the column whose anchor it is nearest.
    const tokensByColumn = new Map<number, Array<{ token: string; x: number }>>();
    for (const token of numericTokens) {
      const columnIndex = nearestColumnIndex(token.x, anchors);
      const bucket = tokensByColumn.get(columnIndex) ?? [];
      bucket.push(token);
      tokensByColumn.set(columnIndex, bucket);
    }

    // Tokens that share a column concatenate left-to-right into one value:
    // "1 234 567" becomes 1234567. No partition search, no scoring — only
    // the geometry decides what is one number.
    const values: ReconstructedValueCell[] = [];
    const sortedColumns = [...tokensByColumn.entries()].sort((a, b) => a[0] - b[0]);
    for (const [columnIndex, columnTokens] of sortedColumns) {
      const sorted = [...columnTokens].sort((a, b) => a.x - b.x);
      const combined = sorted.map((t) => t.token).join("");
      const value = parseFinancialInteger(combined);
      if (value === null) continue;
      values.push({ value, columnIndex, x: sorted[0]!.x });
    }
    if (values.length === 0) continue;

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
      values,
    });
  }

  return rows;
}
