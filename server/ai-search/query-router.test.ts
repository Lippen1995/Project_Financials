import { describe, expect, it } from "vitest";

import { classifyQueryIntent } from "./query-router";

describe("classifyQueryIntent", () => {
  it("routes an org number to a direct lookup, never the agent", () => {
    const result = classifyQueryIntent("923609016");
    expect(result.intent).toBe("DIRECT_LOOKUP");
    expect(result.usesAgent).toBe(false);
  });

  it("tolerates spaces in an org number", () => {
    expect(classifyQueryIntent("923 609 016").intent).toBe("DIRECT_LOOKUP");
  });

  it("treats a plain company name as a non-agent lookup", () => {
    for (const name of ["Equinor ASA", "Rema 1000", "Claire Kids", "Fjord Defence"]) {
      const result = classifyQueryIntent(name);
      expect(result.intent, name).toBe("STRUCTURED_FILTER");
      expect(result.usesAgent, name).toBe(false);
    }
  });

  it("escalates the target analytical queries to the agent", () => {
    const analytical = [
      "Name potential acquisition targets for Fjord Defence",
      "List all franchise stores for Rema1000",
      "Give me complete overview of the competitors of Claire Kids",
      "Hvilke konkurrenter har Claire Kids?",
      "selskaper som ligner på Jotun",
      "hvem eier av Rema 1000",
    ];
    for (const query of analytical) {
      const result = classifyQueryIntent(query);
      expect(result.intent, query).toBe("ANALYTICAL");
      expect(result.usesAgent, query).toBe(true);
      expect(result.matchedSignals.length, query).toBeGreaterThan(0);
    }
  });

  it("does not trip on a bare name that merely contains a common word", () => {
    // "Franchise" as part of a name would legitimately trip; guard the plain-name cases
    // that must stay cheap.
    expect(classifyQueryIntent("Rema 1000 Vestland").usesAgent).toBe(false);
    expect(classifyQueryIntent("Jotun A/S").usesAgent).toBe(false);
  });

  it("classifies an empty query as a cheap no-op", () => {
    const result = classifyQueryIntent("   ");
    expect(result.usesAgent).toBe(false);
  });
});
