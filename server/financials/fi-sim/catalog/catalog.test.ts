import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FI_SIM_CONCEPTS,
  FI_SIM_NAMESPACE,
  FI_SIM_TAXONOMY_VERSION,
  conceptKeysFor,
  qualifiedName,
} from "@/server/financials/fi-sim/catalog/concepts";
import {
  FI_SIM_PROFILES,
  assertProfileConceptsExist,
  conceptsFor,
  permittedConcepts,
  type FiSimProfileKey,
} from "@/server/financials/fi-sim/catalog/profiles";

const profileKeys = Object.keys(FI_SIM_PROFILES) as FiSimProfileKey[];

describe("FI-SIM concept catalog", () => {
  it("is the six-profile, 2026.1 taxonomy in its own namespace", () => {
    expect(FI_SIM_TAXONOMY_VERSION).toBe("FI-SIM-2026.1");
    expect(FI_SIM_NAMESPACE).toBe("urn:fjord-insight:taxonomy:fi-sim:2026.1");
    expect(profileKeys).toHaveLength(6);
  });

  it("carries every concept the spec lists, and no duplicates", () => {
    // Spec section 4.1 lists 26 income-statement concepts and 4.2 lists 30 balance-sheet ones.
    expect(conceptKeysFor("INCOME_STATEMENT")).toHaveLength(26);
    expect(conceptKeysFor("BALANCE_SHEET")).toHaveLength(30);
    expect(new Set(FI_SIM_CONCEPTS.map((c) => c.conceptKey)).size).toBe(FI_SIM_CONCEPTS.length);
  });

  it("gives income concepts duration and balance concepts instant", () => {
    for (const concept of FI_SIM_CONCEPTS) {
      expect(concept.periodType).toBe(
        concept.statementFamily === "INCOME_STATEMENT" ? "duration" : "instant",
      );
    }
  });

  it("qualifies names in the FI-SIM prefix", () => {
    expect(qualifiedName("OperatingResult")).toBe("fi-sim:OperatingResult");
  });

  it("orders each statement family without ties", () => {
    for (const family of ["INCOME_STATEMENT", "BALANCE_SHEET"] as const) {
      const orders = FI_SIM_CONCEPTS.filter((c) => c.statementFamily === family).map(
        (c) => c.sortOrder,
      );
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});

describe("FI-SIM profiles", () => {
  it.each(profileKeys)("%s names only concepts that exist", (key) => {
    expect(() => assertProfileConceptsExist(key)).not.toThrow();
  });

  it.each(profileKeys)("%s has both an income and a balance tree", (key) => {
    // Spec port: every profile must produce a valid statement of each kind.
    expect(conceptsFor(key, "INCOME_STATEMENT").length).toBeGreaterThan(0);
    expect(conceptsFor(key, "BALANCE_SHEET").length).toBeGreaterThan(0);
  });

  it.each(profileKeys)("%s publishes fewer than all concepts", (key) => {
    // Spec port: no profile publishes the whole catalog. A profile that did would make the
    // profile choice meaningless and would put, say, rental income on a shop.
    expect(permittedConcepts(key).size).toBeLessThan(FI_SIM_CONCEPTS.length);
  });

  it.each(profileKeys)("%s can satisfy the section 8 identities", (key) => {
    for (const total of [
      "OperatingIncomeTotal",
      "OperatingExpenseTotal",
      "OperatingResult",
      "NetFinancialResult",
      "ProfitBeforeTax",
      "ProfitForPeriod",
      "AssetsTotal",
      "EquityTotal",
      "LiabilitiesTotal",
      "EquityAndLiabilitiesTotal",
    ]) {
      expect(permittedConcepts(key).has(total)).toBe(true);
    }
  });

  it("keeps the profiles distinct from one another", () => {
    const signatures = profileKeys.map((key) => [...permittedConcepts(key)].sort().join("|"));
    expect(new Set(signatures).size).toBe(profileKeys.length);
  });

  it("does not require revenue for holding or dormant companies", () => {
    // Spec 5.5 and 5.6: ordinary operating revenue is explicitly not required for these.
    for (const key of ["HOLDING_INVESTMENT", "DORMANT_PRE_REVENUE"] as const) {
      const revenueConcepts = [
        "ServiceRevenue",
        "MerchandiseRevenue",
        "ContractRevenue",
        "RentalRevenue",
      ];
      expect(FI_SIM_PROFILES[key].required.some((c) => revenueConcepts.includes(c))).toBe(false);
    }
  });
});

describe("XBRL boundary", () => {
  // Spec section 2 draws the boundary around the FI-SIM layer, not around two files, so the check
  // walks the whole tree: the generator writes qualified names and labels too.
  const fiSimDir = path.join(process.cwd(), "server/financials/fi-sim");
  const sources = readdirSync(fiSimDir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test."),
    )
    .map((entry) => ({
      name: entry.name,
      text: readFileSync(path.join(entry.parentPath, entry.name), "utf8"),
    }));

  /**
   * Comments are stripped before checking. Prose documenting the IFRS boundary is exactly the
   * text that should exist; what must not exist is IFRS reaching an identifier, a namespace or
   * a string the product can emit.
   */
  function withoutComments(text: string) {
    return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  }

  it("lets no IFRS reference reach an identifier or an emitted string", () => {
    // Spec section 2: FI-SIM uses open XBRL mechanics but must not import, copy, translate or
    // imitate IFRS files, namespaces, QNames, labels, definitions or linkbases, and must not be
    // described as IFRS-based, IFRS-compatible or IFRS-compliant.
    for (const source of sources) {
      const offending = withoutComments(source.text).match(/\bifrs\b|full_ifrs/gi) ?? [];
      expect(offending, `${source.name} refers to IFRS: ${offending.join(", ")}`).toHaveLength(0);
    }
  });

  it("uses only the FI-SIM namespace", () => {
    for (const source of sources) {
      const namespaces = source.text.match(/urn:[a-z0-9:.-]+/gi) ?? [];
      for (const namespace of namespaces) {
        expect(namespace).toBe(FI_SIM_NAMESPACE);
      }
    }
  });
});
