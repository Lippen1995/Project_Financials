import {
  canonicalMetricLayout,
  type CanonicalMetricKey,
} from "@/server/financials/canonical-taxonomy";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

export type RankableAccuracyFact = {
  metricKey: string;
  statementScope: string;
  fiscalYear: number;
  value: string | number | bigint;
  rawLabel?: string | null;
  sourceRowText?: string | null;
};

const nodeTypeByMetricKey = new Map(
  canonicalMetricLayout.map((entry) => [entry.key, entry.nodeType]),
);

function slotKey(fact: RankableAccuracyFact) {
  return `${fact.metricKey}|${fact.statementScope}|${fact.fiscalYear}`;
}

function valueKey(fact: RankableAccuracyFact) {
  return `${slotKey(fact)}|${String(fact.value).trim()}`;
}

function startsWithSumLabel(fact: RankableAccuracyFact) {
  const label = normalizeNorwegianText(fact.rawLabel ?? "");
  return label.startsWith("sum ");
}

function dedupeFacts<T extends RankableAccuracyFact>(facts: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const fact of facts) {
    const key = valueKey(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(fact);
  }
  return result;
}

/**
 * Removes structurally weaker canonical candidates from eval/extraction facts.
 *
 * Some OCR rows correctly map both a component line and a subtotal line to the
 * same canonical key because legacy aliases are intentionally broad. When both
 * are present on the same metric/scope/year slot, the canonical layout tells us
 * which row shape is expected: line metrics prefer non-"Sum" labels, subtotal
 * and total metrics prefer "Sum" labels. Slots with only line candidates are
 * left untouched, because several metrics legitimately occur multiple times.
 */
export function rankCanonicalAccuracyFacts<T extends RankableAccuracyFact>(facts: T[]): T[] {
  const bySlot = new Map<string, T[]>();
  const passthrough: T[] = [];

  for (const fact of facts) {
    if (fact.metricKey.startsWith("as_reported_")) {
      passthrough.push(fact);
      continue;
    }
    const nodeType = nodeTypeByMetricKey.get(fact.metricKey as CanonicalMetricKey);
    if (!nodeType) {
      passthrough.push(fact);
      continue;
    }
    const key = slotKey(fact);
    const current = bySlot.get(key) ?? [];
    current.push(fact);
    bySlot.set(key, current);
  }

  const selected: T[] = [...passthrough];
  for (const [key, slotFacts] of bySlot) {
    const nodeType = nodeTypeByMetricKey.get(slotFacts[0]!.metricKey as CanonicalMetricKey);
    const sumFacts = slotFacts.filter(startsWithSumLabel);
    const nonSumFacts = slotFacts.filter((fact) => !startsWithSumLabel(fact));

    if (sumFacts.length > 0 && nonSumFacts.length > 0) {
      selected.push(...(nodeType === "line" ? nonSumFacts : sumFacts));
    } else {
      selected.push(...slotFacts);
    }

    bySlot.delete(key);
  }

  return dedupeFacts(selected);
}
