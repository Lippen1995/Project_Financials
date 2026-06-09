import { describe, expect, it } from "vitest";

import {
  CompanyExposureCompanyContext,
  CompanyExposureEventContext,
  scoreCompanyEventExposures,
} from "@/server/news/company-exposure-rules";

const petroleumEvent: CompanyExposureEventContext = {
  eventId: "event-1",
  sourceCompanyId: "eqnr",
  eventType: "production_update",
  title: "Sokkeldirektoratet: Oil and gas discovery in the Norwegian Sea",
  summary: "A petroleum discovery affects production outlook and licensing activity.",
  sourceId: "sodir-news",
  sourceType: "official",
  sourceSectorTags: ["oil_gas", "petroleum"],
  sourceCompanyIndustryCode: "06.100",
  sourceCompanyIndustryTitle: "Utvinning av raolje",
};

const equinor: CompanyExposureCompanyContext = {
  companyId: "eqnr",
  name: "Equinor ASA",
  industryCode: "06.100",
  industryTitle: "Utvinning av raolje",
  hasPetroleumExposure: true,
  petroleumExposure: {
    operatorFieldCount: 8,
    licenceCount: 20,
  },
};

describe("company exposure rules", () => {
  it("creates direct exposure for the source company", () => {
    const exposures = scoreCompanyEventExposures(petroleumEvent, equinor);

    expect(exposures[0]).toEqual(
      expect.objectContaining({
        exposureType: "direct",
        exposureScore: 0.96,
      }),
    );
  });

  it("does not create company-specific read-across from petroleum similarity alone", () => {
    const akerBp: CompanyExposureCompanyContext = {
      companyId: "akerbp",
      name: "Aker BP ASA",
      industryCode: "06.100",
      industryTitle: "Utvinning av raolje",
      hasPetroleumExposure: true,
      petroleumExposure: {
        operatorFieldCount: 4,
        licenceCount: 12,
      },
    };

    const exposures = scoreCompanyEventExposures(petroleumEvent, akerBp, { includeDirect: false });

    expect(exposures).toEqual([]);
  });

  it("prefers an explicit exposure graph path for official gas-market news", () => {
    const exposures = scoreCompanyEventExposures(
      {
        eventId: "event-iea-gas",
        sourceCompanyId: "macro-source",
        eventType: "macro_news",
        title: "Global LNG supply wave delayed by natural gas disruption",
        sourceId: "iea-news",
      },
      {
        companyId: "eqnr",
        name: "Equinor ASA",
        industryCode: "06.100",
        exposureGraphEdges: [
          {
            relationType: "produces_commodity",
            weight: 0.9,
            confidenceScore: 0.95,
            rationale: "Hydrokarbontype registrert av Sokkeldirektoratet.",
            node: {
              nodeType: "commodity",
              key: "natural_gas",
              label: "Naturgass",
            },
          },
        ],
      },
      { includeDirect: false, threshold: 0.7 },
    );

    expect(exposures).toContainEqual(
      expect.objectContaining({
        exposureType: "commodity",
        rationale: expect.stringContaining("Eksponeringsgraf"),
      }),
    );
  });

  it("does not propagate ordinary company financial reports to sector peers", () => {
    const peer: CompanyExposureCompanyContext = {
      companyId: "peer-1",
      name: "Peer Energy ASA",
      industryCode: "06.100",
      industryTitle: "Utvinning av raolje",
    };

    const exposures = scoreCompanyEventExposures(
      {
        ...petroleumEvent,
        eventType: "financial_result",
        title: "Equinor reports stronger quarterly result",
        summary: "Higher margins in upstream oil and gas.",
      },
      peer,
      { includeDirect: false },
    );

    expect(exposures).toEqual([]);
  });

  it("does not create sector read-across for company-specific production updates", () => {
    const peer: CompanyExposureCompanyContext = {
      companyId: "peer-1",
      name: "Peer Energy ASA",
      industryCode: "06.100",
      industryTitle: "Utvinning av raolje",
    };

    const exposures = scoreCompanyEventExposures(
      petroleumEvent,
      peer,
      { includeDirect: false },
    );

    expect(exposures).toEqual([]);
  });

  it("does not propagate ownership disclosures to petroleum peers", () => {
    const exposures = scoreCompanyEventExposures(
      {
        ...petroleumEvent,
        eventType: "ownership_change",
        title: "Major shareholding disclosure in DNO ASA",
      },
      {
        ...equinor,
        companyId: "akerbp",
      },
      { includeDirect: false },
    );

    expect(exposures).toEqual([]);
  });

  it("does not infer macro exposure from company size or industry alone", () => {
    const proff: CompanyExposureCompanyContext = {
      companyId: "proff",
      name: "Proff AS",
      industryCode: "63.920",
      industryTitle: "Andre informasjonstjenester",
      revenue: 700_000_000,
    };

    const exposures = scoreCompanyEventExposures(
      {
        eventId: "event-rate",
        sourceCompanyId: "norges-bank",
        eventType: "interest_rate",
        title: "Policy rate raised to 4.25%",
        summary: "Norges Bank increased the policy rate.",
      },
      proff,
      { includeDirect: false },
    );

    expect(exposures).toEqual([]);
  });

  it("allows standard read-across through a verified controlling ownership path", () => {
    const exposures = scoreCompanyEventExposures(
      {
        eventId: "subsidiary-event",
        sourceCompanyId: "subsidiary",
        sourceCompanyOrgNumber: "990888213",
        eventType: "production_update",
        title: "Subsidiary production update",
      },
      {
        companyId: "parent",
        name: "Parent ASA",
        exposureGraphEdges: [
          {
            relationType: "controls_company",
            weight: 1,
            confidenceScore: 0.99,
            rationale: "100 % direct ownership.",
            node: {
              nodeType: "company",
              key: "controlled_company:990888213",
              label: "Subsidiary AS",
            },
          },
        ],
      },
      { includeDirect: false, threshold: 0.7 },
    );

    expect(exposures).toContainEqual(
      expect.objectContaining({
        exposureType: "ownership",
        exposureLevel: "group",
        feedPolicy: "standard",
      }),
    );
  });

  it("does not link irrelevant broad consumer events to petroleum companies", () => {
    const exposures = scoreCompanyEventExposures(
      {
        eventId: "event-apple",
        sourceCompanyId: "eplehuset",
        eventType: "mna",
        title: "Elkjop's acquisition of Eplehuset must be assessed further",
        summary: "Sales of Apple products affect consumer electronics markets.",
        sourceId: "konkurransetilsynet",
        sourceType: "regulator",
        sourceCompanyIndustryCode: "47.410",
        sourceCompanyIndustryTitle: "Butikkhandel med datamaskiner",
      },
      equinor,
      { includeDirect: false },
    );

    expect(exposures).toEqual([]);
  });

  it("does not propagate generic traffic production updates to petroleum companies", () => {
    const exposures = scoreCompanyEventExposures(
      {
        eventId: "event-traffic",
        sourceCompanyId: "airline",
        eventType: "production_update",
        title: "Traffic figures for May 2026",
        summary: "Passenger volume increased during the month.",
        sourceId: "oslobors",
        sourceType: "newsweb",
        sourceCompanyIndustryCode: "51.100",
      },
      {
        ...equinor,
        companyId: "akerbp",
      },
      { includeDirect: false },
    );

    expect(exposures).toEqual([]);
  });

  it("lets thresholds prevent weak value-chain spam", () => {
    const supplier: CompanyExposureCompanyContext = {
      companyId: "supplier",
      name: "Oil Service Supplier AS",
      industryCode: "09.109",
      industryTitle: "Andre tjenester tilknyttet utvinning av raolje og naturgass",
      description: "Engineering and subsea supplier",
    };

    const exposures = scoreCompanyEventExposures(
      {
        ...petroleumEvent,
        title: "Field development contract awarded",
        summary: "A subsea supplier contract was awarded.",
      },
      supplier,
      { includeDirect: false, threshold: 0.7 },
    );

    expect(exposures.every((exposure) => exposure.exposureScore >= 0.7)).toBe(true);
  });
});
