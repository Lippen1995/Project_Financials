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

type PositionedToken = { token: string; x: number; rightX: number };
type NumberCluster = { tokens: PositionedToken[]; rightX: number };

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

    const tokens = tokensWithPositions(line);
    if (tokens.length === 0) {
      pendingLabel = [];
      continue;
    }

    // Drop year-shaped tokens (fiscal-year references) and note-reference
    // tokens — neither is a statement value, and both would otherwise be
    // column-assigned and fused into a value.
    const numericTokens = tokens.filter(
      (t) =>
        isNumericToken(t.token) &&
        !YEAR_TOKEN_RE.test(t.token) &&
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
