import { describe, expect, it } from "vitest";

import { selectChainForQuery, type ChainSummary } from "./chain-service";

const chains: ChainSummary[] = [
  {
    slug: "kiwi",
    name: "KIWI",
    nameKey: "kiwi",
    naceCode: "47.11",
    naceDescription: "Butikkhandel med bredt vareutvalg",
    storeCount: 700,
    activeStoreCount: 690,
    operatorCount: 400,
    municipalityCount: 250,
    confidence: 0.99,
    builtAt: new Date("2026-07-20T08:00:00.000Z"),
  },
  {
    slug: "rema-1000",
    name: "REMA 1000",
    nameKey: "rema 1000",
    naceCode: "47.11",
    naceDescription: "Butikkhandel med bredt vareutvalg",
    storeCount: 650,
    activeStoreCount: 640,
    operatorCount: 350,
    municipalityCount: 230,
    confidence: 0.98,
    builtAt: new Date("2026-07-20T08:00:00.000Z"),
  },
];

describe("selectChainForQuery", () => {
  it("resolves a chain name embedded without spaces in an analytical question", () => {
    const result = selectChainForQuery(
      "Plott alle rema1000 franchiseselskapene med omsetning i x-aksen",
      chains,
    );

    expect(result?.slug).toBe("rema-1000");
  });
});
