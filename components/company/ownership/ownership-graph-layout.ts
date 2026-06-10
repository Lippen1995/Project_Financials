import type { OwnershipRelationship } from "@/server/ownership/ownership-thresholds";
import type { GroupNode } from "@/server/ownership/types";

export const NODE_WIDTH = 244;
export const NODE_HEIGHT = 96;
export const H_GAP = 28;
export const V_GAP = 78;
/** Max children rendered under one parent before the rest fold into an overflow node. */
export const DEFAULT_CHILD_CAP = 12;

export type RenderNode = {
  id: string;
  kind: "company" | "overflow";
  orgNumber: string | null;
  name: string;
  ownershipPercent: number | null;
  relationship: OwnershipRelationship | null;
  isCurrent: boolean;
  isRoot: boolean;
  depth: number;
  parentOrgNumber: string | null;
  /** Total direct children in the data (company nodes). */
  childCount: number;
  /** Children hidden behind this node because it is collapsed. */
  collapsed: boolean;
  /** Children folded into an overflow node (overflow nodes only). */
  hiddenChildCount: number;
  /** Registry status from the local Company table, when known. */
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT" | null;
  x: number;
  y: number;
};

export type RenderEdge = {
  id: string;
  source: string;
  target: string;
  relationship: OwnershipRelationship | null;
};

export type RenderTree = {
  nodes: RenderNode[];
  edges: RenderEdge[];
  width: number;
  height: number;
};

export function buildChildrenMap(nodes: GroupNode[]): Map<string, GroupNode[]> {
  const map = new Map<string, GroupNode[]>();
  for (const node of nodes) {
    if (node.parentOrgNumber) {
      const list = map.get(node.parentOrgNumber) ?? [];
      list.push(node);
      map.set(node.parentOrgNumber, list);
    }
  }
  return map;
}

function ancestorsOf(nodes: GroupNode[], orgNumber: string): Set<string> {
  const byOrg = new Map(nodes.map((node) => [node.orgNumber, node]));
  const chain = new Set<string>();
  let cursor = byOrg.get(orgNumber);
  while (cursor) {
    chain.add(cursor.orgNumber);
    cursor = cursor.parentOrgNumber ? byOrg.get(cursor.parentOrgNumber) : undefined;
  }
  return chain;
}

/**
 * Initial collapsed set: focus the view on the current company. The path from the root
 * down to the current company (and the current company itself) stays expanded; every
 * other node that has children starts collapsed. This keeps large sibling branches out
 * of the way while still showing "where you are" and your direct subsidiaries.
 */
export function computeDefaultCollapsed(nodes: GroupNode[], currentOrgNumber: string): Set<string> {
  const keepExpanded = ancestorsOf(nodes, currentOrgNumber);
  const collapsed = new Set<string>();
  for (const node of nodes) {
    if (node.childCount > 0 && !keepExpanded.has(node.orgNumber)) {
      collapsed.add(node.orgNumber);
    }
  }
  return collapsed;
}

/**
 * Lay out the visible portion of the group tree top-down: y by depth, x by a leaf cursor
 * with parents centred over their rendered children. Collapsed nodes hide their subtree;
 * parents with more than `childCap` visible children fold the remainder into a single
 * overflow node (unless that parent is in `expandedOverflow`).
 */
export function buildRenderTree(
  nodes: GroupNode[],
  options: {
    collapsed: Set<string>;
    expandedOverflow: Set<string>;
    currentOrgNumber: string;
    rootOrgNumber: string;
    childCap?: number;
  },
): RenderTree {
  const childCap = options.childCap ?? DEFAULT_CHILD_CAP;
  const childrenMap = buildChildrenMap(nodes);
  const root =
    nodes.find((node) => node.orgNumber === options.rootOrgNumber) ??
    nodes.find((node) => node.parentOrgNumber === null) ??
    nodes[0];

  const renderNodes: RenderNode[] = [];
  const renderEdges: RenderEdge[] = [];
  let leafCursor = 0;
  let maxDepth = 0;

  if (!root) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const pushCompany = (node: GroupNode, x: number, isCollapsed: boolean) => {
    maxDepth = Math.max(maxDepth, node.depth);
    renderNodes.push({
      id: node.orgNumber,
      kind: "company",
      orgNumber: node.orgNumber,
      name: node.name,
      ownershipPercent: node.ownershipPercent,
      relationship: node.relationshipToParent,
      isCurrent: node.orgNumber === options.currentOrgNumber,
      isRoot: node.orgNumber === root.orgNumber,
      depth: node.depth,
      parentOrgNumber: node.parentOrgNumber,
      childCount: node.childCount,
      collapsed: isCollapsed,
      hiddenChildCount: 0,
      status: node.status ?? null,
      x,
      y: node.depth * (NODE_HEIGHT + V_GAP),
    });
  };

  const place = (node: GroupNode): number => {
    const isCollapsed = node.childCount > 0 && options.collapsed.has(node.orgNumber);
    const allChildren = isCollapsed ? [] : (childrenMap.get(node.orgNumber) ?? []);

    if (allChildren.length === 0) {
      const x = leafCursor * (NODE_WIDTH + H_GAP);
      leafCursor += 1;
      pushCompany(node, x, isCollapsed);
      return x;
    }

    const capped =
      allChildren.length > childCap && !options.expandedOverflow.has(node.orgNumber);
    const shownChildren = capped ? allChildren.slice(0, childCap) : allChildren;

    const childXs: number[] = [];
    for (const child of shownChildren) {
      const childX = place(child);
      childXs.push(childX);
      renderEdges.push({
        id: `${node.orgNumber}->${child.orgNumber}`,
        source: node.orgNumber,
        target: child.orgNumber,
        relationship: child.relationshipToParent,
      });
    }

    if (capped) {
      const hidden = allChildren.length - childCap;
      const overflowX = leafCursor * (NODE_WIDTH + H_GAP);
      leafCursor += 1;
      const overflowDepth = node.depth + 1;
      maxDepth = Math.max(maxDepth, overflowDepth);
      const overflowId = `overflow:${node.orgNumber}`;
      renderNodes.push({
        id: overflowId,
        kind: "overflow",
        orgNumber: null,
        name: `+${hidden} flere`,
        ownershipPercent: null,
        relationship: null,
        isCurrent: false,
        isRoot: false,
        depth: overflowDepth,
        parentOrgNumber: node.orgNumber,
        childCount: 0,
        collapsed: false,
        hiddenChildCount: hidden,
        status: null,
        x: overflowX,
        y: overflowDepth * (NODE_HEIGHT + V_GAP),
      });
      renderEdges.push({
        id: `${node.orgNumber}->${overflowId}`,
        source: node.orgNumber,
        target: overflowId,
        relationship: null,
      });
      childXs.push(overflowX);
    }

    const x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    pushCompany(node, x, isCollapsed);
    return x;
  };

  place(root);

  return {
    nodes: renderNodes,
    edges: renderEdges,
    width: Math.max(leafCursor, 1) * (NODE_WIDTH + H_GAP),
    height: (maxDepth + 1) * (NODE_HEIGHT + V_GAP),
  };
}
