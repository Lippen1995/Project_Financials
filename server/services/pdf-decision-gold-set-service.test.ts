import {
  PdfDecisionGoldSetReason,
  PdfDecisionGoldSetStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PdfDecisionGoldSetItemRecord } from "@/server/persistence/pdf-decision-gold-set-repository";
import type { PdfDecisionShadowDocument } from "./annual-report-pdf-decision-shadow-evaluation";
import {
  createGoldSetItemFromShadowDocument,
  listPdfDecisionGoldSet,
  PdfDecisionGoldSetValidationError,
  removePdfDecisionGoldSetItem,
  upsertPdfDecisionGoldSetItem,
} from "./pdf-decision-gold-set-service";

vi.mock("@/server/persistence/pdf-decision-gold-set-repository", () => ({
  deletePdfDecisionGoldSetItem: vi.fn(),
  getPdfDecisionGoldSetItemByFilingId: vi.fn(),
  listPdfDecisionGoldSetItems: vi.fn(),
  upsertPdfDecisionGoldSetItem: vi.fn(),
}));

import {
  deletePdfDecisionGoldSetItem,
  listPdfDecisionGoldSetItems,
  upsertPdfDecisionGoldSetItem as upsertPdfDecisionGoldSetItemRecord,
} from "@/server/persistence/pdf-decision-gold-set-repository";

function makeRecord(
  overrides: Partial<PdfDecisionGoldSetItemRecord> = {},
): PdfDecisionGoldSetItemRecord {
  return {
    id: "gold-1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    status: PdfDecisionGoldSetStatus.CANDIDATE,
    reason: PdfDecisionGoldSetReason.REPRESENTATIVE_SAMPLE,
    note: null,
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.88,
    outcome: "PUBLISHED",
    source: "ADMIN",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeShadowDocument(
  overrides: Partial<PdfDecisionShadowDocument> = {},
): PdfDecisionShadowDocument {
  return {
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    decisionPhase: "post_validation",
    decisionRoute: "MANUAL_REVIEW",
    riskLevel: "LOW",
    confidenceScore: 0.91,
    manualReviewReasons: [],
    reasons: ["Reliable text"],
    qualityRisk: "LOW",
    recommendedRouteHint: "TEXT_LAYER",
    parserRiskReasons: [],
    extractionWarnings: [],
    hasStructuredDocument: true,
    hasPdfDecision: true,
    hasPostValidationDecision: true,
    filingStatus: "MANUAL_REVIEW",
    extractionRunStatus: "COMPLETED",
    validationScore: 0.7,
    blockingRuleCodes: [],
    warningRuleCodes: [],
    reviewStatus: "PENDING_REVIEW",
    latestReviewDecisionType: null,
    reviewDecisionCount: 0,
    trainingLabelCount: 0,
    outcome: "MANUAL_REVIEW_PENDING",
    goldSet: null,
    ...overrides,
  };
}

describe("pdf decision gold-set service", () => {
  beforeEach(() => {
    vi.mocked(deletePdfDecisionGoldSetItem).mockReset();
    vi.mocked(listPdfDecisionGoldSetItems).mockReset();
    vi.mocked(upsertPdfDecisionGoldSetItemRecord).mockReset();
  });

  it("lists JSON-safe gold-set records", async () => {
    vi.mocked(listPdfDecisionGoldSetItems).mockResolvedValue([
      makeRecord({ status: PdfDecisionGoldSetStatus.APPROVED }),
    ]);

    const result = await listPdfDecisionGoldSet({ status: "APPROVED", limit: 20 });

    expect(listPdfDecisionGoldSetItems).toHaveBeenCalledWith({
      status: PdfDecisionGoldSetStatus.APPROVED,
      limit: 20,
      orgNumber: undefined,
      fiscalYear: undefined,
    });
    expect(result[0]).toMatchObject({
      filingId: "filing-1",
      status: PdfDecisionGoldSetStatus.APPROVED,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("validates and persists expected upsert fields", async () => {
    vi.mocked(upsertPdfDecisionGoldSetItemRecord).mockResolvedValue(
      makeRecord({ status: PdfDecisionGoldSetStatus.APPROVED }),
    );

    const result = await upsertPdfDecisionGoldSetItem({
      filingId: "filing-1",
      extractionRunId: "run-1",
      orgNumber: "928846466",
      fiscalYear: 2024,
      status: "APPROVED",
      reason: "LOW_RISK_FAILED",
      note: "Good failure case",
      decisionRoute: "TEXT_LAYER",
      riskLevel: "LOW",
      confidenceScore: 0.5,
      outcome: "FAILED",
      userId: "user-1",
    });

    expect(upsertPdfDecisionGoldSetItemRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        filingId: "filing-1",
        status: PdfDecisionGoldSetStatus.APPROVED,
        reason: PdfDecisionGoldSetReason.LOW_RISK_FAILED,
        note: "Good failure case",
        userId: "user-1",
      }),
    );
    expect(result.status).toBe(PdfDecisionGoldSetStatus.APPROVED);
  });

  it("supports approve and exclude transitions", async () => {
    vi.mocked(upsertPdfDecisionGoldSetItemRecord)
      .mockResolvedValueOnce(makeRecord({ status: PdfDecisionGoldSetStatus.APPROVED }))
      .mockResolvedValueOnce(makeRecord({ status: PdfDecisionGoldSetStatus.EXCLUDED }));

    await upsertPdfDecisionGoldSetItem({
      filingId: "filing-1",
      status: "APPROVED",
      reason: "REPRESENTATIVE_SAMPLE",
    });
    await upsertPdfDecisionGoldSetItem({
      filingId: "filing-1",
      status: "EXCLUDED",
      reason: "OTHER",
    });

    expect(upsertPdfDecisionGoldSetItemRecord).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: PdfDecisionGoldSetStatus.APPROVED }),
    );
    expect(upsertPdfDecisionGoldSetItemRecord).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: PdfDecisionGoldSetStatus.EXCLUDED }),
    );
  });

  it("delete removes item by filing id", async () => {
    vi.mocked(deletePdfDecisionGoldSetItem).mockResolvedValue();

    await removePdfDecisionGoldSetItem("filing-1");

    expect(deletePdfDecisionGoldSetItem).toHaveBeenCalledWith("filing-1");
  });

  it("rejects invalid status, invalid confidence and long notes", async () => {
    await expect(
      upsertPdfDecisionGoldSetItem({
        filingId: "filing-1",
        status: "BAD",
        reason: "OTHER",
      }),
    ).rejects.toBeInstanceOf(PdfDecisionGoldSetValidationError);

    await expect(
      upsertPdfDecisionGoldSetItem({
        filingId: "filing-1",
        status: "CANDIDATE",
        reason: "OTHER",
        confidenceScore: 1.5,
      }),
    ).rejects.toThrow("confidenceScore");

    await expect(
      upsertPdfDecisionGoldSetItem({
        filingId: "filing-1",
        status: "CANDIDATE",
        reason: "OTHER",
        note: "x".repeat(2001),
      }),
    ).rejects.toThrow("2000");
  });

  it("creates a prefilled item from a shadow document", () => {
    const item = createGoldSetItemFromShadowDocument(makeShadowDocument(), {
      status: "CANDIDATE",
      note: "Candidate from analytics",
      userId: "user-1",
    });

    expect(item).toMatchObject({
      filingId: "filing-1",
      extractionRunId: "run-1",
      orgNumber: "928846466",
      fiscalYear: 2024,
      status: PdfDecisionGoldSetStatus.CANDIDATE,
      reason: PdfDecisionGoldSetReason.LOW_RISK_FAILED,
      note: "Candidate from analytics",
      decisionRoute: "MANUAL_REVIEW",
      riskLevel: "LOW",
      confidenceScore: 0.91,
      outcome: "MANUAL_REVIEW_PENDING",
      userId: "user-1",
    });
  });
});
