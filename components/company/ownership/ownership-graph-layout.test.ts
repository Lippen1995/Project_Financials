import { describe, expect, it } from "vitest";

import type { GroupNode } from "@/server/ownership/types";
import {
  buildRenderTree,
  computeDefaultCollapsed,
  DEFAULT_CHILD_CAP,
  NODE_HEIGHT,
  V_GAP,
} from "./ownership-graph-layout";

/** Build a node list from [org, parent] pairs; depth and childCount are derived. */
function makeNodes(
  edges: Array<[org: string, parent: string | null]>,
  currentOrg: string,
): GroupNode[] {
  const parentOf = new Map(edges.map(([org, parent]) => [org, parent]));
  const childCount = new Map<string, number>();
  for (const [, parent] of edges) {
    if (parent) childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
  }
  const depthOf = (org: string): number => {
    let depth = 0;
    let cursor = parentOf.get(org) ?? null;
    while (cursor) {
      depth += 1;
      cursor = parentOf.get(cursor) ?? null;
    }
    return depth;
  };
  return edges.map(([org, parent]) => ({
    orgNumber: org,
    name: `${org} AS`,
    relationshipToParent: parent ? "SUBSIDIARY" : null,
    ownershipPercent: parent ? 100 : null,
    depth: depthOf(org),
    parentOrgNumber: parent,
    isCurrent: org === currentOrg,
    childCount: childCount.get(org) ?? 0,
  }));
}

const opts = (nodes: GroupNode[], current: string, root: string, extra = {}) => ({
  collapsed: computeDefaultCollapsed(nodes, current),
  expandedOverflow: new Set<string>(),
  currentOrgNumber: current,
  rootOrgNumber: root,
  ...extra,
});

describe("computeDefaultCollapsed", () => {
  it("keeps the path from root to current expanded and collapses other branches", () => {
    const nodes = makeNodes(
      [
        ["ROOT", null],
        ["A", "ROOT"], // on path to current
        ["A1", "A"], // current
        ["B", "ROOT"], // sibling branch, has children -> collapsed
        ["B1", "B"],
      ],
      "A1",
    );
    const collapsed = computeDefaultCollapsed(nodes, "A1");
    expect(collapsed.has("ROOT")).toBe(false);
    expect(collapsed.has("A")).toBe(false);
    expect(collapsed.has("B")).toBe(true);
  });
});

describe("buildRenderTree", () => {
  it("lays out depth on the y axis and renders every visible node", () => {
    const nodes = makeNodes(
      [
        ["ROOT", null],
        ["A", "ROOT"],
        ["B", "ROOT"],
      ],
      "ROOT",
    );
    const tree = buildRenderTree(nodes, opts(nodes, "ROOT", "ROOT"));
    expect(tree.nodes).toHaveLength(3);
    const root = tree.nodes.find((n) => n.id === "ROOT")!;
    const a = tree.nodes.find((n) => n.id === "A")!;
    expect(root.y).toBe(0);
    expect(a.y).toBe(NODE_HEIGHT + V_GAP);
    // root centred over its two children
    const b = tree.nodes.find((n) => n.id === "B")!;
    expect(root.x).toBeCloseTo((a.x + b.x) / 2);
  });

  it("hides the subtree of a collapsed node but marks it collapsed", () => {
    const nodes = makeNodes(
      [
        ["ROOT", null],
        ["A", "ROOT"],
        ["A1", "A"],
      ],
      "ROOT",
    );
    // Current is ROOT, so A (a child with its own child) is collapsed by default.
    const tree = buildRenderTree(nodes, opts(nodes, "ROOT", "ROOT"));
    expect(tree.nodes.find((n) => n.id === "A1")).toBeUndefined();
    expect(tree.nodes.find((n) => n.id === "A")!.collapsed).toBe(true);
  });

  it("folds children beyond the cap into a single overflow node", () => {
    const childCount = DEFAULT_CHILD_CAP + 5;
    const edges: Array<[string, string | null]> = [["ROOT", null]];
    for (let i = 0; i < childCount; i += 1) edges.push([`C${i}`, "ROOT"]);
    const nodes = makeNodes(edges, "ROOT");

    const tree = buildRenderTree(nodes, opts(nodes, "ROOT", "ROOT"));
    const companies = tree.nodes.filter((n) => n.kind === "company");
    const overflow = tree.nodes.filter((n) => n.kind === "overflow");
    expect(companies).toHaveLength(1 + DEFAULT_CHILD_CAP); // root + capped children
    expect(overflow).toHaveLength(1);
    expect(overflow[0].hiddenChildCount).toBe(5);
  });

  it("reveals all children when the parent's overflow is expanded", () => {
    const childCount = DEFAULT_CHILD_CAP + 5;
    const edges: Array<[string, string | null]> = [["ROOT", null]];
    for (let i = 0; i < childCount; i += 1) edges.push([`C${i}`, "ROOT"]);
    const nodes = makeNodes(edges, "ROOT");

    const tree = buildRenderTree(
      nodes,
      opts(nodes, "ROOT", "ROOT", { expandedOverflow: new Set(["ROOT"]) }),
    );
    expect(tree.nodes.filter((n) => n.kind === "overflow")).toHaveLength(0);
    expect(tree.nodes.filter((n) => n.kind === "company")).toHaveLength(1 + childCount);
  });
});
