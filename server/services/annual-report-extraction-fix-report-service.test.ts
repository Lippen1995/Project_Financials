import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildAnnualReportExtractionFixReport,
  persistAnnualReportExtractionFixArtifacts,
  renderAnnualReportExtractionFixMarkdown,
} from "@/server/services/annual-report-extraction-fix-report-service";

describe("annual-report-extraction-fix-report-service", () => {
  it("builds a PR79 report from persisted benchmark and shadow-batch evidence", async () => {
    const files = new Map<string, string>([
      [
        path.join(process.cwd(), "output", "benchmarks", "annual-report-golden", "latest.json"),
        JSON.stringify({
          generatedAt: "2026-05-11T10:00:00.000Z",
          cases: [
            { documentTags: ["unit_scale_sensitive", "multi_page_balance"] },
            { documentTags: ["ocr_token_noise", "continuation_complex"] },
          ],
          summary: {
            differentialCases: 2,
            materialDisagreements: 1,
          },
        }),
      ],
      [
        path.join(process.cwd(), "output", "benchmarks", "annual-report-shadow-batches", "latest.json"),
        JSON.stringify({
          runtimeEnvironment: {
            liveHybridBenchmarkReady: false,
            liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
          },
          cases: [{ status: "skipped" }],
        }),
      ],
    ]);

    const deps = {
      now: () => new Date("2026-05-11T12:00:00.000Z"),
      readFile: async (filePath: string) => {
        const raw = files.get(String(filePath));
        if (!raw) {
          const error = new Error(`ENOENT: ${String(filePath)}`) as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        }
        return raw;
      },
      readLatestCalibrationReport: async () => null,
      readLatestTaxonomyReport: async () => null,
    };

    const report = await buildAnnualReportExtractionFixReport(deps);

    expect(report.version).toBe("annual-report-extraction-fix-report-v1");
    expect(report.targetedIssueClasses).toContain("UNIT_SCALE_MISMATCH");
    expect(report.targetedIssueClasses).toContain("MULTI_PAGE_BALANCE_ERROR");
    expect(report.targetedIssueClasses).toContain("OCR_TOKEN_NOISE");
    expect(report.baselineMetrics.find((item) => item.label === "Differential benchmark cases")?.before).toBe(2);
    expect(report.baselineMetrics.find((item) => item.label === "Material disagreements")?.before).toBe(1);
    expect(report.remainingBlockers).toContain("OPENDATALOADER_HYBRID_URL is not configured.");
    expect(report.status).toBe("POST_FIX_VALIDATION_PENDING");
  });

  it("renders markdown and persists latest outputs", async () => {
    const writes = new Map<string, string>();
    const report = await buildAnnualReportExtractionFixReport({
      now: () => new Date("2026-05-11T12:00:00.000Z"),
      readFile: async () => {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
      readLatestCalibrationReport: async () => null,
      readLatestTaxonomyReport: async () => null,
    });

    const markdown = renderAnnualReportExtractionFixMarkdown(report);
    expect(markdown).toContain("# PR79 extraction fix summary");
    expect(markdown).toContain("Targeted issue classes");

    await persistAnnualReportExtractionFixArtifacts(report, {
      mkdir: async () => undefined,
      writeFile: async (filePath, content) => {
        writes.set(String(filePath), String(content));
      },
    });

    expect(
      writes.has(
        path.join(
          process.cwd(),
          "output",
          "benchmarks",
          "annual-report-extraction-fixes",
          "latest.json",
        ),
      ),
    ).toBe(true);
    expect(
      writes.has(
        path.join(
          process.cwd(),
          "output",
          "benchmarks",
          "annual-report-extraction-fixes",
          "latest.md",
        ),
      ),
    ).toBe(true);
  });
});
