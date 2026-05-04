import { describe, expect, it } from "vitest";

import {
  buildPdfDecisionGoldSetSnapshot,
  parsePdfDecisionGoldSetSnapshotJson,
  PdfDecisionGoldSetSnapshotValidationError,
  validatePdfDecisionGoldSetSnapshot,
} from "./pdf-decision-gold-set-snapshot-service";

describe("pdf decision gold-set snapshot service", () => {
  it("builds a JSON-safe snapshot from gold-set items", () => {
    const snapshot = buildPdfDecisionGoldSetSnapshot([
      {
        filingId: "filing-1",
        extractionRunId: "run-1",
        orgNumber: "928846466",
        fiscalYear: 2024,
        decisionRoute: "TEXT_LAYER",
        riskLevel: "LOW",
        confidenceScore: 0.88,
        outcome: "PUBLISHED",
        reason: "REPRESENTATIVE_SAMPLE",
        note: "Stable sample",
      },
    ]);

    expect(snapshot).toMatchObject({
      version: "pdf-decision-gold-set-snapshot-v1",
      itemCount: 1,
      items: [
        {
          filingId: "filing-1",
          expectedRoute: "TEXT_LAYER",
          expectedRiskLevel: "LOW",
          expectedOutcome: "PUBLISHED",
          expectedConfidenceScore: 0.88,
          goldSetReason: "REPRESENTATIVE_SAMPLE",
          goldSetNote: "Stable sample",
        },
      ],
    });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("parses and validates a snapshot JSON payload", () => {
    const snapshot = buildPdfDecisionGoldSetSnapshot([
      {
        filingId: "filing-1",
        goldSetReason: "OTHER",
      },
    ]);

    const parsed = parsePdfDecisionGoldSetSnapshotJson(JSON.stringify(snapshot));

    expect(parsed.itemCount).toBe(1);
    expect(parsed.items[0].filingId).toBe("filing-1");
  });

  it("rejects invalid snapshot shape", () => {
    expect(() =>
      validatePdfDecisionGoldSetSnapshot({
        version: "pdf-decision-gold-set-snapshot-v1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        itemCount: 2,
        items: [{ filingId: "filing-1", goldSetReason: "OTHER" }],
      }),
    ).toThrow(PdfDecisionGoldSetSnapshotValidationError);

    expect(() =>
      validatePdfDecisionGoldSetSnapshot({
        version: "bad",
        generatedAt: "2026-01-01T00:00:00.000Z",
        itemCount: 0,
        items: [],
      }),
    ).toThrow("version");
  });

  it("rejects invalid confidence and manual review reasons", () => {
    expect(() =>
      validatePdfDecisionGoldSetSnapshot({
        version: "pdf-decision-gold-set-snapshot-v1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        itemCount: 1,
        items: [
          {
            filingId: "filing-1",
            goldSetReason: "OTHER",
            expectedConfidenceScore: 1.1,
          },
        ],
      }),
    ).toThrow("expectedConfidenceScore");

    expect(() =>
      validatePdfDecisionGoldSetSnapshot({
        version: "pdf-decision-gold-set-snapshot-v1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        itemCount: 1,
        items: [
          {
            filingId: "filing-1",
            goldSetReason: "OTHER",
            expectedManualReviewReasons: ["ok", 123],
          },
        ],
      }),
    ).toThrow("expectedManualReviewReasons");
  });
});
