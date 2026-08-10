import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { FI_SIM_MAPPING_ORACLE } from "./catalog-mapping-oracle.test-data";

function mappingOracleFromSpec() {
  const markdown = readFileSync(
    resolve(process.cwd(), "docs/financials/fi-sim-2026.1-spec.md"),
    "utf8",
  );
  return Object.fromEntries(
    [...markdown.matchAll(/^\| `([^`]+)` \|[^\n]*\| `([^`]+)` \|$/gm)].map(
      ([, conceptKey, metricKey]) => [conceptKey, metricKey === "null" ? null : metricKey],
    ),
  );
}

describe("FI-SIM normative mapping oracle", () => {
  it("uses the product's canonical metric keys in both specification and test oracle", () => {
    expect(mappingOracleFromSpec()).toEqual(FI_SIM_MAPPING_ORACLE);
  });
});
