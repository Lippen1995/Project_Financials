import { describe, expect, it } from "vitest";

import type { NewswebIssuer } from "@/integrations/news/newsweb-provider";
import { matchNewswebIssuerToCompanies } from "@/server/news/newsweb-issuer-registry";

describe("NewsWeb issuer registry", () => {
  const issuer: NewswebIssuer = {
    issuerId: 5063,
    issuerSign: "MOWI",
    symbol: "MOWI",
    name: "Mowi ASA",
    isActive: 1,
  };

  it("matches only the exact legal company name", () => {
    const result = matchNewswebIssuerToCompanies(issuer, [
      { id: "holding", name: "MOWI HOLDING AS", orgNumber: "976841220" },
      { id: "issuer", name: "MOWI ASA", orgNumber: "964118191" },
    ]);

    expect(result).toEqual({
      company: { id: "issuer", name: "MOWI ASA", orgNumber: "964118191" },
      ambiguous: false,
    });
  });

  it("does not guess when duplicate legal names exist", () => {
    const result = matchNewswebIssuerToCompanies(issuer, [
      { id: "one", name: "MOWI ASA", orgNumber: "111111111" },
      { id: "two", name: "Mowi ASA", orgNumber: "222222222" },
    ]);

    expect(result.company).toBeNull();
    expect(result.ambiguous).toBe(true);
  });
});
