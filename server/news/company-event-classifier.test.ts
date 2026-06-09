import { describe, expect, it } from "vitest";

import { classifyCompanyEvent } from "@/server/news/company-event-classifier";

describe("company event classifier", () => {
  it("classifies annual reports", () => {
    const result = classifyCompanyEvent({
      title: "Equinor ASA: Annual report 2025",
      source: { id: "newsweb", sourceType: "financials" },
    });

    expect(result.eventType).toBe("annual_report");
    expect(result.financialImpactScore).toBeGreaterThan(0.8);
    expect(
      classifyCompanyEvent({
        title: "Approval of annual and sustainability reports for 2025",
      }).eventType,
    ).toBe("annual_report");
  });

  it("classifies financial statements and interim reports", () => {
    expect(classifyCompanyEvent({ title: "Issuer publishes interim report for the first half of 2026" }).eventType).toBe(
      "financial_statement",
    );
    expect(classifyCompanyEvent({ title: "Selskapet publiserer halvårsrapport" }).eventType).toBe(
      "financial_statement",
    );
  });

  it("prioritizes explicit quarter reports over sector words in company names", () => {
    expect(
      classifyCompanyEvent({
        title: "Asp Data Center AS - First Quarter Report 2026 Published",
      }).eventType,
    ).toBe("financial_statement");
  });

  it("separates reporting invitations from published results", () => {
    expect(
      classifyCompanyEvent({
        title: "Invitation to presentation of first quarter 2026 financial results",
      }).eventType,
    ).toBe("reporting_calendar");
    expect(
      classifyCompanyEvent({
        title: "Company to publish Q1 interim report on 15 April",
      }).eventType,
    ).toBe("reporting_calendar");
    expect(
      classifyCompanyEvent({
        title: "Scana ASA - Invitasjon til presentasjon av Q1 2026-resultater",
        source: { id: "oslobors", sourceType: "newsweb" },
      }).eventType,
    ).toBe("reporting_calendar");
    expect(
      classifyCompanyEvent({
        title: "Company publishes Q1 interim report",
      }).eventType,
    ).toBe("financial_statement");
  });

  it("classifies contract awards", () => {
    const result = classifyCompanyEvent({
      title: "Nordic Thermal Systems wins contract with industrial customer",
    });

    expect(result.eventType).toBe("contract_award");
    expect(result.direction).toBe("positive");
  });

  it("classifies precise acquisition, operating update, listing, and legal settlement language", () => {
    expect(
      classifyCompanyEvent({
        title: "LINK Mobility - LINK acquires Italian company KPM Solutions",
        source: { id: "oslobors", sourceType: "newsweb" },
      }).eventType,
    ).toBe("mna");
    expect(
      classifyCompanyEvent({
        title: "Norse Atlantic with continued strong unit revenue growth and adjusted capacity in May",
        source: { id: "oslobors", sourceType: "newsweb" },
      }).eventType,
    ).toBe("production_update");
    expect(
      classifyCompanyEvent({
        title: "Magnora Data Center ASA: First pure-play data center share listed in Europe",
        source: { id: "oslobors", sourceType: "newsweb" },
      }).eventType,
    ).toBe("listing");
    expect(
      classifyCompanyEvent({
        title: "Nel ASA: Settlement agreement with Iwatani Corporation of America",
        source: { id: "oslobors", sourceType: "newsweb" },
      }).eventType,
    ).toBe("legal_settlement");
    expect(
      classifyCompanyEvent({
        title: "EAM Solar AS: Fortrinnsrettsemisjon - Bekreftelse pa gyldighet av forliksavtale med Intesa Sanpaolo mottatt",
        source: { id: "oslobors", sourceType: "newsweb" },
      }).eventType,
    ).toBe("legal_settlement");
  });

  it("classifies common commercial agreement and order language as contract awards", () => {
    expect(classifyCompanyEvent({ title: "Company signs strategic partnership with industrial customer" }).eventType).toBe(
      "contract_award",
    );
    expect(classifyCompanyEvent({ title: "Issuer receives purchase order for new system delivery" }).eventType).toBe(
      "contract_award",
    );
    expect(classifyCompanyEvent({ title: "Selskapet inngår ny kundeavtale" }).eventType).toBe("contract_award");
  });

  it("classifies procurement tenders without calling them earnings", () => {
    expect(
      classifyCompanyEvent({
        title: "Equinor hunts for rock installation vessels for Bay du Nord",
      }).eventType,
    ).toBe("procurement_tender");
  });

  it("classifies capital raises", () => {
    const result = classifyCompanyEvent({
      title: "Issuer completes private placement and capital raise",
    });

    expect(result.eventType).toBe("capital_raise");
    expect(result.materialityScore).toBeGreaterThan(0.8);
  });

  it("classifies NewsWeb category payloads when titles are generic", () => {
    expect(
      classifyCompanyEvent({
        title: "Issuer disclosure",
        source: { id: "oslobors", sourceType: "newsweb" },
        sourcePayload: { categories: ["ACQUISITION OR DISPOSAL OF AN ISSUER'S OWN SHARES"] },
      }).eventType,
    ).toBe("buyback");
    expect(
      classifyCompanyEvent({
        title: "Issuer disclosure",
        source: { id: "oslobors", sourceType: "newsweb" },
        sourcePayload: { categories: ["MANDATORY NOTIFICATION OF TRADE PRIMARY INSIDERS"] },
      }).eventType,
    ).toBe("insider_transaction");
  });

  it("classifies listing and delisting events", () => {
    expect(classifyCompanyEvent({ title: "Issuer announces IPO and stock exchange listing" }).eventType).toBe(
      "listing",
    );
    expect(classifyCompanyEvent({ title: "Selskapet søker avnotering etter siste handelsdag" }).eventType).toBe(
      "delisting",
    );
  });

  it("classifies bankruptcy/liquidation signals", () => {
    expect(classifyCompanyEvent({ title: "Company files for bankruptcy" }).eventType).toBe("bankruptcy");
    expect(classifyCompanyEvent({ title: "Foretaket går til avvikling" }).eventType).toBe("liquidation");
  });

  it("classifies management changes", () => {
    expect(classifyCompanyEvent({ title: "New CEO appointed" }).eventType).toBe("ceo_change");
    expect(classifyCompanyEvent({ title: "Company chairman resigns and replacement is nominated" }).eventType).toBe(
      "board_change",
    );
    expect(classifyCompanyEvent({ title: "Nytt styre valgt" }).eventType).toBe("board_change");
    expect(classifyCompanyEvent({ title: "Ny administrerende direktør i selskapet" }).eventType).toBe("ceo_change");
  });

  it("classifies legal and regulatory events", () => {
    expect(classifyCompanyEvent({ title: "Regulator opens investigation" }).eventType).toBe("investigation");
    expect(classifyCompanyEvent({ title: "Regulator imposes administrative fine on issuer" }).eventType).toBe("fine");
    expect(classifyCompanyEvent({ title: "Approval of prospectus by the regulator" }).eventType).toBe(
      "regulatory_approval",
    );
    expect(classifyCompanyEvent({ title: "Bot Auto appoints a new president and COO" }).eventType).not.toBe("fine");
    expect(classifyCompanyEvent({ title: "Regjeringen innfører ny forskrift" }).eventType).toBe("regulatory_change");
  });

  it("classifies AI and semiconductor market moves as sector signals", () => {
    const result = classifyCompanyEvent({
      title: "Semiconductor stocks fall as investors question AI growth forecasts",
      source: {
        id: "google-news-semiconductors",
        sourceType: "search_rss",
        metadata: { tier: "industry", sectorTags: ["semiconductors", "ai"] },
      },
    });

    expect(result.eventType).toBe("sector_news");
    expect(result.materialityScore).toBeGreaterThan(0.7);
  });

  it("does not classify structured issuer disclosures as broad sector news", () => {
    expect(
      classifyCompanyEvent({
        title: "ASP Data Center signs new lease contract with an AI enterprise customer",
        source: {
          id: "oslobors",
          sourceType: "newsweb",
        },
      }).eventType,
    ).toBe("contract_award");
    expect(
      classifyCompanyEvent({
        title: "Asp Data Center AS - Successful placement of tap issue",
        source: {
          id: "oslobors",
          sourceType: "newsweb",
        },
      }).eventType,
    ).not.toBe("sector_news");
  });

  it("requires market context before treating LNG as a commodity event", () => {
    expect(
      classifyCompanyEvent({
        title: "AWILCO LNG ASA appoints a chief commercial officer",
      }).eventType,
    ).toBe("low_signal_mention");
    expect(
      classifyCompanyEvent({
        title: "LNG prices rise as the natural gas market tightens",
      }).eventType,
    ).toBe("commodity_price_exposure");
  });

  it("classifies broad AI growth and GDP expectations as macro signals", () => {
    const result = classifyCompanyEvent({
      title: "Slower AI growth expectations weigh on GDP and business investment outlook",
      source: {
        id: "reuters-business",
        sourceType: "rss",
        metadata: { tier: "premium_media" },
      },
    });

    expect(result.eventType).toBe("macro_news");
    expect(result.impactHorizon).toBe("medium_term");
  });

  it("classifies investor-critical financial warnings and refinancing events", () => {
    expect(classifyCompanyEvent({ title: "Selskapet varsler resultatfall og svakere marginer" }).eventType).toBe(
      "profit_warning",
    );
    expect(classifyCompanyEvent({ title: "Issuer refinances debt and signs new loan facility" }).eventType).toBe(
      "debt_refinancing",
    );
    expect(classifyCompanyEvent({ title: "Selskapet utsteder grønt obligasjonslån" }).eventType).toBe("bond_issue");
  });

  it("classifies contract losses and operational risk events", () => {
    expect(classifyCompanyEvent({ title: "Leverandøren mister kontrakt med stor kunde" }).eventType).toBe(
      "contract_loss",
    );
    expect(classifyCompanyEvent({ title: "Selskapet melder om forsinket prosjekt" }).eventType).toBe(
      "project_delay",
    );
    expect(classifyCompanyEvent({ title: "Prosjektet er forsinket etter kostnadssprekk" }).eventType).toBe(
      "cost_overrun",
    );
    expect(classifyCompanyEvent({ title: "Selskapet varsler nedbemanning og restrukturering" }).eventType).toBe(
      "restructuring",
    );
  });

  it("does not match short keywords inside unrelated words", () => {
    expect(classifyCompanyEvent({ title: "The armchair retailer opens a new office" }).eventType).toBe("low_signal_mention");
  });

  it("falls back to low signal mention when no event keywords match", () => {
    const result = classifyCompanyEvent({ title: "Company mentioned in local article" });

    expect(result.eventType).toBe("low_signal_mention");
    expect(result.confidenceLevel).toBe("low");
  });
});
