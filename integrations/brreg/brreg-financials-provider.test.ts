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
    expect(filings[0]?.sourceDiscoveryKey).toBe("BRREG::928846466::2024::annual-report");
    expect(filings[2]?.fiscalYear).toBe(2022);
  });

  it("returns normalized structured accounts with source metadata", async () => {
    const fetchedAt = new Date("2026-07-27T09:00:00.000Z");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 42,
            journalnr: "journal-42",
            regnskapstype: "SELSKAP",
            avviklingsregnskap: false,
            regnskapsperiode: {
              fraDato: "2025-01-01",
              tilDato: "2025-12-31",
            },
            valuta: "NOK",
            resultatregnskapResultat: {
              driftsresultat: {
                driftsinntekter: { sumDriftsinntekter: 1000 },
              },
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider({
      fetch: fetchMock,
      now: () => fetchedAt,
    });
    const result = await provider.fetchStructuredAnnualAccounts("000000000");

    expect(result.status).toBe("AVAILABLE");
    expect(result.unavailableReason).toBeNull();
    expect(result).toMatchObject({
      sourceSystem: "BRREG",
      sourceEntityType: "structuredAnnualAccountsResponse",
      sourceId: "000000000",
      fetchedAt,
      normalizedAt: fetchedAt,
    });
    expect(result.accounts[0]).toMatchObject({
      sourceEntityType: "structuredAnnualAccounts",
      sourceId: "journal-42",
      fiscalYear: 2025,
      revenue: 1000,
    });
  });

  it("returns a traceable unavailable result for a company without accounts", async () => {
    const checkedAt = new Date("2026-07-27T09:30:00.000Z");
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider({
      fetch: fetchMock,
      now: () => checkedAt,
    });

    const result = await provider.fetchStructuredAnnualAccounts("000000000");

    expect(result).toMatchObject({
      status: "UNAVAILABLE",
      accounts: [],
      unavailableReason: "HTTP 404: ingen regnskap",
      sourceSystem: "BRREG",
      sourceId: "000000000",
      fetchedAt: checkedAt,
    });
  });

  it("retries a transient source failure before returning real data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              journalnr: "journal-after-retry",
              regnskapstype: "SELSKAP",
              avviklingsregnskap: false,
              valuta: "NOK",
              regnskapsperiode: { tilDato: "2025-12-31" },
              eiendeler: { sumEiendeler: 1 },
            },
          ]),
          { status: 200 },
        ),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider({
      fetch: fetchMock,
      sleep,
      random: () => 0,
    });

    const result = await provider.fetchStructuredAnnualAccounts("000000000");

    expect(result.status).toBe("AVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("retries a network failure before returning real data", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              journalnr: "journal-after-network-retry",
              regnskapstype: "SELSKAP",
              avviklingsregnskap: false,
              valuta: "NOK",
              regnskapsperiode: { tilDato: "2025-12-31" },
              eiendeler: { sumEiendeler: 1 },
            },
          ]),
          { status: 200 },
        ),
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider({
      fetch: fetchMock,
      sleep,
      random: () => 0,
    });

    const response = await provider.fetchStructuredAnnualAccounts("000000000");

    expect(response.status).toBe("AVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("raises a controlled contract error for an unexpected successful payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider({ fetch: fetchMock });

    await expect(
      provider.fetchStructuredAnnualAccounts("000000000"),
    ).rejects.toMatchObject({
      name: "StructuredRegnskapContractError",
    });
  });

  it("aborts a hanging source request and returns a controlled network error", async () => {
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Timed out", "AbortError"));
          });
        }),
    );
    const { BrregFinancialsProvider } = await import("@/integrations/brreg/brreg-financials-provider");
    const provider = new BrregFinancialsProvider({
      fetch: fetchMock,
      sleep: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 1,
    });

    await expect(
      provider.fetchStructuredAnnualAccounts("000000000"),
    ).rejects.toThrow("network");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
