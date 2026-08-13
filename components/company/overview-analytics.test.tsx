import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OverviewAnalytics } from "@/components/company/overview-analytics";
import {
  buildHealthFacts,
  computeHealthScore,
  defaultHealthScoreConfig,
} from "@/lib/health-score";
import type { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";

function statement(
  partial: Partial<NormalizedFinancialStatement> & { fiscalYear: number },
): NormalizedFinancialStatement {
  return {
    currency: "NOK",
    sourceSystem: "BRREG",
    sourceEntityType: "REGNSKAP",
    sourceId: `s${partial.fiscalYear}`,
    fetchedAt: new Date("2026-01-01"),
    normalizedAt: new Date("2026-01-01"),
    ...partial,
  } as NormalizedFinancialStatement;
}

const statements = [
  statement({ fiscalYear: 2023, revenue: 800, operatingProfit: 90, netIncome: 70, equity: 500, assets: 900 }),
  statement({ fiscalYear: 2024, revenue: 1000, operatingProfit: 150, netIncome: 110, equity: 620, assets: 1000 }),
];

const company = {
  orgNumber: "999999999",
  name: "Testselskap AS",
  slug: "999999999",
  status: "ACTIVE",
  addresses: [],
  employeeCount: 12,
  foundedAt: new Date("2015-01-01"),
  lastSubmittedAnnualReportYear: 2024,
  sourceSystem: "BRREG",
  sourceEntityType: "ENHET",
  sourceId: "999999999",
  fetchedAt: new Date("2026-01-01"),
  normalizedAt: new Date("2026-01-01"),
} as unknown as NormalizedCompany;

const health = computeHealthScore(
  buildHealthFacts({ company, statements, now: new Date("2026-08-11") }),
  defaultHealthScoreConfig(),
);

function render(overrides: Partial<React.ComponentProps<typeof OverviewAnalytics>> = {}) {
  return renderToStaticMarkup(
    <OverviewAnalytics
      company={company}
      roles={[]}
      statements={statements}
      lineItems={[]}
      financialsAvailability={{ available: true, sourceSystem: "BRREG", message: "ok" }}
      health={health}
      healthModelName="Innebygd standardmodell"
      healthMatchedNacePrefix={null}
      {...overrides}
    />,
  );
}

describe("OverviewAnalytics", () => {
  it("places financial health below the development charts", () => {
    const markup = render();

    const utvikling = markup.indexOf("Utvikling");
    const helse = markup.indexOf("Finansiell helse");

    expect(utvikling).toBeGreaterThan(-1);
    expect(helse).toBeGreaterThan(utvikling);
  });

  it("keeps the section order the overview is designed around", () => {
    const markup = render();
    const positions = [
      "AI-vurdering",
      "Nøkkeltall",
      "Utvikling",
      "Finansiell helse",
      "Generelt om selskapet",
    ].map((label) => markup.indexOf(label));

    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it("shows the statutory purpose and the registered name history", () => {
    const markup = render({
      company: {
        ...company,
        name: "REACH SUBSEA ASA",
        statutoryPurpose: "Yte ingeniør-, konstruksjons- og servicetjenester for offshoreenergiindustrien.",
        statutesDate: new Date("2025-03-05"),
        languageForm: "Bokmål",
        previousNames: [
          {
            name: "NOMADIC SHIPPING ASA",
            fromDate: new Date("1996-01-22"),
            toDate: new Date("2003-05-19"),
          },
          {
            name: "GREEN REEFERS ASA",
            fromDate: new Date("2003-05-19"),
            toDate: new Date("2012-08-18"),
          },
        ],
      } as unknown as NormalizedCompany,
    });

    expect(markup).toContain("Vedtektsfestet formål");
    expect(markup).toContain("offshoreenergiindustrien");
    expect(markup).toContain("Tidligere navn");
    expect(markup).toContain("NOMADIC SHIPPING ASA");
    expect(markup).toContain("Vedtektsdato");
    // Each historic name ends in a dated change, which belongs on the milestone timeline.
    expect(markup).toContain("NOMADIC SHIPPING ASA ble til GREEN REEFERS ASA.");
    expect(markup).toContain("GREEN REEFERS ASA ble til REACH SUBSEA ASA.");
  });

  it("leaves the purpose and name blocks out when the register has neither", () => {
    const markup = render();

    expect(markup).not.toContain("Vedtektsfestet formål");
    expect(markup).not.toContain("Tidligere navn");
  });

  it("omits the health section when there are no financials to score", () => {
    const markup = render({
      financialsAvailability: {
        available: false,
        sourceSystem: "BRREG",
        message: "Regnskap er ikke synkronisert ennå.",
      },
    });

    expect(markup).not.toContain("Finansiell helse");
  });

  it("omits the health section when no score was supplied", () => {
    const markup = render({ health: undefined });

    expect(markup).not.toContain("Finansiell helse");
  });
});
