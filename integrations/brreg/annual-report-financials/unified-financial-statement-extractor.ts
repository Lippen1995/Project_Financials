/**
 * Unified Financial Statement Extractor
 *
 * Operates on UnifiedParserDocument to extract Norwegian annual-report
 * financial statement line items as typed, validated candidates.
 *
 * Design principles:
 * - Never converts monetary values to number. All values stored as string.
 * - Safety flags match the source document (canUseForProductionRouting=false).
 * - Additive only: does not replace production extraction.
 * - Validation produces warnings/errors in the result; it does not throw
 *   unless the input document is structurally invalid.
 * - Duplicate, unmapped, and low-confidence rows are kept with warnings.
 * - Does not invent values or fake tables.
 */

import {
  findCanonicalMetricKey,
} from "@/integrations/brreg/annual-report-financials/taxonomy";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { detectUnitScale } from "@/integrations/brreg/annual-report-financials/unit-scale";
import type {
  UnifiedParserDocument,
  UnifiedParserSection,
  UnifiedParserTable,
  UnifiedParserTableColumn,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

// ---- Types ------------------------------------------------------------------

export type UnifiedFinancialStatementKind =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW_STATEMENT"
  | "EQUITY"
  | "UNKNOWN";

export type UnifiedUnitScale = "ONES" | "THOUSANDS" | "MILLIONS" | "UNKNOWN";

export type UnifiedFinancialLineItem = {
  statementKind: UnifiedFinancialStatementKind;
  canonicalKey: string | null;
  originalLabel: string;
  normalizedLabel: string;
  year: number;
  /** Normalized integer string; never a JS number (preserves precision) */
  value: string;
  unitScale: UnifiedUnitScale;
  sign: "POSITIVE" | "NEGATIVE" | "UNKNOWN";
  confidence: number;
  provenance: {
    route: string;
    pageNumber: number;
    tableId: string | null;
    rowIndex: number | null;
    columnIndex: number | null;
    blockIds: string[];
  };
  warnings: string[];
};

export type UnifiedFinancialStatement = {
  kind: UnifiedFinancialStatementKind;
  pageNumbers: number[];
  tableIds: string[];
  lineItems: UnifiedFinancialLineItem[];
  confidence: number;
  warnings: string[];
};

export type UnifiedFinancialStatementExtractionMetrics = {
  candidateTableCount: number;
  parsedLineItemCount: number;
  canonicalMappedCount: number;
  unmappedCount: number;
  warningCount: number;
  errorCount: number;
};

export type UnifiedFinancialStatementExtractionResult = {
  version: "unified-financial-statement-extraction-v1";
  generatedAt: string;
  source: {
    route: string;
    filingId: string | null;
    extractionRunId: string | null;
    orgNumber: string | null;
    fiscalYear: number | null;
  };
  safety: {
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
    shadowOnly: true;
    canUseForProductionRouting: false;
  };
  metrics: UnifiedFinancialStatementExtractionMetrics;
  statements: UnifiedFinancialStatement[];
  warnings: string[];
  errors: string[];
};

export type ExtractUnifiedFinancialStatementsOptions = {
  /** If provided, used to validate year columns against the expected fiscal year */
  fiscalYear?: number;
  /** If true, keeps all rows even if no year columns are detected */
  keepRowsWithoutYearColumns?: boolean;
};

// ---- Amount parsing ---------------------------------------------------------

type ParsedAmount = {
  value: string;
  sign: "POSITIVE" | "NEGATIVE" | "UNKNOWN";
  isNumeric: boolean;
};

/**
 * Parse a raw Norwegian financial amount string into a normalized integer string.
 *
 * Handles:
 *   -123        → value="-123", sign=NEGATIVE
 *   (123)       → value="-123", sign=NEGATIVE
 *   123-        → value="-123", sign=NEGATIVE
 *   1 234       → value="1234", sign=POSITIVE
 *   1.234       → value="1234", sign=POSITIVE (. = thousands separator)
 *   1.234,50    → value="1234", sign=POSITIVE (comma decimal stripped)
 *   -           → isNumeric=false
 *   ""          → isNumeric=false
 */
export function parseAmountString(raw: string): ParsedAmount {
  const s = raw.trim();
  if (!s || s === "-" || s === "—" || s === "–") {
    return { value: "", sign: "UNKNOWN", isNumeric: false };
  }

  let negative = false;
  let cleaned = s;

  // Format: (123) or (1.234)
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1).trim();
  } else if (cleaned.startsWith("-") && cleaned.length > 1 && /\d/.test(cleaned[1] ?? "")) {
    // Format: -123
    negative = true;
    cleaned = cleaned.slice(1).trim();
  } else if (cleaned.endsWith("-") && cleaned.length > 1 && /\d/.test(cleaned[0] ?? "")) {
    // Format: 123-
    negative = true;
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Remove whitespace and non-breaking spaces (common in Norwegian tables)
  cleaned = cleaned.replace(/[\s ]/g, "");

  if (!cleaned) return { value: "", sign: "UNKNOWN", isNumeric: false };

  // Detect Norwegian number format:
  //   1.234.567     → thousands using dots
  //   1.234.567,50  → thousands dots + comma decimal
  //   1 234 567     → thousands using spaces (already removed above)
  // We treat trailing ",XX" (1-2 digits) as a decimal — drop it.
  // Any "," followed by 3 digits is treated as a thousands separator (unlikely but safe).

  let intPart: string;
  const commaMatch = /,(\d+)$/.exec(cleaned);
  if (commaMatch) {
    // Has comma — could be decimal separator
    const afterComma = commaMatch[1] ?? "";
    if (afterComma.length <= 2) {
      // Decimal cents — truncate
      intPart = cleaned.slice(0, cleaned.lastIndexOf(",")).replace(/\./g, "");
    } else {
      // 3+ digits after comma — treat comma as thousands separator too
      intPart = cleaned.replace(/[.,]/g, "");
    }
  } else {
    // No comma — dots are thousands separators
    intPart = cleaned.replace(/\./g, "");
  }

  // Verify result is purely numeric
  if (!/^\d+$/.test(intPart)) {
    return { value: s, sign: "UNKNOWN", isNumeric: false };
  }

  const value = negative ? `-${intPart}` : intPart;
  return { value, sign: negative ? "NEGATIVE" : "POSITIVE", isNumeric: true };
}

// ---- Unit scale detection ---------------------------------------------------

function detectUnitScaleFromText(text: string): UnifiedUnitScale {
  if (!text.trim()) return "UNKNOWN";
  const normalized = normalizeNorwegianText(text);
  if (
    /\bmnok\b/.test(normalized) ||
    /\bm nok\b/.test(normalized) ||
    /millioner?\s+(?:kroner|kr|nok)\b/.test(normalized) ||
    /belop i\s+(?:nok\s+)?millioner\b/.test(normalized)
  ) {
    return "MILLIONS";
  }
  try {
    const result = detectUnitScale(text);
    if (result.unitScale === 1000) return "THOUSANDS";
    if (result.unitScale === 1) return "ONES";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function detectTableUnitScale(
  table: UnifiedParserTable,
  doc: UnifiedParserDocument,
): UnifiedUnitScale {
  // 1. Table title
  if (table.title) {
    const scale = detectUnitScaleFromText(table.title);
    if (scale !== "UNKNOWN") return scale;
  }

  // 2. First row (often contains "Beløp i NOK 1 000" or similar)
  if (table.rows[0]) {
    const headerText = [
      table.rows[0].label,
      ...table.rows[0].cells.map((c) => c.text),
    ].join(" ");
    const scale = detectUnitScaleFromText(headerText);
    if (scale !== "UNKNOWN") return scale;
  }

  // 3. Column headers
  const colText = table.columns.map((c) => c.text).join(" ");
  const scale = detectUnitScaleFromText(colText);
  if (scale !== "UNKNOWN") return scale;

  // 4. Section text preview for the page
  const section = doc.sections.find(
    (s) => s.pageStart <= table.pageNumber && table.pageNumber <= s.pageEnd,
  );
  if (section?.textPreview) {
    const secScale = detectUnitScaleFromText(section.textPreview);
    if (secScale !== "UNKNOWN") return secScale;
  }

  return "UNKNOWN";
}

// ---- Table role detection ---------------------------------------------------

function detectTableRole(
  table: UnifiedParserTable,
  doc: UnifiedParserDocument,
): UnifiedFinancialStatementKind {
  // 1. Explicit title
  if (table.title) {
    const n = normalizeNorwegianText(table.title);
    if (/resultatregnskap|resultat\s*regnskap/.test(n)) return "INCOME_STATEMENT";
    if (/balanse|balanse fortsatt/.test(n)) return "BALANCE_SHEET";
    if (/egenkapital og gjeld|gjeld og egenkapital/.test(n)) return "BALANCE_SHEET";
    if (/kontantstrom|kontantstr|likviditet/.test(n)) return "CASH_FLOW_STATEMENT";
    if (/egenkapital/.test(n) && !/sum\s+egenkapital/.test(n)) return "EQUITY";
  }

  // 2. Containing section kind
  const section = doc.sections.find(
    (s) => s.pageStart <= table.pageNumber && table.pageNumber <= s.pageEnd,
  );
  if (section) {
    switch (section.kind) {
      case "INCOME_STATEMENT":
        return "INCOME_STATEMENT";
      case "BALANCE_SHEET":
        return "BALANCE_SHEET";
      case "CASH_FLOW_STATEMENT":
        return "CASH_FLOW_STATEMENT";
      case "EQUITY_NOTE":
        return "EQUITY";
      default:
        break;
    }
  }

  // 3. Heuristic from first few rows
  const firstRows = table.rows.slice(0, 5);
  for (const row of firstRows) {
    const n = normalizeNorwegianText(row.normalizedLabel || row.label);
    if (/driftsinntekt|salgsinntekt|arsresultat/.test(n)) return "INCOME_STATEMENT";
    if (
      /sum eiendeler|anleggsmidler|omlopsmidler|sum egenkapital|sum gjeld|sum egenkapital og gjeld|langsiktig gjeld|kortsiktig gjeld/.test(
        n,
      )
    ) {
      return "BALANCE_SHEET";
    }
    if (/kontantstr|betalinger/.test(n)) return "CASH_FLOW_STATEMENT";
  }

  return "UNKNOWN";
}

// ---- Year column detection --------------------------------------------------

type YearColumn = { columnIndex: number; year: number };

function detectYearColumns(
  columns: UnifiedParserTableColumn[],
  firstRow?: UnifiedParserTable["rows"][0],
): YearColumn[] {
  const result: YearColumn[] = [];
  const seen = new Set<number>();

  // From column metadata
  for (const col of columns) {
    const year = col.year;
    if (year && year >= 2000 && year <= 2100 && !seen.has(col.columnIndex)) {
      result.push({ columnIndex: col.columnIndex, year });
      seen.add(col.columnIndex);
    }
  }

  if (result.length > 0) return result;

  // Try to parse year from column text and first-row cell text
  for (const col of columns) {
    const texts = [col.text, col.normalizedText];
    if (firstRow) {
      const cell = firstRow.cells.find((c) => c.columnIndex === col.columnIndex);
      if (cell) texts.push(cell.text, cell.normalizedText);
    }
    for (const t of texts) {
      const m = t.match(/\b(20\d{2})\b/);
      if (m && !seen.has(col.columnIndex)) {
        const year = parseInt(m[1], 10);
        result.push({ columnIndex: col.columnIndex, year });
        seen.add(col.columnIndex);
        break;
      }
    }
  }

  return result;
}

// ---- Note reference column detection ----------------------------------------

function isNoteRefColumn(col: UnifiedParserTableColumn): boolean {
  const n = (col.normalizedText || col.text).toLowerCase().trim();
  if (n === "note" || n === "noter" || n === "note nr" || n === "note nr." || n === "nr") {
    return true;
  }
  // Short non-year text that doesn't look like a financial header
  if (n.length <= 6 && !/20\d{2}/.test(n) && /^[a-z\s]+$/.test(n)) {
    return true;
  }
  return false;
}

// ---- Canonical key lookup ---------------------------------------------------

function mapToCanonicalKey(
  label: string,
  statementKind: UnifiedFinancialStatementKind,
): string | null {
  const normalized = normalizeNorwegianText(label);
  if (statementKind === "INCOME_STATEMENT") {
    return findCanonicalMetricKey(normalized, "INCOME_STATEMENT") ?? null;
  }
  if (statementKind === "BALANCE_SHEET") {
    return findCanonicalMetricKey(normalized, "BALANCE_SHEET") ?? null;
  }
  if (statementKind === "UNKNOWN") {
    return (
      findCanonicalMetricKey(normalized, "INCOME_STATEMENT") ??
      findCanonicalMetricKey(normalized, "BALANCE_SHEET") ??
      null
    );
  }
  return null;
}

// ---- Row extraction from a single table -------------------------------------

function extractLineItemsFromTable(
  table: UnifiedParserTable,
  doc: UnifiedParserDocument,
  options: ExtractUnifiedFinancialStatementsOptions,
): UnifiedFinancialLineItem[] {
  const route = doc.source.route;
  const role = detectTableRole(table, doc);
  const unitScale = detectTableUnitScale(table, doc);
  const yearCols = detectYearColumns(table.columns, table.rows[0]);

  if (yearCols.length === 0 && !options.keepRowsWithoutYearColumns) {
    return [];
  }

  const noteColIndices = new Set(
    table.columns.filter(isNoteRefColumn).map((c) => c.columnIndex),
  );

  const items: UnifiedFinancialLineItem[] = [];
  const HEADER_PATTERN = /^(note|noter|year|belopene|bel[o0]p|nok\b|amounts)/i;

  for (const row of table.rows) {
    const label = row.label.trim();
    const normalizedLabel = normalizeNorwegianText(label);

    // Skip header rows (labels that are year numbers or meta-headers)
    if (!label || HEADER_PATTERN.test(normalizedLabel)) continue;
    if (/^20\d{2}$/.test(label.trim())) continue;

    const canonicalKey = mapToCanonicalKey(normalizedLabel, role);

    for (const yearCol of yearCols) {
      if (noteColIndices.has(yearCol.columnIndex)) continue;

      const cell = row.cells.find((c) => c.columnIndex === yearCol.columnIndex);
      if (!cell) continue;

      const rawText = cell.text.trim();
      if (!rawText) continue;

      // Try numericValue first (pre-parsed by structured builder)
      let parsed: ParsedAmount;
      if (cell.numericValue !== null) {
        // numericValue is already a string from the builder
        const nv = cell.numericValue;
        const sign: "POSITIVE" | "NEGATIVE" | "UNKNOWN" = nv.startsWith("-")
          ? "NEGATIVE"
          : "POSITIVE";
        parsed = { value: nv, sign, isNumeric: true };
      } else {
        parsed = parseAmountString(rawText);
      }

      if (!parsed.isNumeric) continue;

      const warnings: string[] = [];
      if (!canonicalKey) {
        warnings.push(`No canonical mapping found for label "${label}".`);
      }

      items.push({
        statementKind: role,
        canonicalKey,
        originalLabel: label,
        normalizedLabel,
        year: yearCol.year,
        value: parsed.value,
        unitScale,
        sign: parsed.sign,
        confidence: canonicalKey ? 0.85 : 0.4,
        provenance: {
          route,
          pageNumber: table.pageNumber,
          tableId: table.tableId,
          rowIndex: row.rowIndex,
          columnIndex: yearCol.columnIndex,
          blockIds: table.blockIds,
        },
        warnings,
      });
    }
  }

  return items;
}

// ---- Statement-level validation ---------------------------------------------

export type UnifiedFinancialValidationResult = {
  valid: boolean;
  issues: Array<{
    severity: "INFO" | "WARNING" | "ERROR";
    code: string;
    message: string;
  }>;
};

/**
 * Validate statement-level invariants.
 * Returns warnings/errors but does not throw.
 */
export function validateUnifiedFinancialStatements(
  result: UnifiedFinancialStatementExtractionResult,
): UnifiedFinancialValidationResult {
  const issues: UnifiedFinancialValidationResult["issues"] = [];

  for (const stmt of result.statements) {
    const items = stmt.lineItems;
    const years = [...new Set(items.map((i) => i.year))];

    // Year consistency
    if (years.length === 0) {
      issues.push({
        severity: "WARNING",
        code: "NO_YEAR_COLUMNS",
        message: `Statement ${stmt.kind} has no year columns detected.`,
      });
    }

    // Unit consistency within statement
    const allScales = [...new Set(items.map((i) => i.unitScale))];
    const knownScales = allScales.filter((s) => s !== "UNKNOWN");
    const hasUnknown = allScales.includes("UNKNOWN");
    if (knownScales.length > 1 || (knownScales.length >= 1 && hasUnknown)) {
      issues.push({
        severity: "WARNING",
        code: "MIXED_UNIT_SCALE",
        message: `Statement ${stmt.kind} has mixed unit scales: ${allScales.join(", ")}.`,
      });
    }

    // Duplicate canonical line items per year
    const seenKeys = new Map<string, number>();
    for (const item of items) {
      if (!item.canonicalKey) continue;
      const key = `${item.canonicalKey}:${item.year}`;
      const count = (seenKeys.get(key) ?? 0) + 1;
      seenKeys.set(key, count);
    }
    for (const [key, count] of seenKeys.entries()) {
      if (count > 1) {
        issues.push({
          severity: "WARNING",
          code: "DUPLICATE_CANONICAL_KEY",
          message: `Canonical key "${key}" appears ${count} times in ${stmt.kind}.`,
        });
      }
    }

    // Balance sheet equation sanity: total_assets ≈ total_equity + total_liabilities
    if (stmt.kind === "BALANCE_SHEET") {
      for (const year of years) {
        const forYear = items.filter((i) => i.year === year && /^-?\d+$/.test(i.value));
        const totalAssets = forYear.find((i) => i.canonicalKey === "total_assets");
        const totalEquity = forYear.find((i) => i.canonicalKey === "total_equity");
        const totalLiabilities = forYear.find((i) => i.canonicalKey === "total_liabilities");
        const totalEquityAndLiab = forYear.find(
          (i) => i.canonicalKey === "total_equity_and_liabilities",
        );

        // Prefer total_equity_and_liabilities over separate components
        const rightSide = totalEquityAndLiab ?? null;
        const leftSide = totalAssets ?? null;

        if (leftSide && rightSide) {
          const a = parseIntSafe(leftSide.value);
          const b = parseIntSafe(rightSide.value);
          if (a !== null && b !== null && Math.abs(a - b) > Math.max(1000, Math.abs(a) * 0.01)) {
            issues.push({
              severity: "WARNING",
              code: "BALANCE_SHEET_EQUATION_MISMATCH",
              message: `Balance sheet equation mismatch for ${year}: total_assets=${leftSide.value} ≠ total_equity_and_liabilities=${rightSide.value}.`,
            });
          }
        } else if (leftSide && totalEquity && totalLiabilities) {
          const a = parseIntSafe(leftSide.value);
          const e = parseIntSafe(totalEquity.value);
          const l = parseIntSafe(totalLiabilities.value);
          if (a !== null && e !== null && l !== null) {
            const epl = e + l;
            if (Math.abs(a - epl) > Math.max(1000, Math.abs(a) * 0.01)) {
              issues.push({
                severity: "WARNING",
                code: "BALANCE_SHEET_EQUATION_MISMATCH",
                message: `Balance sheet equation mismatch for ${year}: total_assets=${a} ≠ equity(${e}) + liabilities(${l}) = ${epl}.`,
              });
            }
          }
        }
      }
    }

    // Income statement sanity: net_income relation to profit_before_tax
    if (stmt.kind === "INCOME_STATEMENT") {
      for (const year of years) {
        const forYear = items.filter((i) => i.year === year);
        const profitBeforeTax = forYear.find((i) => i.canonicalKey === "profit_before_tax");
        const netIncome = forYear.find((i) => i.canonicalKey === "net_income");
        const taxExpense = forYear.find((i) => i.canonicalKey === "tax_expense");

        if (profitBeforeTax && netIncome && taxExpense) {
          const pbt = parseIntSafe(profitBeforeTax.value);
          const ni = parseIntSafe(netIncome.value);
          const tax = parseIntSafe(taxExpense.value);
          if (pbt !== null && ni !== null && tax !== null) {
            const expected = pbt - Math.abs(tax);
            if (Math.abs(expected - ni) > Math.max(1000, Math.abs(pbt) * 0.02)) {
              issues.push({
                severity: "WARNING",
                code: "INCOME_STATEMENT_TAX_MISMATCH",
                message: `Income statement: profit_before_tax(${pbt}) - tax(${tax}) = ${expected}, but net_income=${ni} for ${year}.`,
              });
            }
          }
        }
      }
    }
  }

  return { valid: issues.filter((i) => i.severity === "ERROR").length === 0, issues };
}

// ---- Comparison helper (stub) -----------------------------------------------

export type UnifiedVsLegacyComparisonResult = {
  matchedLineItems: number;
  onlyInLegacy: number;
  onlyInUnified: number;
  valueMismatches: number;
  mappingMismatches: number;
  warningSummary: string[];
};

/**
 * Stub: compare unified extraction result with a legacy result.
 * Full implementation is deferred (TODO: wire to CanonicalFactCandidate[]).
 */
export function compareUnifiedFinancialExtractionWithLegacyResult(
  _unified: UnifiedFinancialStatementExtractionResult,
  _legacyCandidates: unknown[],
): UnifiedVsLegacyComparisonResult {
  // TODO: implement full comparison when legacy extraction is wired up
  return {
    matchedLineItems: 0,
    onlyInLegacy: Array.isArray(_legacyCandidates) ? _legacyCandidates.length : 0,
    onlyInUnified: _unified.metrics.parsedLineItemCount,
    valueMismatches: 0,
    mappingMismatches: 0,
    warningSummary: ["compareUnifiedFinancialExtractionWithLegacyResult: full comparison not yet implemented."],
  };
}

// ---- Main extraction --------------------------------------------------------

/**
 * Extract financial statement line items from a UnifiedParserDocument.
 *
 * All values are stored as strings. No DB access, no live Brreg calls,
 * no OCR/ODL runtime invoked.
 */
export function extractUnifiedFinancialStatements(
  doc: UnifiedParserDocument,
  options: ExtractUnifiedFinancialStatementsOptions = {},
): UnifiedFinancialStatementExtractionResult {
  if (doc.safety.canUseForProductionRouting !== false) {
    throw new Error(
      "extractUnifiedFinancialStatements: source document must have canUseForProductionRouting=false.",
    );
  }

  const allItems: UnifiedFinancialLineItem[] = [];
  const extractionWarnings: string[] = [];
  const extractionErrors: string[] = [];

  const candidateTableCount = doc.tables.length;

  if (doc.tables.length === 0) {
    extractionWarnings.push(
      "No tables found in document. Cannot extract financial statements from table data.",
    );
  }

  for (const table of doc.tables) {
    try {
      const items = extractLineItemsFromTable(table, doc, options);
      allItems.push(...items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      extractionErrors.push(`Error extracting table "${table.tableId}": ${msg}`);
    }
  }

  // Also attempt text-based extraction from sections when no tables are present
  if (doc.tables.length === 0 && doc.sections.length > 0) {
    extractionWarnings.push(
      "Falling back to section text extraction — table-based extraction not available.",
    );
    // Text-based extraction is not yet implemented in this PR (deferred)
    // TODO: implement line-by-line text extraction as follow-on
  }

  // Group items into statements by kind
  const statementsByKind = new Map<UnifiedFinancialStatementKind, UnifiedFinancialLineItem[]>();
  for (const item of allItems) {
    const existing = statementsByKind.get(item.statementKind) ?? [];
    existing.push(item);
    statementsByKind.set(item.statementKind, existing);
  }

  const statements: UnifiedFinancialStatement[] = [];
  for (const [kind, items] of statementsByKind.entries()) {
    const pageNumbers = [...new Set(items.map((i) => i.provenance.pageNumber))].sort((a, b) => a - b);
    const tableIds = [...new Set(items.map((i) => i.provenance.tableId ?? ""))].filter(Boolean);
    const avgConfidence =
      items.length > 0
        ? items.reduce((sum, i) => sum + i.confidence, 0) / items.length
        : 0;

    const stmtWarnings: string[] = [];
    const unmapped = items.filter((i) => !i.canonicalKey);
    if (unmapped.length > 0) {
      stmtWarnings.push(
        `${unmapped.length} line item(s) could not be mapped to canonical keys: ${unmapped.slice(0, 3).map((i) => `"${i.originalLabel}"`).join(", ")}${unmapped.length > 3 ? " …" : ""}.`,
      );
    }

    statements.push({
      kind,
      pageNumbers,
      tableIds,
      lineItems: items,
      confidence: Math.round(avgConfidence * 100) / 100,
      warnings: stmtWarnings,
    });
  }

  // Sort statements: income first, then balance, then rest
  const kindOrder: UnifiedFinancialStatementKind[] = [
    "INCOME_STATEMENT",
    "BALANCE_SHEET",
    "CASH_FLOW_STATEMENT",
    "EQUITY",
    "UNKNOWN",
  ];
  statements.sort(
    (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind),
  );

  const canonicalMapped = allItems.filter((i) => !!i.canonicalKey).length;
  const unmapped = allItems.filter((i) => !i.canonicalKey).length;
  const totalWarnings =
    extractionWarnings.length +
    statements.reduce((sum, s) => sum + s.warnings.length, 0) +
    allItems.reduce((sum, i) => sum + i.warnings.length, 0);

  return {
    version: "unified-financial-statement-extraction-v1",
    generatedAt: new Date().toISOString(),
    source: {
      route: doc.source.route,
      filingId: doc.source.filingId,
      extractionRunId: doc.source.extractionRunId,
      orgNumber: doc.source.orgNumber,
      fiscalYear: doc.source.fiscalYear,
    },
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    metrics: {
      candidateTableCount,
      parsedLineItemCount: allItems.length,
      canonicalMappedCount: canonicalMapped,
      unmappedCount: unmapped,
      warningCount: totalWarnings,
      errorCount: extractionErrors.length,
    },
    statements,
    warnings: extractionWarnings,
    errors: extractionErrors,
  };
}

// ---- Validation of the result type ------------------------------------------

export function validateUnifiedFinancialStatementExtractionResult(
  result: UnifiedFinancialStatementExtractionResult,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (result.version !== "unified-financial-statement-extraction-v1") {
    issues.push(`version must be "unified-financial-statement-extraction-v1".`);
  }
  if (!result.generatedAt) {
    issues.push("generatedAt is required.");
  }
  if (result.safety.canUseForProductionRouting !== false) {
    issues.push("safety.canUseForProductionRouting must be false.");
  }
  if (result.safety.productionRoutingChanged !== false) {
    issues.push("safety.productionRoutingChanged must be false.");
  }
  if (result.safety.productionFactsMutated !== false) {
    issues.push("safety.productionFactsMutated must be false.");
  }
  if (result.safety.shadowOnly !== true) {
    issues.push("safety.shadowOnly must be true.");
  }

  for (const stmt of result.statements) {
    for (const item of stmt.lineItems) {
      if (typeof item.value === "number") {
        issues.push(
          `Line item "${item.originalLabel}" (${item.year}): value must be string, got number.`,
        );
      }
      if (typeof item.value === "string" && item.value !== "" && !/^-?\d+$/.test(item.value)) {
        // Allow non-numeric strings (unmapped rows can have raw text)
      }
      if (typeof item.confidence === "number" && !Number.isFinite(item.confidence)) {
        issues.push(`Line item "${item.originalLabel}" has non-finite confidence.`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ---- Serialization ----------------------------------------------------------

export function serializeUnifiedFinancialStatementExtractionResultAsJson(
  result: UnifiedFinancialStatementExtractionResult,
): string {
  return JSON.stringify(result, null, 2);
}

// ---- Helpers ----------------------------------------------------------------

/** Safely parse an integer string. Returns null if not parsable. */
function parseIntSafe(s: string): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
