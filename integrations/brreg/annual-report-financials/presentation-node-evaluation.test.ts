import { describe, expect, it } from "vitest";

import {
  evaluateNodeMatches,
  type NodeEvalConfig,
} from "@/integrations/brreg/annual-report-financials/presentation-node-evaluation";

function node(keys: NodeEvalConfig["keys"], label = "Node"): NodeEvalConfig {
  return { nodeId: "n1", nodeLabel: label, keys };
}

describe("evaluateNodeMatches", () => {
  it("returns no deviations when there are no MATCH keys", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "cogs", valueMode: "NOMINAL", operation: "SUBTRACT" },
        ]),
      ],
      facts: new Map([
        ["revenue", 1000],
        ["cogs", 400],
      ]),
    });
    expect(result).toEqual([]);
  });

  it("passes when the operand fold matches the MATCH key within tolerance", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "cogs", valueMode: "NOMINAL", operation: "SUBTRACT" },
          { metricKey: "gross_profit", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([
        ["revenue", 1000],
        ["cogs", 400],
        ["gross_profit", 605], // computed = 600, 0.83% off → within 1%
      ]),
    });
    expect(result).toEqual([]);
  });

  it("flags a deviation beyond the 1% relative tolerance", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "cogs", valueMode: "NOMINAL", operation: "SUBTRACT" },
          { metricKey: "gross_profit", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([
        ["revenue", 1000],
        ["cogs", 400],
        ["gross_profit", 700], // computed = 600, 14% off
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].matchMetricKey).toBe("gross_profit");
    expect(result[0].computedValue).toBe(600);
    expect(result[0].matchValue).toBe(700);
  });

  it("absorbs opposite sign conventions via ABSOLUTE value mode", () => {
    // Company books costs as a positive number; ABSOLUTE makes the SUBTRACT
    // operand behave the same as a negatively-signed one.
    const negative = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "cost", valueMode: "ABSOLUTE", operation: "SUBTRACT" },
          { metricKey: "op_profit", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([
        ["revenue", 1000],
        ["cost", -300], // booked negative; abs → 300
        ["op_profit", 700],
      ]),
    });
    expect(negative).toEqual([]);
  });

  it("skips the check when a MATCH fact is missing (no false flag)", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "total", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([["revenue", 1000]]), // no "total"
    });
    expect(result).toEqual([]);
  });

  it("skips when operand data is missing so nothing can be computed", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "total", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([["total", 1000]]), // no operands present
    });
    expect(result).toEqual([]);
  });

  it("guards divide-by-zero by skipping rather than flagging", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "a", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "b", valueMode: "NOMINAL", operation: "DIVIDE" },
          { metricKey: "ratio", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([
        ["a", 100],
        ["b", 0],
        ["ratio", 5],
      ]),
    });
    expect(result).toEqual([]);
  });

  it("supports multiply/divide folds", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "a", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "b", valueMode: "NOMINAL", operation: "MULTIPLY" },
          { metricKey: "product", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([
        ["a", 12],
        ["b", 5],
        ["product", 100], // computed = 60 → flagged
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBe(60);
  });

  it("does not flag tiny near-zero deviations below the absolute floor", () => {
    const result = evaluateNodeMatches({
      nodes: [
        node([
          { metricKey: "a", valueMode: "NOMINAL", operation: "ADD" },
          { metricKey: "b", valueMode: "NOMINAL", operation: "SUBTRACT" },
          { metricKey: "zero", valueMode: "NOMINAL", operation: "MATCH" },
        ]),
      ],
      facts: new Map([
        ["a", 100],
        ["b", 100], // computed = 0
        ["zero", 0.5], // within the 1 NOK floor
      ]),
    });
    expect(result).toEqual([]);
  });

  // ── SUBTOTAL nodes: value folded from operand nodes, checked vs MATCH key ──

  const ebitGraph = (overrides: Partial<NodeEvalConfig> = {}): NodeEvalConfig[] => [
    {
      nodeId: "rev",
      nodeLabel: "Totale inntekter",
      kind: "LINE",
      keys: [{ metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" }],
    },
    {
      nodeId: "cost",
      nodeLabel: "Totale driftskostnader",
      kind: "LINE",
      keys: [{ metricKey: "opex", valueMode: "NOMINAL", operation: "ADD" }],
    },
    {
      nodeId: "ebit",
      nodeLabel: "Driftsresultat (EBIT)",
      kind: "SUBTOTAL",
      keys: [{ metricKey: "operating_profit", valueMode: "NOMINAL", operation: "MATCH" }],
      operands: [
        { sourceNodeId: "rev", operation: "ADD" },
        { sourceNodeId: "cost", operation: "SUBTRACT" },
      ],
      ...overrides,
    },
  ];

  it("folds a SUBTOTAL from its operand nodes and matches its MATCH key", () => {
    const result = evaluateNodeMatches({
      nodes: ebitGraph(),
      facts: new Map([
        ["revenue", 1000],
        ["opex", 400], // computed EBIT = 1000 - 400 = 600
        ["operating_profit", 603], // 0.5% off → within 1%
      ]),
    });
    expect(result).toEqual([]);
  });

  it("flags a SUBTOTAL whose operand-node fold deviates from its MATCH key", () => {
    const result = evaluateNodeMatches({
      nodes: ebitGraph(),
      facts: new Map([
        ["revenue", 1000],
        ["opex", 400], // computed EBIT = 600
        ["operating_profit", 800], // 25% off
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].nodeLabel).toBe("Driftsresultat (EBIT)");
    expect(result[0].matchMetricKey).toBe("operating_profit");
    expect(result[0].computedValue).toBe(600);
    expect(result[0].matchValue).toBe(800);
  });

  it("skips a SUBTOTAL when no operand node can be computed (no false flag)", () => {
    const result = evaluateNodeMatches({
      nodes: ebitGraph(),
      facts: new Map([["operating_profit", 600]]), // revenue/opex missing
    });
    expect(result).toEqual([]);
  });

  it("resolves nested SUBTOTALs recursively", () => {
    const nodes: NodeEvalConfig[] = [
      {
        nodeId: "rev",
        nodeLabel: "Inntekter",
        kind: "LINE",
        keys: [{ metricKey: "revenue", valueMode: "NOMINAL", operation: "ADD" }],
      },
      {
        nodeId: "cogs",
        nodeLabel: "Varekostnad",
        kind: "LINE",
        keys: [{ metricKey: "cogs", valueMode: "NOMINAL", operation: "ADD" }],
      },
      {
        nodeId: "opex",
        nodeLabel: "Driftskostnader",
        kind: "LINE",
        keys: [{ metricKey: "opex", valueMode: "NOMINAL", operation: "ADD" }],
      },
      {
        nodeId: "gross",
        nodeLabel: "Bruttofortjeneste",
        kind: "SUBTOTAL",
        keys: [],
        operands: [
          { sourceNodeId: "rev", operation: "ADD" },
          { sourceNodeId: "cogs", operation: "SUBTRACT" },
        ],
      },
      {
        nodeId: "ebit",
        nodeLabel: "EBIT",
        kind: "SUBTOTAL",
        keys: [{ metricKey: "operating_profit", valueMode: "NOMINAL", operation: "MATCH" }],
        operands: [
          { sourceNodeId: "gross", operation: "ADD" }, // 1000 - 300 = 700
          { sourceNodeId: "opex", operation: "SUBTRACT" }, // 700 - 200 = 500
        ],
      },
    ];
    const result = evaluateNodeMatches({
      nodes,
      facts: new Map([
        ["revenue", 1000],
        ["cogs", 300],
        ["opex", 200],
        ["operating_profit", 800], // computed = 500 → flagged
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].nodeLabel).toBe("EBIT");
    expect(result[0].computedValue).toBe(500);
  });
});
