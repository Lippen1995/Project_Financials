import { describe, expect, it } from "vitest";

import { findBestNewswebIssuerMatch, type NewswebIssuer } from "@/integrations/news/newsweb-provider";

const issuers: NewswebIssuer[] = [
  {
    issuerId: 1309,
    issuerSign: "EQNR",
    name: "Equinor ASA",
    isActive: 1,
  },
  {
    issuerId: 9999,
    issuerSign: "EQNR_OLD",
    name: "Equinor ASA",
    isActive: 0,
  },
  {
    issuerId: 7777,
    issuerSign: "EPLH",
    name: "Eplehuset AS",
    isActive: 1,
  },
];

describe("newsweb-provider issuer matching", () => {
  it("matches active NewsWeb issuer by exact normalized company name", () => {
    const issuer = findBestNewswebIssuerMatch("EQUINOR ASA", issuers);
    expect(issuer?.issuerId).toBe(1309);
  });

  it("does not fuzzy-match unrelated company names", () => {
    const issuer = findBestNewswebIssuerMatch("Equinor Energy AS", issuers);
    expect(issuer).toBeNull();
  });

  it("keeps unrelated issuer news separate", () => {
    const issuer = findBestNewswebIssuerMatch("Eplehuset AS", issuers);
    expect(issuer?.issuerSign).toBe("EPLH");
  });
});
