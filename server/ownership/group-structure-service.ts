import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { GroupRelationshipKind } from "@/server/ownership/group-relationship-classifier";
import {
  PUBLISHABLE_SOURCE_IMPORT_STATUS_SQL,
  PUBLISHABLE_SOURCE_IMPORT_STATUSES,
  toPublishableSourceImportStatus,
} from "@/server/ownership/group-relationship-snapshot-builder";
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
  relationship: GroupRelationshipKind;
  ownershipPercent: number | null;
};

/**
 * Data access the traversal depends on. Injected so the BFS can be unit-tested
 * against in-memory edge sets without a database.
 */
export type GroupStructureDeps = {
  /** The single owner that controls (>50 %) the given company, if any. */
  getControllingParent: (orgNumber: string) => Promise<ControllingParent | null>;
  /** Published semantic relationships owned by any of the given companies. */
  getChildren: (ownerOrgNumbers: string[]) => Promise<ChildEdge[]>;
};

export type BuildGroupStructureParams = {
  orgNumber: string;
  year: number;
  currentName: string;
  maxDepth?: number;
  maxNodes?: number;
  maxUpDepth?: number;
  rootOverride?: { orgNumber: string; name: string };
  suppressTraversal?: boolean;
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
  if (params.rootOverride) {
    root = params.rootOverride.orgNumber;
    upNames.set(root, params.rootOverride.name);
    if (root !== current) {
      ultimateParent = params.rootOverride;
    }
  } else {
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
  let frontier = params.suppressTraversal ? [] : [root];
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
      const displayRelationship = groupRelationshipToDisplayRelationship(edge.relationship);
      if (!displayRelationship) {
        continue;
      }
      visited.add(edge.issuerOrgNumber);
      nodes.push({
        orgNumber: edge.issuerOrgNumber,
        name: edge.issuerName,
        relationshipToParent: displayRelationship,
        ownershipPercent: edge.ownershipPercent,
        depth: depth + 1,
        parentOrgNumber: edge.ownerOrgNumber,
        isCurrent: edge.issuerOrgNumber === current,
        childCount: 0,
      });
      // Only control edges continue the konsern downward; associated are leaves.
      if (edge.relationship === "GROUP_SUBSIDIARY") {
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

function groupRelationshipToDisplayRelationship(
  relationship: GroupRelationshipKind,
): OwnershipRelationship | null {
  if (relationship === "GROUP_SUBSIDIARY") return "SUBSIDIARY";
  if (relationship === "GROUP_ASSOCIATE") return "ASSOCIATED";
  return null;
}

function createPrismaDeps(year: number): GroupStructureDeps {
  return {
    async getControllingParent(orgNumber) {
      const rows = await prisma.$queryRaw<
        Array<{ ownerOrgNumber: string; ownerName: string; ownershipPercent: number | null }>
      >`
        SELECT "ownerOrgNumber", "ownerName", "ownershipPercent"::float8 AS "ownershipPercent"
        FROM "GroupRelationshipPublication" publication
        JOIN "GroupRelationshipSnapshot" relationship
          ON relationship."buildId" = publication."buildId"
         AND relationship."taxYear" = publication."taxYear"
        WHERE publication."taxYear" = ${year}
          AND publication."sourceImportStatus" IN ${PUBLISHABLE_SOURCE_IMPORT_STATUS_SQL}
          AND relationship."issuerOrgNumber" = ${orgNumber}
          AND relationship."relationship" = 'GROUP_SUBSIDIARY'
        ORDER BY relationship."ownershipPercent" DESC NULLS LAST
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
        FROM "GroupRelationshipPublication" publication
        JOIN "GroupRelationshipSnapshot" relationship
          ON relationship."buildId" = publication."buildId"
         AND relationship."taxYear" = publication."taxYear"
        WHERE publication."taxYear" = ${year}
          AND publication."sourceImportStatus" IN ${PUBLISHABLE_SOURCE_IMPORT_STATUS_SQL}
          AND relationship."ownerOrgNumber" IN (${Prisma.join(ownerOrgNumbers)})
          AND relationship."relationship" IN ('GROUP_SUBSIDIARY', 'GROUP_ASSOCIATE')
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
  const memberships = await prisma.$queryRaw<
    Array<{
      groupRootOrgNumber: string;
      groupRootName: string | null;
      status: "RESOLVED" | "UNKNOWN" | "CONFLICT";
    }>
  >`
    SELECT
      membership."groupRootOrgNumber",
      root."name" AS "groupRootName",
      membership."status"::text AS status
    FROM "GroupRelationshipPublication" publication
    JOIN "GroupMembershipSnapshot" membership
      ON membership."buildId" = publication."buildId"
     AND membership."taxYear" = publication."taxYear"
    LEFT JOIN "RegistryEntity" root
      ON root."orgNumber" = membership."groupRootOrgNumber"
    WHERE publication."taxYear" = ${params.year}
      AND publication."sourceImportStatus" IN ${PUBLISHABLE_SOURCE_IMPORT_STATUS_SQL}
      AND membership."memberOrgNumber" = ${params.orgNumber}
    LIMIT 1
  `;
  const membership = memberships[0] ?? null;
  const membershipResolved = membership?.status === "RESOLVED";
  const structure = await buildGroupStructure(
    {
      ...params,
      rootOverride: membershipResolved
        ? {
            orgNumber: membership.groupRootOrgNumber,
            name: membership.groupRootName ?? membership.groupRootOrgNumber,
          }
        : { orgNumber: params.orgNumber, name: params.currentName },
      suppressTraversal: membership !== null && !membershipResolved,
    },
    createPrismaDeps(params.year),
  );
  const [publication] = await Promise.all([
    prisma.groupRelationshipPublication.findFirst({
      where: {
        taxYear: params.year,
        sourceImportStatus: { in: [...PUBLISHABLE_SOURCE_IMPORT_STATUSES] },
      },
      select: { sourceImportStatus: true, ruleVersion: true },
    }),
    enrichWithCompanyStatus(structure.nodes),
  ]);
  const publishedStatus = toPublishableSourceImportStatus(publication?.sourceImportStatus);
  if (publishedStatus) {
    structure.sourceImportStatus = publishedStatus;
  }
  if (membership) structure.membershipStatus = membership.status;
  if (publication) structure.ruleVersion = publication.ruleVersion;
  return structure;
}

/**
 * Attach registry status (active/dissolved/bankrupt) from the local Company table to the
 * group nodes, where it exists. DB-only — companies not yet loaded simply have no status
 * and are shown without an inactive marker.
 */
async function enrichWithCompanyStatus(nodes: GroupStructure["nodes"]): Promise<void> {
  const orgNumbers = nodes.map((node) => node.orgNumber);
  if (orgNumbers.length === 0) {
    return;
  }
  const companies = await prisma.company.findMany({
    where: { orgNumber: { in: orgNumbers } },
    select: { orgNumber: true, status: true },
  });
  const statusByOrg = new Map(companies.map((company) => [company.orgNumber, company.status]));
  for (const node of nodes) {
    node.status = statusByOrg.get(node.orgNumber) ?? null;
  }
}

/**
 * All downstream subsidiary org numbers of a company (the companies it controls,
 * directly or indirectly), resolved by BFS over SUBSIDIARY control edges. Excludes
 * the company itself and merely associated (20–50 %) holdings. Bounded by depth and
 * node count to keep very large groups tractable.
 */
export async function getSubsidiaryOrgNumbers(params: {
  orgNumber: string;
  year?: number;
  maxDepth?: number;
  maxNodes?: number;
}): Promise<string[]> {
  return (await getSubsidiaryTraversal(params)).orgNumbers;
}

export type SubsidiaryTraversal = {
  orgNumbers: string[];
  truncated: boolean;
};

/** Resolve controlled subsidiaries and report whether a safety limit may have cut traversal short. */
export async function getSubsidiaryTraversal(params: {
  orgNumber: string;
  year?: number;
  maxDepth?: number;
  maxNodes?: number;
}): Promise<SubsidiaryTraversal> {
  const year = params.year ?? (await getOwnershipAvailableYears())[0];
  if (!year) {
    return { orgNumbers: [], truncated: false };
  }

  const membershipRows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT membership."status"::text AS status
    FROM "GroupRelationshipPublication" publication
    JOIN "GroupMembershipSnapshot" membership
      ON membership."buildId" = publication."buildId"
     AND membership."taxYear" = publication."taxYear"
    WHERE publication."taxYear" = ${year}
      AND publication."sourceImportStatus" IN ${PUBLISHABLE_SOURCE_IMPORT_STATUS_SQL}
      AND membership."memberOrgNumber" = ${params.orgNumber}
    LIMIT 1
  `;
  if (membershipRows[0] && membershipRows[0].status !== "RESOLVED") {
    return { orgNumbers: [], truncated: false };
  }

  const deps = createPrismaDeps(year);
  const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;

  const collected = new Set<string>();
  const visited = new Set<string>([params.orgNumber]);
  let frontier = [params.orgNumber];
  let truncated = false;

  for (let depth = 0; depth < maxDepth && frontier.length > 0 && collected.size < maxNodes; depth += 1) {
    const edges = await deps.getChildren(frontier);
    const next: string[] = [];
    for (const edge of edges) {
      if (edge.relationship !== "GROUP_SUBSIDIARY" || visited.has(edge.issuerOrgNumber)) {
        continue;
      }
      visited.add(edge.issuerOrgNumber);
      collected.add(edge.issuerOrgNumber);
      next.push(edge.issuerOrgNumber);
      if (collected.size >= maxNodes) {
        truncated = true;
        break;
      }
    }
    frontier = next;
  }

  if (frontier.length > 0) truncated = true;

  return { orgNumbers: [...collected], truncated };
}

/** Tax years for which a materialised ownership graph exists. */
export async function getOwnershipAvailableYears(): Promise<number[]> {
  const rows = await prisma.$queryRaw<Array<{ taxYear: number }>>`
    SELECT "taxYear"
    FROM "GroupRelationshipPublication"
    WHERE "sourceImportStatus" IN ${PUBLISHABLE_SOURCE_IMPORT_STATUS_SQL}
    ORDER BY "taxYear" DESC
  `;
  return rows.map((row) => row.taxYear);
}
