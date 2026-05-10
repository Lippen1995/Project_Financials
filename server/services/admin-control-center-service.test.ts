import { describe, expect, it } from "vitest";

import { buildAdminControlCenterModel } from "@/server/services/admin-control-center-service";

function makeRuntime() {
  return {
    packageInstalled: true,
    packageVersion: "2.2.1",
    java: {
      rawVersion: "17",
      majorVersion: 17,
      available: true,
      executablePath: "java",
      pathCandidates: ["java"],
      javaHomePath: null,
      discoveredCandidates: [],
    },
    localModeReady: true,
    hybridConfigured: false,
    localModeReason: "Ready",
    hybridModeReason: "Hybrid URL missing.",
    liveLocalBenchmarkReady: true,
    liveLocalBenchmarkReason: "Ready",
    liveHybridBenchmarkReady: false,
    liveHybridBenchmarkReason: "Hybrid URL missing.",
  };
}

describe("admin-control-center-service", () => {
  it("builds the two expected admin flows with their key routes", async () => {
    const model = await buildAdminControlCenterModel({
      getOverview: async () => ({
        parserVersion: "annual-report-pipeline-v4-opendataloader",
        metrics: {
          filings: [
            { status: "DISCOVERED", _count: { _all: 2 } },
            { status: "PUBLISHED", _count: { _all: 1 } },
            { status: "FAILED", _count: { _all: 1 } },
          ],
          runs: [{ status: "SUCCEEDED", _count: { _all: 3 } }],
          reviews: [{ status: "PENDING_REVIEW", _count: { _all: 2 } }],
          incompleteCoverageCount: 1,
        },
        reviewQueue: [],
        pendingFilings: [],
        dueCoverage: [],
      }) as never,
      listUnifiedConfidence: async () => ({
        items: [],
        total: 0,
        limit: 5,
        offset: 0,
        summary: { total: 0, PASS: 0, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
      }),
      inspectRuntime: async () => makeRuntime(),
      readLatestGoldSetRun: async () => null,
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    expect(model.title).toBe("Admin Control Center");
    expect(model.attentionTitle).toBe("Hva trenger oppmerksomhet nå?");
    expect(model.mainFlow.title).toBe("Fra årsrapport til tall i databasen");
    expect(model.mainFlow.nodes).toHaveLength(11);
    expect(model.goLiveFlow.title).toBe("Veien mot go-live for ny ekstraksjonsmotor");
    expect(model.goLiveFlow.nodes).toHaveLength(13);
    expect(model.mainFlow.nodes.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Rapport mottas",
        "Riktig dokument kobles til",
        "PDF-en kvalitetssjekkes",
        "Systemet velger lesemetode",
        "Tall og tekst hentes ut",
        "Resultatene sammenlignes",
        "Systemet vurderer kvaliteten",
        "Må rapporten kontrolleres manuelt?",
        "Manuell kontroll",
        "Godkjente tall lagres",
        "Tallene blir tilgjengelige i produktet",
      ]),
    );
    expect(model.goLiveFlow.nodes.map((item) => item.title)).toEqual(
      expect.arrayContaining([
        "Bygg representativt testsett",
        "Kjør shadow batch",
        "Gjennomfør manuell kontroll",
        "Juster terskler og regler",
        "Klassifiser feiltyper",
        "Rett de viktigste feilene",
        "Lag go/no-go-vurdering",
        "Kjør canary uten produksjonseffekt",
        "Aktiver routing bak feature flag",
        "Sikre publish gate",
        "Overvåkning, varsler og kill switch",
        "Begrenset go-live",
        "Gradvis utvidelse",
      ]),
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "manual-review")?.href).toBe(
      "/admin/annual-report-reviews",
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "pdf-quality")?.href).toBe(
      "/admin/pdf-parser-route-quality",
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "parser-choice")?.href).toBe(
      "/admin/pdf-parser-route-recommendation-v2",
    );
    expect(model.goLiveFlow.nodes.find((item) => item.key === "canary-no-effect")?.href).toBe(
      "/admin/pdf-parser-route-canary-preview",
    );
    expect(model.goLiveFlow.nodes.find((item) => item.key === "feature-flag")?.href).toBe(
      "/admin/pdf-parser-route-assignment-preview",
    );
    expect(model.mainFlow.nodes.find((item) => item.key === "artifact-linking")?.href).toBe(
      undefined,
    );
  });

  it("returns explicit unknown and empty states when run data is unavailable", async () => {
    const model = await buildAdminControlCenterModel({
      getOverview: async () => ({
        parserVersion: "annual-report-pipeline-v4-opendataloader",
        metrics: {
          filings: [],
          runs: [],
          reviews: [],
          incompleteCoverageCount: 0,
        },
        reviewQueue: [],
        pendingFilings: [],
        dueCoverage: [],
      }) as never,
      listUnifiedConfidence: async () => ({
        items: [],
        total: 0,
        limit: 5,
        offset: 0,
        summary: { total: 0, PASS: 0, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
      }),
      inspectRuntime: async () => makeRuntime(),
      readLatestGoldSetRun: async () => null,
      now: () => new Date("2026-05-10T12:00:00.000Z"),
    });

    expect(model.summaryCards.find((item) => item.key === "latest-shadow-batch")?.value).toBe(
      "Ingen data funnet",
    );
    expect(model.summaryCards.find((item) => item.key === "go-live-status")?.value).toBe(
      "Ukjent",
    );
    expect(model.attentionEmptyState).toBe(
      "Ingen åpne problemer funnet basert på tilgjengelige data.",
    );
    expect(model.attentionItems.some((item) => item.key === "shadow-missing")).toBe(true);
  });
});
