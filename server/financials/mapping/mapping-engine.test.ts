import { describe, expect, it } from "vitest";

import {
  MappingInputError,
  UnknownMetricKeyError,
  buildAliasMapping,
  normalizeAlias,
  resolveRegistryFields,
} from "@/server/financials/mapping/mapping-engine";
import type { CanonicalRegistryEntry } from "@/server/services/canonical-registry-service";

const registry = [
  { key: "revenue", family: "INCOME_STATEMENT", liabilitySection: null },
  { key: "total_equity", family: "BALANCE_SHEET", liabilitySection: null },
  { key: "long_term_liabilities", family: "BALANCE_SHEET", liabilitySection: "LONG_TERM" },
] as unknown as CanonicalRegistryEntry[];

describe("normalizeAlias", () => {
  it("keeps the reviewer's text and derives a comparison form", () => {
    expect(normalizeAlias("  Sum driftsinntekter  ")).toEqual({
      alias: "Sum driftsinntekter",
      normalizedAlias: normalizeAlias("Sum driftsinntekter").normalizedAlias,
    });
  });

  it("treats casing and spacing differences as the same alias", () => {
    expect(normalizeAlias("SUM  DRIFTSINNTEKTER").normalizedAlias).toBe(
      normalizeAlias("sum driftsinntekter").normalizedAlias,
    );
  });

  it("rejects an alias that is only whitespace", () => {
    expect(() => normalizeAlias("   ")).toThrow(MappingInputError);
  });

  it("rejects an alias whose characters all normalise away", () => {
    // Normalisation keeps word characters, whitespace and / ( ) - and drops everything else.
    // Input made only of dropped characters carries no matching power; storing it would occupy
    // the uniqueness constraint with a row that can never match a source label.
    expect(() => normalizeAlias("•••")).toThrow(MappingInputError);
    expect(() => normalizeAlias("???")).toThrow(MappingInputError);
  });

  it("keeps hyphens and parentheses, which carry meaning in account labels", () => {
    expect(normalizeAlias("Driftsresultat (EBIT)").normalizedAlias).toBe("driftsresultat (ebit)");
    expect(normalizeAlias("Finans - netto").normalizedAlias).toBe("finans - netto");
  });
});

describe("resolveRegistryFields", () => {
  it("derives the statement family from the registry entry", () => {
    expect(resolveRegistryFields("revenue", registry)).toEqual({
      statementFamily: "INCOME_STATEMENT",
      liabilitySection: null,
    });
  });

  it("carries the liability section when the entry has one", () => {
    expect(resolveRegistryFields("long_term_liabilities", registry).liabilitySection).toBe(
      "LONG_TERM",
    );
  });

  it("rejects a key that is not in the registry", () => {
    expect(() => resolveRegistryFields("typo_key", registry)).toThrow(UnknownMetricKeyError);
  });
});

describe("buildAliasMapping", () => {
  it("produces everything a store needs without naming a store", () => {
    const mapping = buildAliasMapping({ alias: " Egenkapital ", metricKey: "total_equity" }, registry);

    expect(mapping).toMatchObject({
      alias: "Egenkapital",
      metricKey: "total_equity",
      statementFamily: "BALANCE_SHEET",
      liabilitySection: null,
    });
    expect(mapping.normalizedAlias).toBe(normalizeAlias("Egenkapital").normalizedAlias);
  });

  it("is identical for the same input regardless of which dataset asked", () => {
    // The F5 guarantee: reported and simulated mapping differ in where a row is written, never
    // in what the mapping means. Both call this with the same registry and get the same answer.
    const reported = buildAliasMapping({ alias: "Driftsinntekter", metricKey: "revenue" }, registry);
    const simulated = buildAliasMapping({ alias: "Driftsinntekter", metricKey: "revenue" }, registry);

    expect(simulated).toEqual(reported);
  });

  it("fails on the alias before it reaches the registry", () => {
    expect(() => buildAliasMapping({ alias: "", metricKey: "nonexistent" }, registry)).toThrow(
      MappingInputError,
    );
  });
});
