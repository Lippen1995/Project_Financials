import { describe, expect, it } from "vitest";

import { answerNjordQuestion } from "@/server/distress/njord-assistant";
import { DistressCompanyRow, DistressModuleSectorRow } from "@/lib/types";

function buildRow(overrides: {
  name: string;
  orgNumber: string;
  status?: DistressCompanyRow["distress"]["status"];
  healthScore?: number | null;
  fixedAssets?: number | null;
  inventory?: number | null;
  equityRatio?: number | null;
  liquidityRatio?: number | null;
}): DistressCompanyRow {
  return {
    company: {
      orgNumber: overrides.orgNumber,
      slug: overrides.name.toLowerCase().replaceAll(" ", "-"),
      name: overrides.name,
      legalForm: "AS",
      status: "ACTIVE",
      industryCode: null,
      municipality: "Bergen",
      addresses: [],
    },
    distress: {
      status: overrides.status ?? "BANKRUPTCY",
      label: "Konkurs",
      statusStartedAt: new Date("2026-06-01"),
      statusObservedAt: new Date("2026-07-01"),
      daysInStatus: 45,
      lastAnnouncementPublishedAt: null,
      lastAnnouncementTitle: null,
    },
    sector: { code: "43", label: "Bygg og anlegg" },
    financials: {
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      lastReportedYear: 2025,
      revenue: 1_200_000,
      ebit: -340_000,
      netIncome: -400_000,
      equityRatio: overrides.equityRatio ?? -18,
      assets: 900_000,
      interestBearingDebt: 540_000_000,
      liquidityRatio: overrides.liquidityRatio ?? 0.31,
      fixedAssets: overrides.fixedAssets ?? 680_000_000,
      inventory: overrides.inventory ?? 240_000_000,
      revenueTrend: null,
    },
    distressScore: overrides.healthScore === null ? null : 100 - (overrides.healthScore ?? 9),
    healthScore: overrides.healthScore === undefined ? 9 : overrides.healthScore,
    scoreVersion: "distress-score-v1",
    dataCoverage: "FINANCIALS_AVAILABLE",
  };
}

const sectors: DistressModuleSectorRow[] = [
  { sectorCode: "43", sectorLabel: "Bygg og anlegg", companyCount: 12, bankruptcyCount: 7, avgHealthScore: 18, totalAssets: 900_000_000 },
  { sectorCode: "68", sectorLabel: "Eiendom", companyCount: 6, bankruptcyCount: 2, avgHealthScore: 40, totalAssets: 2_800_000_000 },
  { sectorCode: "62", sectorLabel: "IT", companyCount: 4, bankruptcyCount: 0, avgHealthScore: 62, totalAssets: 60_000_000 },
];

const rows = [
  buildRow({ name: "Bergen Infrastruktur AS", orgNumber: "944321008", healthScore: 9, fixedAssets: 680_000_000, inventory: 240_000_000 }),
  buildRow({ name: "Nordvest Entreprenør AS", orgNumber: "913664210", healthScore: 26, fixedAssets: 210_000_000, inventory: 90_000_000 }),
  buildRow({ name: "Datastrøm Norge AS", orgNumber: "920661338", healthScore: 45, fixedAssets: 20_000_000, inventory: 0 }),
];

describe("njord assistant", () => {
  it("ranks companies by realizable assets and refuses to call book value a realisation value", () => {
    const result = answerNjordQuestion({
      question: "Hvilke selskaper har verdier verdt å by på i et bo?",
      rows,
      sectors,
    });

    expect(result.intent).toBe("REALIZABLE_ASSETS");
    expect(result.answer).toContain("1. Bergen Infrastruktur AS");
    expect(result.answer).toContain("2. Nordvest Entreprenør AS");
    expect(result.answer).toContain("bokført verdi ikke er realisasjonsverdi");
  });

  it("ranks sectors by bankruptcy count", () => {
    const result = answerNjordQuestion({ question: "Hvor er konkurspresset størst akkurat nå?", rows, sectors });

    expect(result.intent).toBe("BANKRUPTCY_PRESSURE");
    expect(result.answer).toContain("1. Bygg og anlegg");
    expect(result.answer).not.toContain("IT");
  });

  it("ranks counterparty risk from weakest health and flags unscored companies", () => {
    const withUnscored = [...rows, buildRow({ name: "Ukjent Regnskap AS", orgNumber: "999999999", healthScore: null })];
    const result = answerNjordQuestion({ question: "Er noen av disse en risikabel motpart å handle med?", rows: withUnscored, sectors });

    expect(result.intent).toBe("COUNTERPARTY_RISK");
    expect(result.answer).toContain("1. Bergen Infrastruktur AS");
    expect(result.answer).toContain("1 av 4 selskaper i utvalget mangler regnskap");
    expect(result.answer).toContain("Fravær av score er ikke det samme som lav risiko");
  });

  it("looks a company up by name", () => {
    const result = answerNjordQuestion({ question: "Fortell meg om Datastrøm Norge AS", rows, sectors });

    expect(result.intent).toBe("COMPANY_LOOKUP");
    expect(result.answer).toContain("Datastrøm Norge AS");
    expect(result.answer).toContain("org.nr 920661338");
  });

  it("looks a company up by org number, spaces and all", () => {
    const result = answerNjordQuestion({ question: "Hva med 944 321 008?", rows, sectors });

    expect(result.intent).toBe("COMPANY_LOOKUP");
    expect(result.answer).toContain("Bergen Infrastruktur AS");
  });

  it("says a company has no financials rather than implying it is healthy", () => {
    const unscored = [buildRow({ name: "Ukjent Regnskap AS", orgNumber: "999999999", healthScore: null })];
    const result = answerNjordQuestion({ question: "Ukjent Regnskap AS", rows: unscored, sectors });

    expect(result.answer).toContain("ingen regnskapstall");
    expect(result.answer).not.toContain("Finansiell helse er");
  });

  it("admits when it does not recognise the question instead of improvising", () => {
    const result = answerNjordQuestion({ question: "Hva blir vekslingskursen for euro i morgen?", rows, sectors });

    expect(result.intent).toBe("UNKNOWN");
    expect(result.answer).toContain("Jeg gjetter ikke på resten.");
  });
});
