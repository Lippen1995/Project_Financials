import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { NodeEvalConfig } from "@/integrations/brreg/annual-report-financials/presentation-node-evaluation";
import { loadCanonicalRegistry } from "@/server/services/canonical-registry-service";

// ---------------------------------------------------------------------------
// UI model
// ---------------------------------------------------------------------------

export type PresentationNodeKind = "LINE" | "SUBTOTAL";

export type PresentationNodeModel = {
  id: string;
  label: string;
  kind: PresentationNodeKind;
  positionX: number;
  positionY: number;
};

/** How a key's fact value is read before it folds into the node value. */
export type KeyValueMode = "NOMINAL" | "ABSOLUTE";

/** How a key folds into its node's computed value. */
export type KeyOperation = "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MATCH";

export const KEY_VALUE_MODES: readonly KeyValueMode[] = ["NOMINAL", "ABSOLUTE"];
export const KEY_OPERATIONS: readonly KeyOperation[] = [
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "DIVIDE",
  "MATCH",
];

export type PresentationKeyModel = {
  /** Metric key identifier (canonical skeleton key OR a reviewer-created key). */
  key: string;
  /** Display label for the key. */
  label: string;
  family: "INCOME_STATEMENT" | "BALANCE_SHEET";
  /** Node the key is assigned to, or null when unassigned. */
  nodeId: string | null;
  /** Nominal (signed) vs absolute value of the fact. Only meaningful when assigned. */
  valueMode: KeyValueMode;
  /** How the key folds into the node value. Only meaningful when assigned. */
  operation: KeyOperation;
  /**
   * True when the key is not part of the fixed code skeleton but was created by
   * a reviewer typing a free-text metricKey in manual review.
   */
  isCustom: boolean;
};

function normalizeValueMode(value: string): KeyValueMode {
  return value === "ABSOLUTE" ? "ABSOLUTE" : "NOMINAL";
}

function normalizeKeyOperation(value: string): KeyOperation {
  return (KEY_OPERATIONS as readonly string[]).includes(value)
    ? (value as KeyOperation)
    : "ADD";
}

export type LinkOperation = "ADD" | "SUBTRACT";

export type PresentationLinkModel = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  operation: LinkOperation;
};

export type NodeMappingModel = {
  nodes: PresentationNodeModel[];
  keys: PresentationKeyModel[];
  links: PresentationLinkModel[];
};

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

/** Humanize a raw metric key id for display, e.g. "other_revenue" → "Other revenue". */
function humanizeKey(key: string): string {
  const cleaned = key.replace(/[_\s]+/g, " ").trim();
  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Distinct metric keys that reviewers have actually used — i.e. the free-text
 * metricKey values persisted to reviewed facts. These become the source of
 * "custom" canonical keys that show up in the flow automatically, without any
 * code change.
 */
async function loadReviewerMetricKeys(): Promise<
  { metricKey: string; statementType: string }[]
> {
  return prisma.annualReportReviewedFact.findMany({
    distinct: ["metricKey"],
    select: { metricKey: true, statementType: true },
  });
}

export async function buildNodeMappingModel(): Promise<NodeMappingModel> {
  const [nodes, assignments, links, reviewerKeys, registry] = await Promise.all([
    prisma.presentationNode.findMany({ orderBy: { positionY: "asc" } }),
    prisma.presentationNodeKey.findMany(),
    prisma.presentationNodeLink.findMany(),
    loadReviewerMetricKeys(),
    loadCanonicalRegistry(),
  ]);

  const assignmentByKey = new Map(assignments.map((a) => [a.metricKey, a]));
  const configFor = (metricKey: string) => {
    const a = assignmentByKey.get(metricKey);
    return {
      nodeId: a?.nodeId ?? null,
      valueMode: normalizeValueMode(a?.valueMode ?? "NOMINAL"),
      operation: normalizeKeyOperation(a?.operation ?? "ADD"),
    };
  };

  // 1. Registry (skeleton) keys — the well-known canonical keys with display
  //    metadata, sourced from the DB registry (code fallback when unseeded).
  const keys: PresentationKeyModel[] = registry.map((entry) => ({
    key: entry.key,
    label: entry.label,
    family: entry.family,
    ...configFor(entry.key),
    isCustom: false,
  }));

  // 2. Reviewer-created keys — any metricKey seen in manual review that the
  //    registry does not already cover. Surfaced automatically so a reviewer
  //    can drag them onto a node.
  const known = new Set(keys.map((k) => k.key));
  for (const { metricKey, statementType } of reviewerKeys) {
    if (known.has(metricKey)) continue;
    known.add(metricKey);
    keys.push({
      key: metricKey,
      label: humanizeKey(metricKey),
      family: statementType === "BALANCE_SHEET" ? "BALANCE_SHEET" : "INCOME_STATEMENT",
      ...configFor(metricKey),
      isCustom: true,
    });
  }

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind === "SUBTOTAL" ? "SUBTOTAL" : "LINE",
      positionX: n.positionX,
      positionY: n.positionY,
    })),
    keys,
    links: links.map((l) => ({
      id: l.id,
      sourceNodeId: l.sourceNodeId,
      targetNodeId: l.targetNodeId,
      operation: l.operation === "SUBTRACT" ? "SUBTRACT" : "ADD",
    })),
  };
}

/**
 * Loads the node value-rule configuration used by the extraction pipeline:
 * every node that has at least one assigned key, with each key's value mode and
 * fold operation. Read once per extraction run and handed to the pure
 * evaluator. Nodes without assigned keys are omitted (nothing to evaluate).
 */
export async function loadNodeEvaluationConfig(): Promise<NodeEvalConfig[]> {
  const [nodes, assignments] = await Promise.all([
    prisma.presentationNode.findMany({ select: { id: true, label: true } }),
    prisma.presentationNodeKey.findMany({
      select: { metricKey: true, nodeId: true, valueMode: true, operation: true },
    }),
  ]);

  const labelByNode = new Map(nodes.map((n) => [n.id, n.label]));
  const keysByNode = new Map<string, NodeEvalConfig["keys"]>();
  for (const a of assignments) {
    const list = keysByNode.get(a.nodeId) ?? [];
    list.push({
      metricKey: a.metricKey,
      valueMode: normalizeValueMode(a.valueMode),
      operation: normalizeKeyOperation(a.operation),
    });
    keysByNode.set(a.nodeId, list);
  }

  return [...keysByNode.entries()].map(([nodeId, keys]) => ({
    nodeId,
    nodeLabel: labelByNode.get(nodeId) ?? nodeId,
    keys,
  }));
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NodeLinkError extends Error {}

// ---------------------------------------------------------------------------
// Node CRUD
// ---------------------------------------------------------------------------

export async function createNode(input: {
  label: string;
  kind?: PresentationNodeKind;
  positionX?: number;
  positionY?: number;
  userId?: string | null;
}) {
  const label = input.label.trim();
  if (!label) throw new Error("Node må ha et navn.");

  return prisma.presentationNode.create({
    data: {
      label,
      kind: input.kind ?? "LINE",
      positionX: input.positionX ?? 0,
      positionY: input.positionY ?? 0,
      createdByUserId: input.userId ?? null,
    },
  });
}

export async function updateNode(input: {
  id: string;
  label?: string;
  kind?: PresentationNodeKind;
  positionX?: number;
  positionY?: number;
}) {
  const data: Prisma.PresentationNodeUpdateInput = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error("Node må ha et navn.");
    data.label = label;
  }
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.positionX !== undefined) data.positionX = input.positionX;
  if (input.positionY !== undefined) data.positionY = input.positionY;

  return prisma.presentationNode.update({ where: { id: input.id }, data });
}

export async function deleteNode(id: string) {
  // Cascade removes the node's key assignments and its links.
  await prisma.presentationNode.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Key assignment — a key belongs to at most one node.
// ---------------------------------------------------------------------------

/**
 * The full set of assignable metric keys: the canonical-key registry plus every
 * key a reviewer has created via manual review. A key must be one of these to
 * be assigned to a node — this rejects typos/garbage while allowing the
 * dynamic, reviewer-created keys.
 */
async function loadKnownMetricKeys(): Promise<Set<string>> {
  const [reviewerKeys, registry] = await Promise.all([
    loadReviewerMetricKeys(),
    loadCanonicalRegistry(),
  ]);
  const set = new Set<string>(registry.map((e) => e.key));
  for (const { metricKey } of reviewerKeys) set.add(metricKey);
  return set;
}

export async function assignKey(input: { metricKey: string; nodeId: string | null }) {
  const known = await loadKnownMetricKeys();
  if (!known.has(input.metricKey)) {
    throw new Error(`Ukjent regnskapsnøkkel: ${input.metricKey}`);
  }

  if (input.nodeId === null) {
    await prisma.presentationNodeKey
      .delete({ where: { metricKey: input.metricKey } })
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return; // already unassigned
        }
        throw error;
      });
    return;
  }

  await prisma.presentationNodeKey.upsert({
    where: { metricKey: input.metricKey },
    create: { metricKey: input.metricKey, nodeId: input.nodeId },
    update: { nodeId: input.nodeId },
  });
}

/**
 * Updates how an already-assigned key contributes to its node value: the
 * value mode (nominal vs absolute) and the fold operation (ADD/SUBTRACT/
 * MULTIPLY/DIVIDE/MATCH). The key must already be assigned to a node.
 */
export async function updateKeyConfig(input: {
  metricKey: string;
  valueMode?: KeyValueMode;
  operation?: KeyOperation;
}) {
  const data: Prisma.PresentationNodeKeyUpdateInput = {};
  if (input.valueMode !== undefined) data.valueMode = input.valueMode;
  if (input.operation !== undefined) data.operation = input.operation;
  if (Object.keys(data).length === 0) return;

  try {
    await prisma.presentationNodeKey.update({
      where: { metricKey: input.metricKey },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new Error(`Nøkkelen er ikke tildelt en node: ${input.metricKey}`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Node-to-node links (subtotal composition)
// ---------------------------------------------------------------------------

function wouldCreateCycle(
  links: { sourceNodeId: string; targetNodeId: string }[],
  source: string,
  target: string,
): boolean {
  // Adding source -> target creates a cycle if target can already reach source.
  const adjacency = new Map<string, string[]>();
  for (const link of links) {
    const list = adjacency.get(link.sourceNodeId) ?? [];
    list.push(link.targetNodeId);
    adjacency.set(link.sourceNodeId, list);
  }
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

export async function createLink(input: {
  sourceNodeId: string;
  targetNodeId: string;
  operation?: LinkOperation;
}) {
  if (input.sourceNodeId === input.targetNodeId) {
    throw new NodeLinkError("En node kan ikke kobles til seg selv.");
  }

  const existingLinks = await prisma.presentationNodeLink.findMany({
    select: { sourceNodeId: true, targetNodeId: true },
  });
  if (wouldCreateCycle(existingLinks, input.sourceNodeId, input.targetNodeId)) {
    throw new NodeLinkError("Koblingen ville laget en sirkel.");
  }

  try {
    return await prisma.presentationNodeLink.create({
      data: {
        sourceNodeId: input.sourceNodeId,
        targetNodeId: input.targetNodeId,
        operation: input.operation ?? "ADD",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new NodeLinkError("Denne koblingen finnes allerede.");
    }
    throw error;
  }
}

export async function updateLink(input: { id: string; operation: LinkOperation }) {
  return prisma.presentationNodeLink.update({
    where: { id: input.id },
    data: { operation: input.operation },
  });
}

export async function deleteLink(id: string) {
  await prisma.presentationNodeLink.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Subtotal composition: a new SUBTOTAL node whose value is the signed sum of
// the operand nodes. Creates the node and one link per operand in one step.
// ---------------------------------------------------------------------------

export async function createSubtotal(input: {
  label: string;
  operands: { nodeId: string; operation: LinkOperation }[];
  positionX?: number;
  positionY?: number;
  userId?: string | null;
}) {
  const label = input.label.trim();
  if (!label) throw new Error("Subtotal må ha et navn.");
  if (input.operands.length === 0) {
    throw new NodeLinkError("En subtotal må ha minst én node som input.");
  }
  const uniqueOperandIds = new Set(input.operands.map((o) => o.nodeId));
  if (uniqueOperandIds.size !== input.operands.length) {
    throw new NodeLinkError("Samme node er valgt flere ganger.");
  }

  return prisma.$transaction(async (tx) => {
    const node = await tx.presentationNode.create({
      data: {
        label,
        kind: "SUBTOTAL",
        positionX: input.positionX ?? 480,
        positionY: input.positionY ?? 40,
        createdByUserId: input.userId ?? null,
      },
    });

    await tx.presentationNodeLink.createMany({
      data: input.operands.map((operand) => ({
        sourceNodeId: operand.nodeId,
        targetNodeId: node.id,
        operation: operand.operation,
      })),
    });

    return node;
  });
}
