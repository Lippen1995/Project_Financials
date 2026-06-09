import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildCompanyExposureGraphEdges,
  type CompanyExposureGraphCompanyInput,
} from "@/server/news/company-exposure-graph";

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function syncCompanyExposureGraph(options: {
  companyIds?: string[];
  limit?: number;
} = {}) {
  const companies = await prisma.company.findMany({
    where: options.companyIds?.length ? { id: { in: options.companyIds } } : undefined,
    take: Math.min(Math.max(options.limit ?? 1000, 1), 5000),
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      orgNumber: true,
      name: true,
      industryCode: {
        select: {
          code: true,
          title: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          fetchedAt: true,
        },
      },
      petroleumExposureSnapshot: {
        select: {
          npdCompanyId: true,
          operatorFieldCount: true,
          licenceCount: true,
          operatedProductionOe: true,
          attributableProductionOe: true,
          remainingReservesOe: true,
          mainAreas: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          fetchedAt: true,
        },
      },
    },
  });

  const latestOwnershipYear = await prisma.shareholderRegisterHolding.aggregate({
    _max: { taxYear: true },
  });
  const ownershipRows = latestOwnershipYear._max.taxYear
    ? await prisma.shareholderRegisterHolding.findMany({
        where: {
          taxYear: latestOwnershipYear._max.taxYear,
          shareholderOrgNumber: { in: companies.map((company) => company.orgNumber) },
          ownershipPercent: { gte: 50 },
        },
        select: {
          issuerOrgNumber: true,
          issuerName: true,
          shareholderOrgNumber: true,
          ownershipPercent: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          fetchedAt: true,
        },
      })
    : [];
  const subsidiaryCompanies = ownershipRows.length
    ? await prisma.company.findMany({
        where: {
          orgNumber: {
            in: ownershipRows.map((row) => row.issuerOrgNumber),
          },
        },
        select: {
          id: true,
          orgNumber: true,
          name: true,
          industryCode: {
            select: {
              code: true,
              title: true,
              sourceSystem: true,
              sourceEntityType: true,
              sourceId: true,
              fetchedAt: true,
            },
          },
          petroleumExposureSnapshot: {
            select: {
              npdCompanyId: true,
              operatorFieldCount: true,
              licenceCount: true,
              operatedProductionOe: true,
              attributableProductionOe: true,
              remainingReservesOe: true,
              mainAreas: true,
              sourceSystem: true,
              sourceEntityType: true,
              sourceId: true,
              fetchedAt: true,
            },
          },
        },
      })
    : [];
  const allExposureCompanies = [...companies, ...subsidiaryCompanies];
  const npdCompanyIds = allExposureCompanies
    .map((company) => company.petroleumExposureSnapshot?.npdCompanyId)
    .filter((value): value is number => typeof value === "number");
  const operators = npdCompanyIds.length
    ? await prisma.petroleumOperatorSnapshot.findMany({
        where: { npdCompanyId: { in: npdCompanyIds } },
        select: {
          npdCompanyId: true,
          mainAreas: true,
          mainHydrocarbonTypes: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          computedAt: true,
        },
      })
    : [];
  const operatorByNpdCompanyId = new Map(
    operators.map((operator) => [operator.npdCompanyId, operator]),
  );
  const subsidiaryByOrgNumber = new Map(
    subsidiaryCompanies.map((company) => [company.orgNumber, company]),
  );
  const ownershipByParentOrgNumber = new Map<string, typeof ownershipRows>();
  for (const row of ownershipRows) {
    if (!row.shareholderOrgNumber) continue;
    const existing = ownershipByParentOrgNumber.get(row.shareholderOrgNumber) ?? [];
    existing.push(row);
    ownershipByParentOrgNumber.set(row.shareholderOrgNumber, existing);
  }

  const exposureInput = (
    company: (typeof allExposureCompanies)[number],
  ): Omit<CompanyExposureGraphCompanyInput, "controlledSubsidiaries"> => {
    const petroleum = company.petroleumExposureSnapshot;
    const operator = petroleum?.npdCompanyId
      ? operatorByNpdCompanyId.get(petroleum.npdCompanyId)
      : null;
    return {
      industryCode: company.industryCode,
      petroleumExposure: petroleum
        ? {
            ...petroleum,
            mainAreas: asStringArray(petroleum.mainAreas),
          }
        : null,
      petroleumOperator: operator ?? null,
    };
  };

  let nodesUpserted = 0;
  let edgesUpserted = 0;

  for (const company of companies) {
    const graphInput: CompanyExposureGraphCompanyInput = {
      ...exposureInput(company),
      controlledSubsidiaries: (ownershipByParentOrgNumber.get(company.orgNumber) ?? [])
        .map((ownership) => {
          const subsidiary = subsidiaryByOrgNumber.get(ownership.issuerOrgNumber);
          if (!subsidiary) return null;
          return {
            orgNumber: subsidiary.orgNumber,
            name: subsidiary.name,
            ownershipPercent: Number(ownership.ownershipPercent ?? 0),
            sourceSystem: ownership.sourceSystem,
            sourceEntityType: ownership.sourceEntityType,
            sourceId: ownership.sourceId,
            fetchedAt: ownership.fetchedAt,
            exposure: exposureInput(subsidiary),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    };
    const edges = buildCompanyExposureGraphEdges(graphInput);

    await prisma.companyExposureGraphEdge.deleteMany({
      where: { companyId: company.id },
    });

    for (const edge of edges) {
      const node = await prisma.companyExposureGraphNode.upsert({
        where: {
          nodeType_key: {
            nodeType: edge.nodeType,
            key: edge.nodeKey,
          },
        },
        update: {
          label: edge.nodeLabel,
          normalizedAt: new Date(),
        },
        create: {
          nodeType: edge.nodeType,
          key: edge.nodeKey,
          label: edge.nodeLabel,
          metadata: edge.metadata ? json(edge.metadata) : Prisma.JsonNull,
          sourceSystem: edge.sourceSystem,
          sourceEntityType: edge.sourceEntityType,
          sourceId: edge.sourceId,
          fetchedAt: edge.fetchedAt,
          normalizedAt: new Date(),
        },
        select: { id: true },
      });
      nodesUpserted += 1;

      await prisma.companyExposureGraphEdge.create({
        data: {
          companyId: company.id,
          nodeId: node.id,
          relationType: edge.relationType,
          weight: edge.weight,
          confidenceScore: edge.confidenceScore,
          rationale: edge.rationale,
          metadata: edge.metadata ? json(edge.metadata) : Prisma.JsonNull,
          sourceSystem: edge.sourceSystem,
          sourceEntityType: edge.sourceEntityType,
          sourceId: edge.sourceId,
          fetchedAt: edge.fetchedAt,
          normalizedAt: new Date(),
        },
      });
      edgesUpserted += 1;
    }
  }

  return {
    companiesProcessed: companies.length,
    nodesUpserted,
    edgesUpserted,
  };
}

export async function getCompanyExposureGraph(companyId: string) {
  return prisma.companyExposureGraphEdge.findMany({
    where: {
      companyId,
      active: true,
    },
    orderBy: [{ weight: "desc" }, { confidenceScore: "desc" }],
    select: {
      relationType: true,
      weight: true,
      confidenceScore: true,
      rationale: true,
      node: {
        select: {
          nodeType: true,
          key: true,
          label: true,
        },
      },
    },
  });
}
