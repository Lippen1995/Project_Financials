import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchJsonMock = vi.fn();

vi.mock("@/integrations/http", () => ({
  fetchJson: fetchJsonMock,
}));

describe("BrregFinancialsProvider", () => {
  beforeEach(() => {
    fetchJsonMock.mockReset();
  });

  it("discovers filings from all available Brreg annual-report years", async () => {
    fetchJsonMock.mockResolvedValue(["2024", "2023", "2022"]);

    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider();
    const filings = await provider.listAnnualReportFilings("928846466");

    expect(filings).toHaveLength(3);
    expect(filings[0]?.fiscalYear).toBe(2024);
    expect(filings[0]?.sourceUrl).toContain("/928846466/2024");
    expect(filings[2]?.fiscalYear).toBe(2022);
  });
});
