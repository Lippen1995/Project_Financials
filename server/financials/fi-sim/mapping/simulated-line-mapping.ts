import {
  findCanonicalMetricKey,
  type LiabilitySection,
  type MetricDefinition,
} from "@/server/financials/canonical-taxonomy";

/**
 * Mapping a simulated line, from spec section 11.
 *
 * The rule the whole demo rests on is that a simulated line is mapped by exactly the same engine
 * that maps a reported one. It arrives with `metricKey = null` and a Norwegian label, and it is
 * matched on that label — never on its FI-SIM concept key. The catalog does know which metric each
 * concept ought to become, but that table is test fasit: if the generator or this module read it,
 * the demo would be showing a mapping that was decided in advance rather than one the engine made,
 * and the feature being demonstrated would be a lookup.
 *
 * What differs between the two modes is only where alias rules come from. Reported mapping uses the
 * reported alias table; a demo uses the dataset-scoped overlay, injected here as extra definitions
 * so the matching itself stays one code path with one longest-alias-wins rule.
 */

export type SimulatedLineForMapping = {
  id: string;
  conceptKey: string;
  sourceLabel: string;
  presentationRole: string;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET";
};

export type SimulatedAliasOverlayEntry = {
  alias: string;
  metricKey: string;
  statementFamily: "INCOME_STATEMENT" | "BALANCE_SHEET";
  liabilitySection: LiabilitySection | null;
};

export type SimulatedLineMappingMethod =
  | "CANONICAL_LABEL_MATCH"
  | "SIMULATED_ALIAS_OVERLAY"
  | "INTENTIONALLY_UNMAPPED"
  | "NO_MATCH";

export type SimulatedLineMappingDecision = {
  lineId: string;
  conceptKey: string;
  metricKey: string | null;
  mappingMethod: SimulatedLineMappingMethod;
};

/**
 * Which liability sub-section a balance line sits in.
 *
 * Two canonical keys share the label "Gjeld til kredittinstitusjoner" and are told apart only by
 * this, so a line whose section is unknown must stay unmatched rather than be guessed into one of
 * them. The FI-SIM catalog always knows, because the presentation role says so.
 */
export function liabilitySectionForPresentationRole(
  presentationRole: string,
): LiabilitySection | null {
  if (presentationRole.startsWith("LongTermLiabilities")) return "LONG_TERM";
  if (presentationRole.startsWith("CurrentLiabilities")) return "CURRENT";
  return null;
}

/**
 * The overlay as extra definitions, so the shared matcher sees demo aliases the same way it sees
 * catalog ones. Appended rather than prepended: `findCanonicalMetricKey` resolves ties by longest
 * matching alias, not by order, so an overlay alias wins on being more specific rather than on
 * being an overlay.
 */
export function overlayDefinitions(
  overlay: readonly SimulatedAliasOverlayEntry[],
): MetricDefinition[] {
  return overlay.map((entry) => ({
    key: entry.metricKey as MetricDefinition["key"],
    statementFamily: entry.statementFamily,
    aliases: [entry.alias],
    ...(entry.liabilitySection ? { liabilitySection: entry.liabilitySection } : {}),
  }));
}

export function decideSimulatedLineMapping(
  line: SimulatedLineForMapping,
  context: {
    definitions: readonly MetricDefinition[];
    overlayMetricKeys: ReadonlySet<string>;
    /**
     * Concepts the dataset manifest says must arrive unmapped, so the demo can show the mapping
     * feature doing something. Listed, never chosen at random.
     */
    intentionallyUnmapped: ReadonlySet<string>;
  },
): SimulatedLineMappingDecision {
  if (context.intentionallyUnmapped.has(line.conceptKey)) {
    return {
      lineId: line.id,
      conceptKey: line.conceptKey,
      metricKey: null,
      mappingMethod: "INTENTIONALLY_UNMAPPED",
    };
  }

  const metricKey = findCanonicalMetricKey(
    line.sourceLabel,
    line.statementType,
    liabilitySectionForPresentationRole(line.presentationRole),
    [...context.definitions],
  );

  if (!metricKey) {
    return {
      lineId: line.id,
      conceptKey: line.conceptKey,
      metricKey: null,
      mappingMethod: "NO_MATCH",
    };
  }

  return {
    lineId: line.id,
    conceptKey: line.conceptKey,
    metricKey,
    mappingMethod: context.overlayMetricKeys.has(metricKey)
      ? "SIMULATED_ALIAS_OVERLAY"
      : "CANONICAL_LABEL_MATCH",
  };
}

export type SimulatedMappingCoverage = {
  lines: number;
  mapped: number;
  unmapped: number;
  byMethod: Record<SimulatedLineMappingMethod, number>;
  /** One row per concept, so a reviewer can see what the demo leaves them to do. */
  byConcept: Array<{
    conceptKey: string;
    sourceLabel: string;
    metricKey: string | null;
    method: SimulatedLineMappingMethod;
    lines: number;
  }>;
};

export function summariseMappingCoverage(
  decisions: readonly SimulatedLineMappingDecision[],
  labelByConcept: ReadonlyMap<string, string>,
): SimulatedMappingCoverage {
  const byMethod: Record<SimulatedLineMappingMethod, number> = {
    CANONICAL_LABEL_MATCH: 0,
    SIMULATED_ALIAS_OVERLAY: 0,
    INTENTIONALLY_UNMAPPED: 0,
    NO_MATCH: 0,
  };
  const concepts = new Map<string, SimulatedMappingCoverage["byConcept"][number]>();

  for (const decision of decisions) {
    byMethod[decision.mappingMethod] += 1;
    const existing = concepts.get(decision.conceptKey);
    if (existing) {
      existing.lines += 1;
      continue;
    }
    concepts.set(decision.conceptKey, {
      conceptKey: decision.conceptKey,
      sourceLabel: labelByConcept.get(decision.conceptKey) ?? decision.conceptKey,
      metricKey: decision.metricKey,
      method: decision.mappingMethod,
      lines: 1,
    });
  }

  const mapped = decisions.filter((decision) => decision.metricKey !== null).length;
  return {
    lines: decisions.length,
    mapped,
    unmapped: decisions.length - mapped,
    byMethod,
    byConcept: [...concepts.values()].sort((left, right) =>
      left.conceptKey.localeCompare(right.conceptKey),
    ),
  };
}
