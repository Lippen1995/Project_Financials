import { describe, expect, it } from "vitest";

import {
  isAbovePublicationThreshold,
  summarizeBoardReportBatch,
  type BoardReportBatchItem,
} from "@/server/batch/board-report-batch";

function item(status: BoardReportBatchItem["status"]): BoardReportBatchItem {
  return {
    rank: 1,
    companyId: "company-1",
    orgNumber: "974760673",
    companyName: "Company",
    revenue: "1",
    filingId: "filing-1",
    fiscalYear: 2025,
    discoveredAt: "2026-07-15T00:00:00.000Z",
    status,
    attempts: 1,
    extractionId: null,
    extractionStatus: null,
    confidence: null,
    pageRanges: [],
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

describe("board report batch", () => {
  it("uses a strict publication threshold", () => {
    expect(isAbovePublicationThreshold(0.9, 0.9)).toBe(false);
    expect(isAbovePublicationThreshold(0.900_001, 0.9)).toBe(true);
  });

  it("summarizes terminal and pending items", () => {
    const summary = summarizeBoardReportBatch([
      item("PUBLISHED"),
      item("WITHHELD"),
      item("NOT_FOUND"),
      item("FAILED"),
      item("PENDING"),
    ]);
    expect(summary).toMatchObject({
      total: 5,
      completed: 4,
      PUBLISHED: 1,
      WITHHELD: 1,
      NOT_FOUND: 1,
      FAILED: 1,
      PENDING: 1,
    });
  });
});
