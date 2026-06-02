/**
 * Pure evaluation of presentation-node value rules.
 *
 * Each canonical key assigned to a node carries two settings:
 *   - valueMode: NOMINAL (the fact's signed value) or ABSOLUTE (its magnitude).
 *     This absorbs the fact that companies book the same line with opposite
 *     signs (costs as +100 vs -100).
 *   - operation: how the key folds into the node's computed value — ADD,
 *     SUBTRACT, MULTIPLY, DIVIDE, or MATCH.
 *
 * MATCH keys are not operands: they declare a value that the fold of the
 * node's other keys is expected to equal. When the folded result deviates
 * from a MATCH value beyond a reasonable tolerance, a deviation is reported so
 * the filing can be routed to manual review.
 *
 * This module is Prisma-free and deterministic so it can be unit-tested and
 * run inside the extraction pipeline without DB access.
 */

export type KeyValueMode = "NOMINAL" | "ABSOLUTE";
export type KeyOperation = "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MATCH";

export type NodeEvalKey = {
  metricKey: string;
  valueMode: KeyValueMode;
  operation: KeyOperation;
};

export type NodeEvalConfig = {
  nodeId: string;
  nodeLabel: string;
  keys: NodeEvalKey[];
};

export type NodeMatchDeviation = {
  nodeId: string;
  nodeLabel: string;
  /** The key whose value the fold was compared against. */
  matchMetricKey: string;
  /** Folded value of the node's operand keys. */
  computedValue: number;
  /** The MATCH key's (mode-adjusted) value. */
  matchValue: number;
  /** |computed - match|. */
  absoluteDeviation: number;
  /** Deviation as a fraction of the larger magnitude (0.02 = 2%). */
  relativeDeviation: number;
  /** The tolerance window that was exceeded. */
  tolerance: number;
};

/** Default tolerance: 1% relative deviation is acceptable. */
export const DEFAULT_MATCH_RELATIVE_TOLERANCE = 0.01;

/**
 * Default absolute floor (in full NOK). Below this, relative tolerance is
 * meaningless (near-zero noise), so any deviation within one krone passes.
 */
export const DEFAULT_MATCH_ABSOLUTE_FLOOR = 1;

function readValue(key: NodeEvalKey, facts: Map<string, number>): number | undefined {
  const raw = facts.get(key.metricKey);
  if (raw === undefined || !Number.isFinite(raw)) {
    return undefined;
  }
  return key.valueMode === "ABSOLUTE" ? Math.abs(raw) : raw;
}

/**
 * Folds operand keys (everything except MATCH) left-to-right into a single
 * value. Missing facts are skipped so a partially-extracted filing does not
 * produce a false MATCH deviation. Returns null when nothing could be computed
 * (no operand values, or a divide-by-zero made the result undefined).
 */
function foldOperands(keys: NodeEvalKey[], facts: Map<string, number>): number | null {
  let acc: number | null = null;

  for (const key of keys) {
    const value = readValue(key, facts);
    if (value === undefined) {
      continue; // skip missing operand — no false flag
    }

    if (acc === null) {
      // First present operand seeds the accumulator. SUBTRACT negates it;
      // MULTIPLY/DIVIDE act as identity on an empty fold.
      acc = key.operation === "SUBTRACT" ? -value : value;
      continue;
    }

    switch (key.operation) {
      case "ADD":
        acc += value;
        break;
      case "SUBTRACT":
        acc -= value;
        break;
      case "MULTIPLY":
        acc *= value;
        break;
      case "DIVIDE":
        if (value === 0) {
          return null; // cannot compute — skip rather than flag
        }
        acc /= value;
        break;
      default:
        break;
    }
  }

  return acc;
}

/**
 * Evaluates every node that declares one or more MATCH keys and returns the
 * deviations that fall outside tolerance. Nodes without enough data to compute
 * a folded value, or whose MATCH facts are missing, are silently skipped.
 */
export function evaluateNodeMatches(input: {
  nodes: NodeEvalConfig[];
  facts: Map<string, number>;
  relativeTolerance?: number;
  absoluteFloor?: number;
}): NodeMatchDeviation[] {
  const relativeTolerance = input.relativeTolerance ?? DEFAULT_MATCH_RELATIVE_TOLERANCE;
  const absoluteFloor = input.absoluteFloor ?? DEFAULT_MATCH_ABSOLUTE_FLOOR;
  const deviations: NodeMatchDeviation[] = [];

  for (const node of input.nodes) {
    const matchKeys = node.keys.filter((key) => key.operation === "MATCH");
    if (matchKeys.length === 0) {
      continue;
    }

    const operandKeys = node.keys.filter((key) => key.operation !== "MATCH");
    const computed = foldOperands(operandKeys, input.facts);
    if (computed === null || !Number.isFinite(computed)) {
      continue; // not enough operand data to compare against
    }

    for (const matchKey of matchKeys) {
      const matchValue = readValue(matchKey, input.facts);
      if (matchValue === undefined) {
        continue; // MATCH fact not extracted — nothing to compare
      }

      const absoluteDeviation = Math.abs(computed - matchValue);
      const scale = Math.max(Math.abs(computed), Math.abs(matchValue));
      const tolerance = Math.max(absoluteFloor, relativeTolerance * scale);

      if (absoluteDeviation > tolerance) {
        deviations.push({
          nodeId: node.nodeId,
          nodeLabel: node.nodeLabel,
          matchMetricKey: matchKey.metricKey,
          computedValue: computed,
          matchValue,
          absoluteDeviation,
          relativeDeviation: scale === 0 ? 0 : absoluteDeviation / scale,
          tolerance,
        });
      }
    }
  }

  return deviations;
}
