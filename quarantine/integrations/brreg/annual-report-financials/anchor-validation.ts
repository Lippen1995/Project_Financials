/**
 * Anchor validation & repair — exact registry values applied to extraction.
 *
 * Regnskapsregisteret's structured JSON (tier 0) gives exact whole-NOK values
 * for the statutory subtotals of a company's latest filed year. Those anchors
 * make two classes of OCR error deterministically repairable:
 *
 *  - Unit scale: if a page's values match anchors only after multiplying by
 *    1000, the page was printed in thousands and the scale detector missed it.
 *  - Dropped leading digits: when a "Sum" row matches an anchor but its detail
 *    rows fall short by a residual that restores exactly one cell's leading
 *    digit group, that correction is proven by BOTH the partition identity and
 *    the external anchor. (Arithmetic alone was shown to be underdetermined —
 *    see the reverted 2026-06-14 reconciliation engine; the anchor is what
 *    makes the repair safe.)
 *
 * After mapping, facts on anchor keys are compared 1:1; disagreement is an
 * ERROR issue (extraction contradicts the authoritative registry → review).
 */
import {
  CanonicalFactCandidate,
  PageClassification,
  ReconstructedRow,
  ValidationIssueDraft,
} from "@/integrations/brreg/annual-report-financials/types";

export type AnchorSet = {
  fiscalYear: number;
  /** canonical metric key → exact whole-NOK value (COMPANY scope). */
  values: Record<string, number>;
};

export type AnchorRowCorrection = {
  pageNumber: number;
  label: string;
  columnIndex: number;
  kind: "unit_scale" | "leading_digit";
  oldValue: number;
  newValue: number;
};

const STATEMENT_SECTIONS = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);
const MIN_ANCHOR_HITS = 2;

export function isSumLabel(normalizedLabel: string): boolean {
  return /^sum\b/.test(normalizedLabel);
}

export type FoldSuspect = {
  sumRow: ReconstructedRow;
  sumValue: number;
  residual: number;
  detailRows: { row: ReconstructedRow; value: number }[];
};

/**
 * Bottom-up sum folding for one column: a "Sum" row must equal a contiguous
 * run of items above it. Shared by the gold-set builder and pipeline repair.
 */
export function foldRowsByColumn(rows: ReconstructedRow[], columnIndex: number) {
  const stack: { row: ReconstructedRow; value: number; members: ReconstructedRow[] }[] = [];
  const verified = new Set<ReconstructedRow>();
  const matchedSums: { row: ReconstructedRow; value: number }[] = [];
  const suspects: FoldSuspect[] = [];

  for (const row of rows) {
    const cell = row.values.find((value) => value.columnIndex === columnIndex);
    if (!cell || !Number.isFinite(cell.value)) continue;
    const scaled = cell.value * (row.unitScale || 1);

    if (isSumLabel(row.normalizedLabel) && stack.length > 0) {
      let acc = 0;
      let matchDepth = -1;
      let bestResidual: { residual: number; depth: number } | null = null;
      for (let depth = stack.length - 1; depth >= 0; depth -= 1) {
        acc += stack[depth]!.value;
        if (acc === scaled) {
          matchDepth = depth;
          break;
        }
        const residual = scaled - acc;
        if (!bestResidual || Math.abs(residual) < Math.abs(bestResidual.residual)) {
          bestResidual = { residual, depth };
        }
      }
      if (matchDepth >= 0) {
        const consumed = stack.splice(matchDepth);
        const members = consumed.flatMap((item) => [item.row, ...item.members]);
        for (const member of members) verified.add(member);
        verified.add(row);
        matchedSums.push({ row, value: scaled });
        stack.push({ row, value: scaled, members });
        continue;
      }
      if (bestResidual && bestResidual.residual !== 0) {
        suspects.push({
          sumRow: row,
          sumValue: scaled,
          residual: bestResidual.residual,
          detailRows: stack
            .slice(bestResidual.depth)
            .map((item) => ({ row: item.row, value: item.value })),
        });
      }
    }

    stack.push({ row, value: scaled, members: [] });
  }

  return { verified, matchedSums, suspects };
}

function anchorMagnitudes(anchors: AnchorSet): Set<number> {
  return new Set(
    Object.values(anchors.values)
      .filter((value) => value !== 0)
      .map((value) => Math.abs(value)),
  );
}

function countAnchorHits(
  rows: ReconstructedRow[],
  columnIndex: number,
  magnitudes: Set<number>,
  scaleMultiplier: number,
): number {
  let hits = 0;
  for (const row of rows) {
    const cell = row.values.find((value) => value.columnIndex === columnIndex);
    if (!cell || !Number.isFinite(cell.value)) continue;
    if (magnitudes.has(Math.abs(cell.value * (row.unitScale || 1) * scaleMultiplier))) hits += 1;
  }
  return hits;
}

export function repairRowsWithAnchors(input: {
  rows: ReconstructedRow[];
  classifications: PageClassification[];
  anchors: AnchorSet;
  filingFiscalYear: number;
}): {
  rows: ReconstructedRow[];
  corrections: AnchorRowCorrection[];
  stats: { pagesAnchored: number; unitScaleRepairs: number; leadingDigitRepairs: number };
} {
  const { anchors } = input;
  if (anchors.fiscalYear !== input.filingFiscalYear) {
    return { rows: input.rows, corrections: [], stats: { pagesAnchored: 0, unitScaleRepairs: 0, leadingDigitRepairs: 0 } };
  }
  const magnitudes = anchorMagnitudes(anchors);
  if (magnitudes.size === 0) {
    return { rows: input.rows, corrections: [], stats: { pagesAnchored: 0, unitScaleRepairs: 0, leadingDigitRepairs: 0 } };
  }

  const scopeByPage = new Map(
    input.classifications.map((classification) => [
      classification.pageNumber,
      classification.statementScope,
    ]),
  );
  const corrections: AnchorRowCorrection[] = [];
  const replacements = new Map<ReconstructedRow, ReconstructedRow>();
  let pagesAnchored = 0;
  let unitScaleRepairs = 0;
  let leadingDigitRepairs = 0;

  const pages = [...new Set(input.rows.map((row) => row.pageNumber))];
  for (const pageNumber of pages) {
    // Anchors are COMPANY-scope; never rescale or edit konsern pages.
    if (scopeByPage.get(pageNumber) === "CONSOLIDATED") continue;
    const pageRows = input.rows
      .filter((row) => row.pageNumber === pageNumber && STATEMENT_SECTIONS.has(row.sectionType))
      .sort((left, right) => left.y - right.y);
    if (pageRows.length === 0) continue;

    const columnIndexes = [
      ...new Set(pageRows.flatMap((row) => row.values.map((value) => value.columnIndex))),
    ];

    // Pick the current-year column: the one whose values hit the anchor set.
    // If nothing hits at the declared scale but does at ×1000, the page is in
    // thousands and the scale detector under-read it.
    let bestColumn: number | null = null;
    let bestHits = 0;
    let bestScale = 1;
    for (const scaleMultiplier of [1, 1000]) {
      for (const columnIndex of columnIndexes) {
        const hits = countAnchorHits(pageRows, columnIndex, magnitudes, scaleMultiplier);
        if (hits > bestHits) {
          bestHits = hits;
          bestColumn = columnIndex;
          bestScale = scaleMultiplier;
        }
      }
      // Prefer the declared scale when it already anchors the page.
      if (bestHits >= MIN_ANCHOR_HITS && scaleMultiplier === 1) break;
    }
    if (bestColumn === null || bestHits < MIN_ANCHOR_HITS) continue;
    pagesAnchored += 1;

    let effectiveRows = pageRows;
    if (bestScale !== 1) {
      unitScaleRepairs += 1;
      effectiveRows = pageRows.map((row) => {
        const repaired: ReconstructedRow = {
          ...row,
          unitScale: (row.unitScale || 1) * bestScale as ReconstructedRow["unitScale"],
        };
        replacements.set(row, repaired);
        corrections.push({
          pageNumber,
          label: row.label,
          columnIndex: bestColumn!,
          kind: "unit_scale",
          oldValue: row.unitScale || 1,
          newValue: (row.unitScale || 1) * bestScale,
        });
        return repaired;
      });
    }

    // Leading-digit repair: a failed fold whose sum row IS anchor-confirmed
    // and whose residual restores exactly one cell's leading digit group.
    const { suspects } = foldRowsByColumn(effectiveRows, bestColumn);
    for (const suspect of suspects) {
      if (!magnitudes.has(Math.abs(suspect.sumValue))) continue;
      if (suspect.residual <= 0) continue;
      const candidates = suspect.detailRows.filter(({ value }) => {
        // The documented tesseract failure drops the THIN LEADING digit group
        // of long right-aligned numbers. Require the read value to already be
        // long (≥6 digits) and the residual to be an exact digit-group prepend
        // (residual = group × 10^len(read)) — anything looser is ambiguous.
        if (value <= 0) return false;
        const digits = String(value).length;
        if (digits < 6) return false;
        return suspect.residual % 10 ** digits === 0;
      });
      if (candidates.length !== 1) continue;
      const target = candidates[0]!;
      const source = replacements.get(target.row) ?? target.row;
      const unitScale = source.unitScale || 1;
      const cellIndex = source.values.findIndex((value) => value.columnIndex === bestColumn);
      if (cellIndex < 0) continue;
      const oldCell = source.values[cellIndex]!;
      const newCellValue = (target.value + suspect.residual) / unitScale;
      if (!Number.isInteger(newCellValue)) continue;
      const repaired: ReconstructedRow = {
        ...source,
        values: source.values.map((cell, index) =>
          index === cellIndex ? { ...cell, value: newCellValue } : cell,
        ),
      };
      replacements.set(target.row, repaired);
      leadingDigitRepairs += 1;
      corrections.push({
        pageNumber,
        label: source.label,
        columnIndex: bestColumn,
        kind: "leading_digit",
        oldValue: oldCell.value * unitScale,
        newValue: target.value + suspect.residual,
      });
    }
  }

  const rows =
    replacements.size === 0
      ? input.rows
      : input.rows.map((row) => replacements.get(row) ?? row);
  return { rows, corrections, stats: { pagesAnchored, unitScaleRepairs, leadingDigitRepairs } };
}

/**
 * Post-mapping check: facts on anchor keys must equal the registry values.
 * A mismatch is an ERROR — the extraction contradicts authoritative data.
 */
export function buildAnchorFactIssues(input: {
  facts: CanonicalFactCandidate[];
  anchors: AnchorSet;
  filingFiscalYear: number;
}): { issues: ValidationIssueDraft[]; matches: number; mismatches: number } {
  const issues: ValidationIssueDraft[] = [];
  let matches = 0;
  let mismatches = 0;
  if (input.anchors.fiscalYear !== input.filingFiscalYear) {
    return { issues, matches, mismatches };
  }

  const bestByKey = new Map<string, CanonicalFactCandidate>();
  for (const fact of input.facts) {
    if (fact.statementScope !== "COMPANY") continue;
    if (fact.fiscalYear !== input.filingFiscalYear) continue;
    const anchor = input.anchors.values[fact.metricKey];
    if (anchor === undefined) continue;
    // Any candidate matching the anchor counts as a match for that key.
    const current = bestByKey.get(fact.metricKey);
    if (!current || Math.abs(fact.value) === Math.abs(anchor)) {
      bestByKey.set(fact.metricKey, fact);
    }
  }

  for (const [metricKey, fact] of bestByKey) {
    const anchor = input.anchors.values[metricKey]!;
    if (Math.abs(fact.value) === Math.abs(anchor)) {
      matches += 1;
    } else {
      mismatches += 1;
      issues.push({
        severity: "ERROR",
        ruleCode: "ANCHOR_VALUE_MISMATCH",
        message: `Ekstrahert ${metricKey} (${fact.value}) avviker fra Regnskapsregisterets eksakte verdi (${anchor}).`,
        context: {
          metricKey,
          extractedValue: fact.value,
          anchorValue: anchor,
          sourcePage: fact.sourcePage,
        },
      });
    }
  }

  return { issues, matches, mismatches };
}
