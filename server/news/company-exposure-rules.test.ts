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

  it("creates petroleum read-across when petroleum exposure exists", () => {
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

    expect(exposures).toContainEqual(
      expect.objectContaining({
        exposureType: "petroleum",
        exposureScore: expect.any(Number),
      }),
    );
  });

  it("creates sector read-across for same narrow industry code", () => {
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

    expect(exposures).toContainEqual(expect.objectContaining({ exposureType: "sector" }));
  });

  it("scores macro rate news for rate-sensitive sectors", () => {
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

    expect(exposures).toContainEqual(
      expect.objectContaining({
        exposureType: "sector",
        rationale: expect.stringContaining("Makro"),
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
