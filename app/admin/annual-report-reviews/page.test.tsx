import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/annual-report-review-service", () => ({
  listReviewQueue: vi.fn(async () => [
    {
      id: "review-1",
      status: "PENDING_REVIEW",
      company: {
        name: "Eksempelselskap AS",
        orgNumber: "123456789",
        slug: "eksempelselskap-as",
      },
      filing: {
        fiscalYear: 2024,
      },
      extractionRun: {
        confidenceScore: 0.74,
      },
      blockingRuleCodes: ["BS_TOTAL_BALANCES"],
      createdAt: "2026-05-10T12:00:00.000Z",
    },
  ]),
}));

describe("app/admin/annual-report-reviews/page", () => {
  it("still renders the existing review queue page", async () => {
    const pageModule = await import("@/app/admin/annual-report-reviews/page");
    const element = await pageModule.default({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Review-kø for årsrapporter");
    expect(html).toContain("Eksempelselskap AS");
    expect(html).toContain("Venter");
  });
});
