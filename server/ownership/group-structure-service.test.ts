import { describe, expect, it } from "vitest";

import {
  buildGroupStructure,
  type ChildEdge,
  type GroupStructureDeps,
} from "@/server/ownership/group-structure-service";

type Edge = {
  owner: string;
  ownerName: string;
  issuer: string;
  issuerName: string;
  rel: "SUBSIDIARY" | "ASSOCIATED";
  pct: number;
};

/** Build injectable deps from a flat in-memory edge list. */
function depsFrom(edges: Edge[]): GroupStructureDeps {
  return {
    async getControllingParent(orgNumber) {
      const controlling = edges
        .filter((edge) => edge.issuer === orgNumber && edge.rel === "SUBSIDIARY")
        .sort((a, b) => b.pct - a.pct);
      const top = controlling[0];
      return top
        ? { ownerOrgNumber: top.owner, ownerName: top.ownerName, ownershipPercent: top.pct }
        : null;
    },
    async getChildren(owners) {
      const owned = new Set(owners);
      return edges
        .filter((edge) => owned.has(edge.owner))
        .map<ChildEdge>((edge) => ({
          ownerOrgNumber: edge.owner,
          issuerOrgNumber: edge.issuer,
          issuerName: edge.issuerName,
          relationship: edge.rel,
          ownershipPercent: edge.pct,
        }));
    },
  };
}

const e = (
  owner: string,
  issuer: string,
  rel: "SUBSIDIARY" | "ASSOCIATED",
  pct: number,
): Edge => ({ owner, ownerName: `${owner} AS`, issuer, issuerName: `${issuer} AS`, rel, pct });

describe("buildGroupStructure — downward", () => {
  it("builds a recursive subsidiary tree and attaches associated companies as leaves", async () => {
    const edges = [
      e("TOP", "A", "SUBSIDIARY", 100),
      e("A", "B", "SUBSIDIARY", 60),
      e("TOP", "C", "ASSOCIATED", 30),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "TOP", year: 2025, currentName: "Top AS" },
      depsFrom(edges),
    );

    expect(result.rootOrgNumber).toBe("TOP");
    expect(result.ultimateParent).toBeNull();
    expect(result.truncated).toBe(false);

    const byOrg = new Map(result.nodes.map((node) => [node.orgNumber, node]));
    expect(byOrg.get("TOP")?.depth).toBe(0);
    expect(byOrg.get("TOP")?.name).toBe("Top AS"); // current name used for root
    expect(byOrg.get("A")?.relationshipToParent).toBe("SUBSIDIARY");
    expect(byOrg.get("B")?.depth).toBe(2);
    expect(byOrg.get("B")?.parentOrgNumber).toBe("A");
    expect(byOrg.get("C")?.relationshipToParent).toBe("ASSOCIATED");
    expect(byOrg.get("TOP")?.childCount).toBe(2);
  });

  it("does not expand associated companies (they are not part of the konsern)", async () => {
    const edges = [
      e("TOP", "ASSOC", "ASSOCIATED", 30),
      e("ASSOC", "HIDDEN", "SUBSIDIARY", 100),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "TOP", year: 2025, currentName: "Top AS" },
      depsFrom(edges),
    );
    expect(result.nodes.map((node) => node.orgNumber)).toEqual(["TOP", "ASSOC"]);
  });

  it("dedupes companies reached through multiple branches (joint ownership)", async () => {
    const edges = [
      e("TOP", "A", "SUBSIDIARY", 100),
      e("TOP", "B", "SUBSIDIARY", 100),
      e("A", "SHARED", "SUBSIDIARY", 60),
      e("B", "SHARED", "SUBSIDIARY", 60),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "TOP", year: 2025, currentName: "Top AS" },
      depsFrom(edges),
    );
    const shared = result.nodes.filter((node) => node.orgNumber === "SHARED");
    expect(shared).toHaveLength(1);
  });
});

describe("buildGroupStructure — upward to konsernspiss", () => {
  it("climbs the controlling chain and roots the tree at the ultimate parent", async () => {
    const edges = [
      e("TOP", "MID", "SUBSIDIARY", 80),
      e("MID", "LEAF", "SUBSIDIARY", 70),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "LEAF", year: 2025, currentName: "Leaf AS" },
      depsFrom(edges),
    );

    expect(result.rootOrgNumber).toBe("TOP");
    expect(result.ultimateParent).toEqual({ orgNumber: "TOP", name: "TOP AS" });
    expect(result.currentOrgNumber).toBe("LEAF");
    expect(result.nodes.find((node) => node.orgNumber === "LEAF")?.isCurrent).toBe(true);
    expect(result.nodes.find((node) => node.isCurrent && node.orgNumber !== "LEAF")).toBeUndefined();
  });

  it("does not climb through a non-controlling (associated) owner", async () => {
    const edges = [e("INVESTOR", "SELF", "ASSOCIATED", 40)];
    const result = await buildGroupStructure(
      { orgNumber: "SELF", year: 2025, currentName: "Self AS" },
      depsFrom(edges),
    );
    expect(result.rootOrgNumber).toBe("SELF");
    expect(result.ultimateParent).toBeNull();
  });

  it("guards against an upward ownership cycle", async () => {
    const edges = [
      e("A", "B", "SUBSIDIARY", 60),
      e("B", "A", "SUBSIDIARY", 60),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "A", year: 2025, currentName: "A AS" },
      depsFrom(edges),
    );
    // Climbs A -> B, then B's parent A is already visited; stop without looping.
    expect(result.rootOrgNumber).toBe("B");
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});

describe("buildGroupStructure — limits", () => {
  it("flags truncation when the depth limit is reached", async () => {
    const edges = [
      e("R", "L1", "SUBSIDIARY", 100),
      e("L1", "L2", "SUBSIDIARY", 100),
      e("L2", "L3", "SUBSIDIARY", 100),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "R", year: 2025, currentName: "R AS", maxDepth: 1 },
      depsFrom(edges),
    );
    expect(result.truncated).toBe(true);
    expect(result.nodes.map((node) => node.orgNumber)).toEqual(["R", "L1"]);
  });

  it("flags truncation when the node limit is reached", async () => {
    const edges = [
      e("R", "A", "SUBSIDIARY", 100),
      e("R", "B", "SUBSIDIARY", 100),
      e("R", "C", "SUBSIDIARY", 100),
    ];
    const result = await buildGroupStructure(
      { orgNumber: "R", year: 2025, currentName: "R AS", maxNodes: 2 },
      depsFrom(edges),
    );
    expect(result.truncated).toBe(true);
    expect(result.nodes.length).toBe(2); // root + 1 child
  });
});
