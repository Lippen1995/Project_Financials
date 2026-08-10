import { describe, expect, it } from "vitest";

import { normalizeNorwegianText } from "@/lib/norwegian-text";
import {
  defaultMetricDefinitions,
  findCanonicalMetricKey,
} from "@/server/financials/canonical-taxonomy";

describe("canonical metric aliases", () => {
  it("stores every alias in the spelling the normaliser actually produces", () => {
    // The normaliser turns ø into o and å into a — "Øvrige" becomes "ovrige", not "oevrige".
    // A transliterated spelling is allowed, because old filings really do write "Aarsregnskap",
    // but it can never stand alone: on its own it is invisible coverage. The key looks like it
    // handles the label while a shorter alias on some other key quietly wins it instead, which is
    // exactly how "Øvrige driftsinntekter" came to be mapped as turnover.
    const transliterations: Array<[string, string]> = [["oe", "o"], ["aa", "a"]];
    const missingTwins: string[] = [];

    for (const definition of defaultMetricDefinitions) {
      const aliases = new Set(definition.aliases);
      for (const alias of definition.aliases) {
        expect(normalizeNorwegianText(alias)).toBe(alias);
        for (const [digraph, letter] of transliterations) {
          if (!alias.includes(digraph)) continue;
          const twin = alias.split(digraph).join(letter);
          if (!aliases.has(twin)) {
            missingTwins.push(`${definition.key}: "${alias}" has no "${twin}"`);
          }
        }
      }
    }

    expect(missingTwins).toEqual([]);
  });

  it("prefers the specific key over a broader one that shares a suffix", () => {
    expect(findCanonicalMetricKey("Øvrige driftsinntekter", "INCOME_STATEMENT")).toBe(
      "other_operating_income",
    );
    expect(findCanonicalMetricKey("Andre driftsinntekter", "INCOME_STATEMENT")).toBe(
      "other_operating_income",
    );
    expect(findCanonicalMetricKey("Salgsinntekter", "INCOME_STATEMENT")).toBe("revenue");
    expect(findCanonicalMetricKey("Sum driftsinntekter", "INCOME_STATEMENT")).toBe(
      "total_operating_income",
    );
  });

  it("keeps the maturity-split debt keys apart, and unmapped when the section is unknown", () => {
    const label = "Gjeld til kredittinstitusjoner";
    expect(findCanonicalMetricKey(label, "BALANCE_SHEET", "LONG_TERM")).toBe(
      "long_term_debt_credit_institutions",
    );
    expect(findCanonicalMetricKey(label, "BALANCE_SHEET", "CURRENT")).toBe(
      "short_term_debt_credit_institutions",
    );
    expect(findCanonicalMetricKey(label, "BALANCE_SHEET", null)).toBeNull();
  });
});
