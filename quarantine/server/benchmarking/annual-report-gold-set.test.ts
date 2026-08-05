import { describe, expect, it } from "vitest";

import {
  parseAnnualReportGoldSetManifest,
  validateAnnualReportGoldSetManifest,
} from "@/server/benchmarking/annual-report-gold-set";

describe("annual-report-gold-set", () => {
  it("validates duplicate filing ids and missing coverage", () => {
    const manifest = parseAnnualReportGoldSetManifest({
      version: "annual-report-go-live-gold-set-v1",
      name: "gold-set",
      generatedAt: "2026-05-10T00:00:00.000Z",
      entries: [
        {
          orgNumber: "123456789",
          companyName: "Example AS",
          accountingYear: 2024,
          filingId: "filing-1",
          artifactDocumentReference: "filing-1.pdf",
          expectedTags: ["digital_simple"],
          evidenceType: "persisted_artifact",
          reasonForInclusion: "Representative digital case.",
          knownRisks: [],
        },
        {
          orgNumber: "123456789",
          companyName: "Example AS",
          accountingYear: 2024,
          filingId: "filing-1",
          artifactDocumentReference: "filing-1-dup.pdf",
          expectedTags: ["scan_or_ocr"],
          evidenceType: "persisted_artifact",
          reasonForInclusion: "Duplicate on purpose for validation.",
          knownRisks: [],
        },
      ],
    });

    const validation = validateAnnualReportGoldSetManifest(manifest);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((error) => error.includes("Duplicate filingId"))).toBe(true);
    expect(validation.warnings.some((warning) => warning.includes("manual_review_expected"))).toBe(true);
  });
});
