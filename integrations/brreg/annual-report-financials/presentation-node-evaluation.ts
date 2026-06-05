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

export type NodeKind = "LINE" | "SUBTOTAL";

export type NodeEvalKey = {
  metricKey: string;
  valueMode: KeyValueMode;
  operation: KeyOperation;
};

/** A node-to-node input of a SUBTOTAL: the source node's value, signed. */
export type NodeEvalOperand = {
  sourceNodeId: string;
  operation: "ADD" | "SUBTRACT";
};

export type NodeEvalConfig = {
  nodeId: string;
  nodeLabel: string;
  /**
   * LINE nodes derive their value by folding their operand keys; SUBTOTAL nodes
   * derive it by folding their operand nodes (see `operands`). Defaults to LINE
   * when omitted for backward compatibility.
   */
  kind?: NodeKind;
  keys: NodeEvalKey[];
  /** Operand nodes for a SUBTOTAL. Ignored for LINE nodes. */
  operands?: NodeEvalOperand[];
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
 * Folds a SUBTOTAL's operand nodes into a single value: the signed sum of each
 * source node's computed value. Missing (incomputable) operand nodes are
 * skipped — consistent with the operand-key fold — so a partially-extracted
 * filing does not raise a false MATCH deviation. Returns null when nothing
 * could be computed.
 */
function foldOperandNodes(
  operands: NodeEvalOperand[],
  valueOf: (nodeId: string) => number | null,
): number | null {
  let acc: number | null = null;

  for (const operand of operands) {
    const value = valueOf(operand.sourceNodeId);
    if (value === null || !Number.isFinite(value)) {
      continue; // skip incomputable operand node — no false flag
    }
    if (acc === null) {
      acc = operand.operation === "SUBTRACT" ? -value : value;
      continue;
    }
    acc = operand.operation === "SUBTRACT" ? acc - value : acc + value;
  }

  return acc;
}

/**
 * Builds a memoized resolver for a node's computed value:
 *   - LINE node → fold of its operand (non-MATCH) keys from the facts.
 *   - SUBTOTAL node → signed fold of its operand nodes' values (recursive).
 * A cycle guard returns null for any node currently being resolved; the admin
 * UI already forbids cycles, this is defence in depth.
 */
function makeNodeValueResolver(
  nodes: NodeEvalConfig[],
  facts: Map<string, number>,
): (nodeId: string) => number | null {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const memo = new Map<string, number | null>();
  const inProgress = new Set<string>();

  function resolve(nodeId: string): number | null {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached;

    const node = byId.get(nodeId);
    if (!node) return null;
    if (inProgress.has(nodeId)) return null; // cycle guard

    inProgress.add(nodeId);
    const value =
      node.kind === "SUBTOTAL"
        ? foldOperandNodes(node.operands ?? [], resolve)
        : foldOperands(
            node.keys.filter((key) => key.operation !== "MATCH"),
            facts,
          );
    inProgress.delete(nodeId);

    memo.set(nodeId, value);
    return value;
  }

  return resolve;
}

/**
 * Evaluates every node that declares one or more MATCH keys and returns the
 * deviations that fall outside tolerance. A node's computed value comes from its
 * operand keys (LINE) or its operand nodes (SUBTOTAL). Nodes without enough data
 * to compute a value, or whose MATCH facts are missing, are silently skipped.
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
  const valueOf = makeNodeValueResolver(input.nodes, input.facts);

  for (const node of input.nodes) {
    const matchKeys = node.keys.filter((key) => key.operation === "MATCH");
    if (matchKeys.length === 0) {
      continue;
    }

    const computed = valueOf(node.nodeId);
    if (computed === null || !Number.isFinite(computed)) {
      continue; // not enough data to compare against
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
