import { describe, expect, it } from "vitest";

import {
  extractUnifiedFinancialStatements,
  parseAmountString,
  serializeUnifiedFinancialStatementExtractionResultAsJson,
  validateUnifiedFinancialStatementExtractionResult,
  validateUnifiedFinancialStatements,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import {
  buildUnifiedParserDocumentFromTextLayer,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type {
  UnifiedParserDocument,
  UnifiedParserTable,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

// ---- Helpers ----------------------------------------------------------------

function makeEmptyDoc(): UnifiedParserDocument {
  return buildUnifiedParserDocumentFromTextLayer({ pages: [] });
}

function makeDocWithTable(table: UnifiedParserTable): UnifiedParserDocument {
  const doc = makeEmptyDoc();
  doc.tables.push(table);
  return doc;
}

function makeIncomeTable(overrides: Partial<UnifiedParserTable> = {}): UnifiedParserTable {
  return {
    tableId: "t-income-1",
    role: "INCOME_STATEMENT",
    pageNumber: 2,
    blockIds: [],
    title: "Resultatregnskap",
    columns: [
      { columnIndex: 1, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true },
      { columnIndex: 2, text: "2023", normalizedText: "2023", year: 2023, isAmountColumn: true },
    ],
    confidence: 0.9,
    warnings: [],
    ...overrides,
    rows: overrides.rows ?? [
      {
        rowIndex: 0,
        label: "Salgsinntekter",
        normalizedLabel: "salgsinntekter",
        cells: [
          { columnIndex: 1, text: "1.234.567", normalizedText: "1.234.567", numericValue: null, confidence: null },
          { columnIndex: 2, text: "987.654", normalizedText: "987.654", numericValue: null, confidence: null },
        ],
      },
      {
        rowIndex: 1,
        label: "Lønnskostnad",
        normalizedLabel: "lonnskostnad",
        cells: [
          { columnIndex: 1, text: "(450.000)", normalizedText: "(450.000)", numericValue: null, confidence: null },
          { columnIndex: 2, text: "400.000-", normalizedText: "400.000-", numericValue: null, confidence: null },
        ],
      },
      {
        rowIndex: 2,
        label: "Årsresultat",
        normalizedLabel: "arsresultat",
        cells: [
          { columnIndex: 1, text: "100.000", normalizedText: "100.000", numericValue: null, confidence: null },
          { columnIndex: 2, text: "80.000", normalizedText: "80.000", numericValue: null, confidence: null },
        ],
      },
    ],
  };
}

function makeBalanceTable(): UnifiedParserTable {
  return {
    tableId: "t-balance-1",
    role: "BALANCE_SHEET",
    pageNumber: 3,
    blockIds: [],
    title: "Balanse",
    columns: [
      { columnIndex: 1, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true },
      { columnIndex: 2, text: "2023", normalizedText: "2023", year: 2023, isAmountColumn: true },
    ],
    rows: [
      {
        rowIndex: 0,
        label: "Sum eiendeler",
        normalizedLabel: "sum eiendeler",
        cells: [
          { columnIndex: 1, text: "5.000.000", normalizedText: "5.000.000", numericValue: null, confidence: null },
          { columnIndex: 2, text: "4.500.000", normalizedText: "4.500.000", numericValue: null, confidence: null },
        ],
      },
      {
        rowIndex: 1,
        label: "Sum egenkapital og gjeld",
        normalizedLabel: "sum egenkapital og gjeld",
        cells: [
          { columnIndex: 1, text: "5.000.000", normalizedText: "5.000.000", numericValue: null, confidence: null },
          { columnIndex: 2, text: "4.500.000", normalizedText: "4.500.000", numericValue: null, confidence: null },
        ],
      },
    ],
    confidence: 0.9,
    warnings: [],
  };
}

// ---- parseAmountString ------------------------------------------------------

describe("parseAmountString", () => {
  it("parses plain integers", () => {
    expect(parseAmountString("1234").value).toBe("1234");
    expect(parseAmountString("1234").sign).toBe("POSITIVE");
    expect(parseAmountString("1234").isNumeric).toBe(true);
  });

  it("parses Norwegian thousands-dot format", () => {
    expect(parseAmountString("1.234.567").value).toBe("1234567");
    expect(parseAmountString("987.654").value).toBe("987654");
  });

  it("parses negative format: -123", () => {
    const r = parseAmountString("-450000");
    expect(r.value).toBe("-450000");
    expect(r.sign).toBe("NEGATIVE");
    expect(r.isNumeric).toBe(true);
  });

  it("parses negative format: (123)", () => {
    const r = parseAmountString("(450.000)");
    expect(r.value).toBe("-450000");
    expect(r.sign).toBe("NEGATIVE");
    expect(r.isNumeric).toBe(true);
  });

  it("parses negative format: 123-", () => {
    const r = parseAmountString("400.000-");
    expect(r.value).toBe("-400000");
    expect(r.sign).toBe("NEGATIVE");
    expect(r.isNumeric).toBe(true);
  });

  it("returns isNumeric=false for dash/empty", () => {
    expect(parseAmountString("-").isNumeric).toBe(false);
    expect(parseAmountString("").isNumeric).toBe(false);
    expect(parseAmountString("—").isNumeric).toBe(false);
  });

  it("preserves large integer strings without Number() conversion", () => {
    const big = "9007199254740993"; // > Number.MAX_SAFE_INTEGER
    const r = parseAmountString(big);
    expect(r.isNumeric).toBe(true);
    expect(r.value).toBe(big);
    // Verify it's still a string, not a number
    expect(typeof r.value).toBe("string");
  });

  it("handles space-separated thousands (non-breaking space)", () => {
    const r = parseAmountString("1 234 567");
    expect(r.isNumeric).toBe(true);
    expect(r.value).toBe("1234567");
  });

  it("returns isNumeric=false for non-numeric text", () => {
    expect(parseAmountString("N/A").isNumeric).toBe(false);
    expect(parseAmountString("Note").isNumeric).toBe(false);
  });
});

// ---- extractUnifiedFinancialStatements — income statement -------------------

describe("extractUnifiedFinancialStatements — income statement", () => {
  it("extracts income statement rows from a table", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);

    expect(result.metrics.candidateTableCount).toBe(1);
    expect(result.statements).toHaveLength(1);
    const stmt = result.statements[0];
    expect(stmt.kind).toBe("INCOME_STATEMENT");
    expect(stmt.lineItems.length).toBeGreaterThan(0);
  });

  it("maps Salgsinntekter to canonical key 'revenue'", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const stmt = result.statements[0];
    const revenue = stmt.lineItems.find((i) => i.originalLabel === "Salgsinntekter");
    expect(revenue).toBeDefined();
    expect(revenue?.canonicalKey).toBe("revenue");
  });

  it("maps Lønnskostnad to canonical key 'payroll_expense'", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const stmt = result.statements[0];
    const payroll = stmt.lineItems.find((i) => i.canonicalKey === "payroll_expense");
    expect(payroll).toBeDefined();
  });

  it("maps Årsresultat to canonical key 'net_income'", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const netIncome = result.statements[0].lineItems.find((i) => i.canonicalKey === "net_income");
    expect(netIncome).toBeDefined();
  });

  it("detects current and previous year columns", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const years = [...new Set(result.statements[0].lineItems.map((i) => i.year))];
    expect(years).toContain(2024);
    expect(years).toContain(2023);
  });

  it("parses negative values correctly (parenthesis and trailing dash)", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const payroll = result.statements[0].lineItems.filter((i) => i.canonicalKey === "payroll_expense");
    // Both years should be NEGATIVE
    for (const item of payroll) {
      expect(item.sign).toBe("NEGATIVE");
      expect(item.value.startsWith("-")).toBe(true);
    }
  });

  it("preserves large integer strings without Number()", () => {
    const table = makeIncomeTable({
      rows: [
        {
          rowIndex: 0,
          label: "Salgsinntekter",
          normalizedLabel: "salgsinntekter",
          cells: [
            { columnIndex: 1, text: "9007199254740993", normalizedText: "9007199254740993", numericValue: null, confidence: null },
          ],
        },
      ],
      columns: [{ columnIndex: 1, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true }],
    });
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const item = result.statements[0]?.lineItems[0];
    expect(item?.value).toBe("9007199254740993");
    expect(typeof item?.value).toBe("string");
  });

  it("keeps unmapped rows with warnings instead of dropping silently", () => {
    const table = makeIncomeTable({
      rows: [
        {
          rowIndex: 0,
          label: "Mystisk post som ikke finnes",
          normalizedLabel: "mystisk post som ikke finnes",
          cells: [
            { columnIndex: 1, text: "12345", normalizedText: "12345", numericValue: null, confidence: null },
          ],
        },
      ],
    });
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const unmapped = result.statements[0]?.lineItems.filter((i) => !i.canonicalKey) ?? [];
    expect(unmapped.length).toBeGreaterThan(0);
    expect(unmapped[0].warnings.some((w) => w.includes("canonical"))).toBe(true);
  });
});

// ---- extractUnifiedFinancialStatements — balance sheet ----------------------

describe("extractUnifiedFinancialStatements — balance sheet", () => {
  it("extracts balance sheet rows", () => {
    const doc = makeDocWithTable(makeBalanceTable());
    const result = extractUnifiedFinancialStatements(doc);
    expect(result.statements.some((s) => s.kind === "BALANCE_SHEET")).toBe(true);
  });

  it("maps Sum eiendeler to canonical key 'total_assets'", () => {
    const doc = makeDocWithTable(makeBalanceTable());
    const result = extractUnifiedFinancialStatements(doc);
    const stmt = result.statements.find((s) => s.kind === "BALANCE_SHEET");
    const ta = stmt?.lineItems.find((i) => i.canonicalKey === "total_assets");
    expect(ta).toBeDefined();
  });

  it("maps Sum egenkapital og gjeld to 'total_equity_and_liabilities'", () => {
    const doc = makeDocWithTable(makeBalanceTable());
    const result = extractUnifiedFinancialStatements(doc);
    const stmt = result.statements.find((s) => s.kind === "BALANCE_SHEET");
    const tel = stmt?.lineItems.find((i) => i.canonicalKey === "total_equity_and_liabilities");
    expect(tel).toBeDefined();
  });
});

// ---- Note reference column --------------------------------------------------

describe("note reference column handling", () => {
  it("ignores a column labeled 'Note' as a year column", () => {
    const table: UnifiedParserTable = {
      tableId: "t-with-note",
      role: "INCOME_STATEMENT",
      pageNumber: 2,
      blockIds: [],
      title: "Resultatregnskap",
      columns: [
        { columnIndex: 1, text: "Note", normalizedText: "note", year: null, isAmountColumn: false },
        { columnIndex: 2, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true },
      ],
      rows: [
        {
          rowIndex: 0,
          label: "Salgsinntekter",
          normalizedLabel: "salgsinntekter",
          cells: [
            { columnIndex: 1, text: "3", normalizedText: "3", numericValue: null, confidence: null },
            { columnIndex: 2, text: "500.000", normalizedText: "500.000", numericValue: null, confidence: null },
          ],
        },
      ],
      confidence: null,
      warnings: [],
    };
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const items = result.statements[0]?.lineItems ?? [];
    // Should only have 1 item (from column 2), not 2 (not from the Note column)
    expect(items).toHaveLength(1);
    expect(items[0].year).toBe(2024);
  });
});

// ---- Unit scale detection ---------------------------------------------------

describe("unit scale detection", () => {
  it("detects thousands scale from table title", () => {
    const table = makeIncomeTable({ title: "Resultatregnskap (beløp i NOK 1 000)" });
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const items = result.statements[0]?.lineItems ?? [];
    const scaledItems = items.filter((i) => i.unitScale === "THOUSANDS");
    expect(scaledItems.length).toBeGreaterThan(0);
  });

  it("returns UNKNOWN scale when title has no scale hint", () => {
    const table = makeIncomeTable({ title: "Resultatregnskap" });
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const items = result.statements[0]?.lineItems ?? [];
    // All items should have UNKNOWN scale (no explicit hint in plain title)
    const unknownItems = items.filter((i) => i.unitScale === "UNKNOWN");
    expect(unknownItems.length).toBeGreaterThan(0);
  });
});

// ---- Safety flags -----------------------------------------------------------

describe("safety flags", () => {
  it("always sets all safety flags to false/true correctly", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    expect(result.safety.canUseForProductionRouting).toBe(false);
    expect(result.safety.productionRoutingChanged).toBe(false);
    expect(result.safety.productionFactsMutated).toBe(false);
    expect(result.safety.publishAffected).toBe(false);
    expect(result.safety.shadowOnly).toBe(true);
  });

  it("throws if source document has canUseForProductionRouting=true", () => {
    const doc = makeEmptyDoc();
    (doc.safety as Record<string, unknown>).canUseForProductionRouting = true;
    expect(() => extractUnifiedFinancialStatements(doc)).toThrow(
      "canUseForProductionRouting=false",
    );
  });
});

// ---- No NaN/Infinity --------------------------------------------------------

describe("no NaN or Infinity", () => {
  it("does not produce NaN in confidence values", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    for (const stmt of result.statements) {
      expect(Number.isFinite(stmt.confidence)).toBe(true);
      for (const item of stmt.lineItems) {
        expect(Number.isFinite(item.confidence)).toBe(true);
      }
    }
  });
});

// ---- validateUnifiedFinancialStatements -------------------------------------

describe("validateUnifiedFinancialStatements", () => {
  it("passes for a balanced balance sheet", () => {
    const doc = makeDocWithTable(makeBalanceTable());
    const result = extractUnifiedFinancialStatements(doc);
    const validation = validateUnifiedFinancialStatements(result);
    // Balance sheet should pass (assets = equity+liabilities in fixture)
    const bsIssues = validation.issues.filter(
      (i) => i.code === "BALANCE_SHEET_EQUATION_MISMATCH",
    );
    expect(bsIssues).toHaveLength(0);
  });

  it("warns when balance sheet equation does not balance", () => {
    const table: UnifiedParserTable = {
      ...makeBalanceTable(),
      tableId: "t-unbalanced",
      rows: [
        {
          rowIndex: 0,
          label: "Sum eiendeler",
          normalizedLabel: "sum eiendeler",
          cells: [
            { columnIndex: 1, text: "5.000.000", normalizedText: "5.000.000", numericValue: null, confidence: null },
          ],
        },
        {
          rowIndex: 1,
          label: "Sum egenkapital og gjeld",
          normalizedLabel: "sum egenkapital og gjeld",
          cells: [
            // 4.000.000 ≠ 5.000.000 → should warn
            { columnIndex: 1, text: "4.000.000", normalizedText: "4.000.000", numericValue: null, confidence: null },
          ],
        },
      ],
      columns: [{ columnIndex: 1, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true }],
    };
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const validation = validateUnifiedFinancialStatements(result);
    const mismatch = validation.issues.find(
      (i) => i.code === "BALANCE_SHEET_EQUATION_MISMATCH",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("WARNING");
  });

  it("warns on duplicate canonical key in same statement+year", () => {
    const table: UnifiedParserTable = {
      ...makeIncomeTable(),
      tableId: "t-duplicate",
      rows: [
        {
          rowIndex: 0,
          label: "Salgsinntekter",
          normalizedLabel: "salgsinntekter",
          cells: [{ columnIndex: 1, text: "100", normalizedText: "100", numericValue: null, confidence: null }],
        },
        {
          rowIndex: 1,
          label: "Salgsinntekter",
          normalizedLabel: "salgsinntekter",
          cells: [{ columnIndex: 1, text: "200", normalizedText: "200", numericValue: null, confidence: null }],
        },
      ],
      columns: [{ columnIndex: 1, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true }],
    };
    const doc = makeDocWithTable(table);
    const result = extractUnifiedFinancialStatements(doc);
    const validation = validateUnifiedFinancialStatements(result);
    const dup = validation.issues.find((i) => i.code === "DUPLICATE_CANONICAL_KEY");
    expect(dup).toBeDefined();
  });

  it("warns on mixed unit scales within a statement", () => {
    // Create two tables with different scales that both map to INCOME_STATEMENT
    const t1: UnifiedParserTable = {
      ...makeIncomeTable(),
      tableId: "t-thousands",
      title: "Resultatregnskap (beløp i NOK 1 000)",
    };
    const t2: UnifiedParserTable = {
      tableId: "t-ones",
      role: "INCOME_STATEMENT",
      pageNumber: 5,
      blockIds: [],
      title: "Resultatregnskap",
      columns: [{ columnIndex: 1, text: "2024", normalizedText: "2024", year: 2024, isAmountColumn: true }],
      rows: [
        {
          rowIndex: 0,
          label: "Annen driftsinntekt",
          normalizedLabel: "annen driftsinntekt",
          cells: [{ columnIndex: 1, text: "50000", normalizedText: "50000", numericValue: null, confidence: null }],
        },
      ],
      confidence: null,
      warnings: [],
    };
    const doc = makeEmptyDoc();
    doc.tables.push(t1, t2);
    const result = extractUnifiedFinancialStatements(doc);
    const validation = validateUnifiedFinancialStatements(result);
    const mixedIssue = validation.issues.find((i) => i.code === "MIXED_UNIT_SCALE");
    expect(mixedIssue).toBeDefined();
  });
});

// ---- validateUnifiedFinancialStatementExtractionResult ----------------------

describe("validateUnifiedFinancialStatementExtractionResult", () => {
  it("validates a correct extraction result", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const { valid, issues } = validateUnifiedFinancialStatementExtractionResult(result);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("rejects result where safety.canUseForProductionRouting=true", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    (result.safety as Record<string, unknown>).canUseForProductionRouting = true;
    const { valid, issues } = validateUnifiedFinancialStatementExtractionResult(result);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("canUseForProductionRouting"))).toBe(true);
  });

  it("rejects result where a line item has value as number type", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    if (result.statements[0]?.lineItems[0]) {
      (result.statements[0].lineItems[0] as Record<string, unknown>).value = 12345;
    }
    const { valid, issues } = validateUnifiedFinancialStatementExtractionResult(result);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("must be string"))).toBe(true);
  });
});

// ---- Serialization ----------------------------------------------------------

describe("serializeUnifiedFinancialStatementExtractionResultAsJson", () => {
  it("produces valid JSON that is parseable", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const json = serializeUnifiedFinancialStatementExtractionResultAsJson(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("does not include NaN or Infinity in JSON", () => {
    const doc = makeDocWithTable(makeIncomeTable());
    const result = extractUnifiedFinancialStatements(doc);
    const json = serializeUnifiedFinancialStatementExtractionResultAsJson(result);
    expect(json).not.toContain("NaN");
    expect(json).not.toContain("Infinity");
  });
});
