import { ShareholdingSourceSystem } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  NormalizedOwnership,
  NormalizedShareholder,
  ShareholdingGraphEdge,
  ShareholdingGraphNode,
  ShareholdingGraphSnapshot,
} from "@/lib/types";

export async function getShareholdingAvailableYears(orgNumber: string) {
  const snapshots = await prisma.shareholdingSnapshot.findMany({
    where: { company: { orgNumber } },
    select: { taxYear: true },
    orderBy: { taxYear: "desc" },
  });

  return snapshots.map((snapshot) => snapshot.taxYear);
}

export async function getShareholdingSnapshot(orgNumber: string, taxYear: number): Promise<ShareholdingGraphSnapshot | null> {
  const snapshot = await prisma.shareholdingSnapshot.findFirst({
    where: { company: { orgNumber }, taxYear },
    include: {
      company: true,
      ownerships: {
        include: {
          shareholder: {
            include: {
              linkedCompany: true,
            },
          },
        },
        orderBy: [{ ownershipPercent: "desc" }, { numberOfShares: "desc" }],
      },
      graphNodes: { orderBy: { sortOrder: "asc" } },
      graphEdges: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!snapshot) {
    return null;
  }

  const shareholders: NormalizedShareholder[] = snapshot.ownerships.map((ownership) => ({
    id: ownership.shareholder.id,
    type: ownership.shareholder.type,
    name: ownership.shareholder.name,
    normalizedName: ownership.shareholder.normalizedName,
    birthYear: ownership.shareholder.birthYear,
    postalCode: ownership.shareholder.postalCode,
    postalPlace: ownership.shareholder.postalPlace,
    externalIdentifier: ownership.shareholder.externalIdentifier,
    linkedCompanyId: ownership.shareholder.linkedCompanyId,
    linkedCompanyOrgNumber: ownership.shareholder.linkedCompany?.orgNumber ?? null,
    linkedCompanyName: ownership.shareholder.linkedCompany?.name ?? null,
    matchConfidence: ownership.shareholder.matchConfidence
      ? Number(ownership.shareholder.matchConfidence)
      : null,
  }));

  const ownerships: NormalizedOwnership[] = snapshot.ownerships.map((ownership) => ({
    id: ownership.id,
    snapshotId: ownership.snapshotId,
    companyId: ownership.companyId,
    shareholderId: ownership.shareholderId,
    shareClass: ownership.shareClass,
    numberOfShares: ownership.numberOfShares.toString(),
    ownershipPercent: ownership.ownershipPercent ? Number(ownership.ownershipPercent) : null,
    ownershipPercentRaw: ownership.ownershipPercent?.toString() ?? null,
    ownershipBasis: ownership.ownershipBasis,
    dataQualityNote: ownership.dataQualityNote,
    isDirect: ownership.isDirect,
  }));

  const nodes: ShareholdingGraphNode[] = snapshot.graphNodes.map((node) => ({
    id: node.nodeKey,
    type: node.type,
    label: node.label,
    metadata: node.metadata as ShareholdingGraphNode["metadata"],
  }));

  const edges: ShareholdingGraphEdge[] = snapshot.graphEdges.map((edge) => ({
    id: edge.edgeKey,
    sourceNodeId: edge.sourceNodeKey,
    targetNodeId: edge.targetNodeKey,
    relationshipType: "OWNS",
    percent: edge.percent ? Number(edge.percent) : null,
    percentRaw: edge.percent?.toString() ?? null,
    shares: edge.shares?.toString() ?? null,
    shareClass: edge.shareClass,
  }));

  return {
    snapshotId: snapshot.id,
    companyId: snapshot.companyId,
    companyOrgNumber: snapshot.company.orgNumber,
    companyName: snapshot.company.name,
    taxYear: snapshot.taxYear,
    totalShares: snapshot.totalShares?.toString() ?? null,
    shareholderCount: snapshot.shareholderCount,
    source: snapshot.sourceSystem as ShareholdingSourceSystem,
    sourceImportedAt: snapshot.sourceImportedAt,
    latestAvailableYear: snapshot.latestAvailableYear,
    dataQualityNote: snapshot.dataQualityNote,
    availabilityMessage: null,
    nodes,
    edges,
    ownerships,
    shareholders,
  };
}
