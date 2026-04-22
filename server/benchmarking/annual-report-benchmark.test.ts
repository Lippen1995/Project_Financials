import { describe, expect, it } from "vitest";

import pairedCase from "@/benchmarks/annual-report-golden/cases/paired-digital-happy-path.json";
import {
  AnnualReportBenchmarkCase,
  renderAnnualReportBenchmarkMarkdown,
  runAnnualReportBenchmarkCase,
  summarizeAnnualReportBenchmarkRun,
} from "@/server/benchmarking/annual-report-benchmark";

describe("annual-report-benchmark", () => {
  it("runs a paired benchmark case and produces a differential summary", async () => {
    const result = await runAnnualReportBenchmarkCase(
      pairedCase as AnnualReportBenchmarkCase,
    );

    expect(result.status).toBe("completed");
    expect(result.legacy?.shouldPublish).toBe(true);
    expect(result.openDataLoader?.shouldPublish).toBe(true);
    expect(result.comparison).toBeTruthy();
    expect(result.comparison?.materialDisagreement).toBe(true);
    expect(result.comparison?.publishDecisionMismatch).toBe(false);
  });

  it("renders a readable markdown summary from benchmark results", () => {
    const summary = summarizeAnnualReportBenchmarkRun({
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "1.8.0_241",
        javaMajorVersion: 8,
        localOpenDataLoaderReady: false,
      },
      cases: [
        {
          caseId: "case-1",
          name: "Case 1",
          fiscalYear: 2024,
          mode: "expected_and_differential",
          status: "completed",
          errors: [],
          legacy: {
            engine: "LEGACY",
            executionSource: "document_fixture",
            mode: "legacy",
            runtimeMs: 20,
            confidenceScore: 0.9,
            validationScore: 0.95,
            shouldPublish: true,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: [],
              detail: "fixture",
            },
            classifications: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            snapshot: {
              engine: "LEGACY",
              mode: "legacy",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.9,
              durationMs: 20,
            },
            expectedEvaluation: {
              statementPageAccuracy: 1,
              unitScaleAccuracy: 1,
              factAccuracy: 1,
              publishOutcomeMatch: true,
              matchedIssueCodes: [],
              missingIssueCodes: [],
              mismatches: [],
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "captured_normalized_json",
            mode: "local",
            runtimeMs: 10,
            confidenceScore: 0.9,
            validationScore: 0.95,
            shouldPublish: true,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: ["DOCUMENT_JSON"],
              detail: "captured",
            },
            classifications: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            snapshot: {
              engine: "OPENDATALOADER",
              mode: "local",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.9,
              durationMs: 10,
            },
            expectedEvaluation: {
              statementPageAccuracy: 1,
              unitScaleAccuracy: 1,
              factAccuracy: 1,
              publishOutcomeMatch: true,
              matchedIssueCodes: [],
              missingIssueCodes: [],
              mismatches: [],
            },
            routeReason: "captured-normalized-json",
          },
          comparison: {
            primaryEngine: "LEGACY",
            shadowEngine: "OPENDATALOADER",
            primaryShouldPublish: true,
            shadowShouldPublish: true,
            publishDecisionMismatch: false,
            classificationDifferences: [],
            unitScaleDifferences: [],
            factDifferences: [],
            blockingRuleDifferences: {
              onlyInPrimary: [],
              onlyInShadow: [],
            },
            durationMs: {
              primary: 20,
              shadow: 10,
            },
            materialDisagreement: false,
          },
        },
      ],
    });

    const markdown = renderAnnualReportBenchmarkMarkdown({
      generatedAt: "2026-04-19T00:00:00.000Z",
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "1.8.0_241",
        javaMajorVersion: 8,
        localOpenDataLoaderReady: false,
      },
      cases: [],
      summary,
    });

    expect(summary.recommendation).toContain("shadow-only");
    expect(markdown).toContain("Annual-report benchmark");
    expect(markdown).toContain("shadow-only");
  });
});
