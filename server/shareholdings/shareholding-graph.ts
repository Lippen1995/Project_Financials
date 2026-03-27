import { ShareholdingGraphEdge, ShareholdingGraphNode } from "@/lib/types";

export function computeOwnershipPercentString(numberOfShares: bigint, totalShares: bigint) {
  if (totalShares <= BigInt(0)) {
    return null;
  }

  const precision = BigInt(8);
  const scale = BigInt(10) ** precision;
  const scaled =
    (numberOfShares * BigInt(100) * scale + totalShares / BigInt(2)) / totalShares;
  const intPart = scaled / scale;
  const fractional = (scaled % scale).toString().padStart(Number(precision), "0");
  return `${intPart}.${fractional}`;
}

export function formatPercentForDisplay(percent?: number | null) {
  if (percent === null || percent === undefined) {
    return "Ikke beregnet";
  }

  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: percent < 10 ? 2 : 1,
    maximumFractionDigits: 2,
  }).format(percent);
}

export function buildOwnershipGraph(params: {
  companyId: string;
  companyOrgNumber: string;
  companyName: string;
  ownerships: Array<{
    shareholderId: string;
    shareholderName: string;
    shareholderType: "PERSON" | "COMPANY" | "UNKNOWN";
    linkedCompanyOrgNumber?: string | null;
    linkedCompanyName?: string | null;
    linkedCompanyId?: string | null;
    matchConfidence?: number | null;
    numberOfShares: bigint;
    ownershipPercent?: string | null;
    shareClass?: string | null;
  }>;
}) {
  const nodes: ShareholdingGraphNode[] = [
    {
      id: `company:${params.companyOrgNumber}`,
      type: "COMPANY",
      label: params.companyName,
      metadata: {
        orgNumber: params.companyOrgNumber,
        companyId: params.companyId,
        typeLabel: "Selskap",
      },
    },
  ];

  const edges: ShareholdingGraphEdge[] = [];

  params.ownerships.forEach((ownership, index) => {
    const nodeType =
      ownership.shareholderType === "PERSON"
        ? "PERSON"
        : ownership.linkedCompanyOrgNumber
          ? "COMPANY_SHAREHOLDER"
          : "UNKNOWN_SHAREHOLDER";
    const nodeId =
      nodeType === "PERSON"
        ? `person:${ownership.shareholderId}`
        : ownership.linkedCompanyOrgNumber
          ? `company:${ownership.linkedCompanyOrgNumber}`
          : `shareholder:${ownership.shareholderId}`;

    nodes.push({
      id: nodeId,
      type: nodeType,
      label: ownership.linkedCompanyName ?? ownership.shareholderName,
      metadata: {
        orgNumber: ownership.linkedCompanyOrgNumber,
        companyId: ownership.linkedCompanyId,
        shareholderId: ownership.shareholderId,
        confidence: ownership.matchConfidence ?? null,
        typeLabel:
          nodeType === "PERSON"
            ? "Person"
            : nodeType === "COMPANY_SHAREHOLDER"
              ? "Selskapsaksjonær"
              : "Uavklart aksjonær",
      },
    });

    edges.push({
      id: `${nodeId}->company:${params.companyOrgNumber}`,
      sourceNodeId: nodeId,
      targetNodeId: `company:${params.companyOrgNumber}`,
      relationshipType: "OWNS",
      percent: ownership.ownershipPercent ? Number(ownership.ownershipPercent) : null,
      percentRaw: ownership.ownershipPercent ?? null,
      shares: ownership.numberOfShares.toString(),
      shareClass: ownership.shareClass,
    });
  });

  return {
    nodes,
    edges: edges.sort((left, right) => {
      const leftValue = left.percent ?? -1;
      const rightValue = right.percent ?? -1;
      return rightValue - leftValue;
    }),
  };
}
