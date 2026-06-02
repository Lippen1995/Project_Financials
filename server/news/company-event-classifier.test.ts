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
  });

  it("classifies contract awards", () => {
    const result = classifyCompanyEvent({
      title: "Nordic Thermal Systems wins contract with industrial customer",
    });

    expect(result.eventType).toBe("contract_award");
    expect(result.direction).toBe("positive");
  });

  it("classifies capital raises", () => {
    const result = classifyCompanyEvent({
      title: "Issuer completes private placement and capital raise",
    });

    expect(result.eventType).toBe("capital_raise");
    expect(result.materialityScore).toBeGreaterThan(0.8);
  });

  it("classifies bankruptcy/liquidation signals", () => {
    expect(classifyCompanyEvent({ title: "Company files for bankruptcy" }).eventType).toBe("bankruptcy");
    expect(classifyCompanyEvent({ title: "Foretaket går til avvikling" }).eventType).toBe("liquidation");
  });

  it("classifies management changes", () => {
    expect(classifyCompanyEvent({ title: "New CEO appointed" }).eventType).toBe("ceo_change");
    expect(classifyCompanyEvent({ title: "Nytt styre valgt" }).eventType).toBe("board_change");
  });

  it("classifies legal and regulatory events", () => {
    expect(classifyCompanyEvent({ title: "Regulator opens investigation" }).eventType).toBe("investigation");
    expect(classifyCompanyEvent({ title: "Regjeringen innfører ny forskrift" }).eventType).toBe("regulatory_change");
  });

  it("falls back to low signal mention when no event keywords match", () => {
    const result = classifyCompanyEvent({ title: "Company mentioned in local article" });

    expect(result.eventType).toBe("low_signal_mention");
    expect(result.confidenceLevel).toBe("low");
  });
});
