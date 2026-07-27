import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  requireFinancialReviewer: vi.fn(),
};

const activeLearning = {
  listPdfDecisionActiveLearningQueue: vi.fn(),
};

vi.mock("@/lib/admin-auth", () => ({
  requireFinancialReviewer: auth.requireFinancialReviewer,
}));

vi.mock("@/server/services/pdf-decision-active-learning-service", () => ({
  listPdfDecisionActiveLearningQueue: activeLearning.listPdfDecisionActiveLearningQueue,
}));

describe("GET /api/admin/pdf-decision-active-learning", () => {
  beforeEach(() => {
    auth.requireFinancialReviewer.mockReset();
    activeLearning.listPdfDecisionActiveLearningQueue.mockReset();
    auth.requireFinancialReviewer.mockResolvedValue({
      user: { id: "reviewer-1" },
      error: null,
    });
  });

  it("rejects an organization number with an invalid MOD11 control digit", async () => {
    const { GET } = await import("@/app/api/admin/pdf-decision-active-learning/route");
    const request = new NextRequest(
      "http://localhost/api/admin/pdf-decision-active-learning?orgNumber=928846467",
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(activeLearning.listPdfDecisionActiveLearningQueue).not.toHaveBeenCalled();
  });
});
