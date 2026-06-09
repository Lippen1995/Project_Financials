import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { OwnershipRelationship } from "@/server/ownership/ownership-thresholds";
import type { GroupNode, GroupStructure } from "@/server/ownership/types";

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_NODES = 500;
const DEFAULT_MAX_UP_DEPTH = 20;

export type ControllingParent = {
  ownerOrgNumber: string;
  ownerName: string;
  ownershipPercent: number | null;
};

export type ChildEdge = {
  ownerOrgNumber: string;
  issuerOrgNumber: string;
  issuerName: string;
  relationship: OwnershipRelationship;
  ownershipPercent: number | null;
};

/**
 * Data access the traversal depends on. Injected so the BFS can be unit-tested
 * against in-memory edge sets without a database.
 */
export type GroupStructureDeps = {
  /** The single owner that controls (>50 %) the given company, if any. */
  getControllingParent: (orgNumber: string) => Promise<ControllingParent | null>;
  /** All subsidiary/associated edges owned by any of the given companies. */
  getChildren: (ownerOrgNumbers: string[]) => Promise<ChildEdge[]>;
};

export type BuildGroupStructureParams = {
  orgNumber: string;
  year: number;
  currentName: string;
  maxDepth?: number;
  maxNodes?: number;
  maxUpDepth?: number;
};

/**
 * Build a group (konsern) tree for a company.
 *
 * 1. Walk up the controlling-ownership chain (>50 %) to the konsernspiss. Each company
 *    has at most one >50 % owner, so the upward chain is a simple path; a visited-set
 *    guards against data cycles.
 * 2. Breadth-first down from that root. Recursion follows control edges only
 *    (SUBSIDIARY); associated companies (20–50 %) are attached as leaves and not
 *    expanded — they are shown but are not part of the konsern. A global visited-set
 *    dedupes companies reachable through several branches (joint ownership).
 *
 * Depth and node-count limits keep large groups bounded; `truncated` reports when a
 * limit cut the traversal short.
 */
export async function buildGroupStructure(
  params: BuildGroupStructureParams,
  deps: GroupStructureDeps,
): Promise<GroupStructure> {
  const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
  const maxUpDepth = params.maxUpDepth ?? DEFAULT_MAX_UP_DEPTH;
  const current = params.orgNumber;

  // 1. Walk up to the konsernspiss.
  const upNames = new Map<string, string>();
  const upVisited = new Set<string>([current]);
  let root = current;
  let ultimateParent: { orgNumber: string; name: string } | null = null;
  let cursor = current;
  for (let i = 0; i < maxUpDepth; i += 1) {
    const parent = await deps.getControllingParent(cursor);
    if (!parent || upVisited.has(parent.ownerOrgNumber)) {
      break;
    }
    upVisited.add(parent.ownerOrgNumber);
    upNames.set(parent.ownerOrgNumber, parent.ownerName);
    root = parent.ownerOrgNumber;
    ultimateParent = { orgNumber: parent.ownerOrgNumber, name: parent.ownerName };
    cursor = parent.ownerOrgNumber;
  }

  // 2. Breadth-first down from the root.
  const rootName = root === current ? params.currentName : (upNames.get(root) ?? root);
  const nodes: GroupNode[] = [
    {
      orgNumber: root,
      name: rootName,
      relationshipToParent: null,
      ownershipPercent: null,
      depth: 0,
      parentOrgNumber: null,
      isCurrent: root === current,
      childCount: 0,
    },
  ];
  const visited = new Set<string>([root]);
  let frontier = [root];
  let truncated = false;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    if (nodes.length >= maxNodes) {
      truncated = true;
      frontier = [];
      break;
    }

    const edges = await deps.getChildren(frontier);
    edges.sort((a, b) => (b.ownershipPercent ?? -1) - (a.ownershipPercent ?? -1));

    const nextFrontier: string[] = [];
    for (const edge of edges) {
      if (visited.has(edge.issuerOrgNumber)) {
        continue;
      }
      if (nodes.length >= maxNodes) {
        truncated = true;
        break;
      }
      visited.add(edge.issuerOrgNumber);
      nodes.push({
        orgNumber: edge.issuerOrgNumber,
        name: edge.issuerName,
        relationshipToParent: edge.relationship,
        ownershipPercent: edge.ownershipPercent,
        depth: depth + 1,
        parentOrgNumber: edge.ownerOrgNumber,
        isCurrent: edge.issuerOrgNumber === current,
        childCount: 0,
      });
      // Only control edges continue the konsern downward; associated are leaves.
      if (edge.relationship === "SUBSIDIARY") {
        nextFrontier.push(edge.issuerOrgNumber);
      }
    }
    frontier = nextFrontier;
  }

  // Depth limit reached with expandable nodes still pending.
  if (frontier.length > 0) {
    truncated = true;
  }

  // Direct-child counts for collapse/expand affordances.
  const childCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentOrgNumber) {
      childCounts.set(node.parentOrgNumber, (childCounts.get(node.parentOrgNumber) ?? 0) + 1);
    }
  }
  for (const node of nodes) {
    node.childCount = childCounts.get(node.orgNumber) ?? 0;
  }

  return {
    year: params.year,
    rootOrgNumber: root,
    currentOrgNumber: current,
    ultimateParent,
    nodes,
    truncated,
  };
}

function createPrismaDeps(year: number): GroupStructureDeps {
  return {
    async getControllingParent(orgNumber) {
      const rows = await prisma.$queryRaw<
        Array<{ ownerOrgNumber: string; ownerName: string; ownershipPercent: number | null }>
      >`
        SELECT "ownerOrgNumber", "ownerName", "ownershipPercent"::float8 AS "ownershipPercent"
        FROM "OwnershipEdge"
        WHERE "taxYear" = ${year}
          AND "issuerOrgNumber" = ${orgNumber}
          AND "relationship" = 'SUBSIDIARY'
        ORDER BY "ownershipPercent" DESC NULLS LAST
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    async getChildren(ownerOrgNumbers) {
      if (ownerOrgNumbers.length === 0) {
        return [];
      }
      return prisma.$queryRaw<ChildEdge[]>(Prisma.sql`
        SELECT
          "ownerOrgNumber",
          "issuerOrgNumber",
          "issuerName",
          "relationship"::text AS "relationship",
          "ownershipPercent"::float8 AS "ownershipPercent"
        FROM "OwnershipEdge"
        WHERE "taxYear" = ${year}
          AND "ownerOrgNumber" IN (${Prisma.join(ownerOrgNumbers)})
          AND "relationship" IN ('SUBSIDIARY', 'ASSOCIATED')
      `);
    },
  };
}

/** Build the group structure for a company in a given tax year (Prisma-backed). */
export async function getGroupStructure(params: {
  orgNumber: string;
  year: number;
  currentName: string;
  maxDepth?: number;
  maxNodes?: number;
}): Promise<GroupStructure> {
  return buildGroupStructure(params, createPrismaDeps(params.year));
}

/** Tax years for which a materialised ownership graph exists. */
export async function getOwnershipAvailableYears(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ taxYear: number }>>`
    SELECT DISTINCT "taxYear" FROM "OwnershipEdge" ORDER BY "taxYear" DESC
  `;
  return rows.map((row) => row.taxYear);
}
