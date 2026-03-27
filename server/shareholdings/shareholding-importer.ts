import { ShareholdingSourceSystem } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";
import { buildOwnershipGraph, computeOwnershipPercentString } from "@/server/shareholdings/shareholding-graph";
import { normalizeShareholdingRows } from "@/server/shareholdings/shareholding-normalizer";
import { resolveShareholderEntity } from "@/server/shareholdings/shareholding-resolution";
import { checksumRawText, parseShareholdingCsv } from "@/server/shareholdings/shareholding-csv";
import { ShareholdingImportInput, ShareholdingImportValidationError } from "@/server/shareholdings/types";

const companyProvider = new BrregCompanyProvider();

async function ensureCompany(orgNumber: string) {
  const providerCompany = await companyProvider.getCompany(orgNumber);
  if (!providerCompany) {
    throw new Error(`Fant ikke virksomhet ${orgNumber} i Brønnøysundregistrene.`);
  }

  await upsertCompanySnapshot(providerCompany);
  const dbCompany = await prisma.company.findUnique({ where: { orgNumber } });
  if (!dbCompany) {
    throw new Error(`Virksomhet ${orgNumber} ble ikke lagret i databasen.`);
  }

  return dbCompany;
}

function buildLatestAvailableYear(currentDate = new Date()) {
  const year = currentDate.getUTCFullYear();
  const releaseDate = new Date(Date.UTC(year, 4, 15));
  return currentDate < releaseDate ? year - 2 : year - 1;
}

async function persistImportErrors(rawSourceId: string, errors: ShareholdingImportValidationError[]) {
  await prisma.shareholdingImportError.deleteMany({
    where: { rawSourceId },
  });

  if (errors.length === 0) {
    return;
  }

  await prisma.shareholdingImportError.createMany({
    data: errors.map((error) => ({
      rawSourceId,
      stage: error.stage,
      rowNumber: error.rowNumber,
      message: error.message,
      payload: error.payload as never,
    })),
  });
}

export async function importShareholdingSnapshot(input: ShareholdingImportInput) {
  const sourceSystem = input.sourceSystem ?? "SKATTEETATEN_CSV";
  const company = await ensureCompany(input.orgNumber);
  const checksum = checksumRawText(input.rawText);

  const rawSource = await prisma.shareholdingRawSource.upsert({
    where: {
      companyOrgNumber_taxYear_sourceSystem_checksum: {
        companyOrgNumber: input.orgNumber,
        taxYear: input.taxYear,
        sourceSystem,
        checksum,
      },
    },
    update: {
      sourceKey: input.sourceKey,
      rawText: input.rawText,
      importedAt: new Date(),
      sourceMetadata: { columnMapping: input.columnMapping } as never,
    },
    create: {
      companyOrgNumber: input.orgNumber,
      taxYear: input.taxYear,
      sourceSystem,
      sourceKey: input.sourceKey,
      checksum,
      importedAt: new Date(),
      rawText: input.rawText,
      sourceMetadata: { columnMapping: input.columnMapping } as never,
    },
  });

  const parsed = parseShareholdingCsv(input.rawText, input.columnMapping);
  const filteredRows = parsed.rows.filter(
    (row) => !row.issuerOrgNumber || row.issuerOrgNumber === input.orgNumber,
  );
  const normalized = normalizeShareholdingRows(filteredRows);
  const allErrors = [...parsed.errors, ...normalized.errors];

  await prisma.shareholdingRawSource.update({
    where: { id: rawSource.id },
    data: {
      parsedRowCount: filteredRows.length,
      status:
        filteredRows.length === 0
          ? "FAILED"
          : allErrors.length > 0
            ? "PARTIAL"
            : "COMPLETED",
    },
  });

  await persistImportErrors(rawSource.id, allErrors);

  const snapshot = await prisma.shareholdingSnapshot.upsert({
    where: {
      companyId_taxYear_sourceSystem: {
        companyId: company.id,
        taxYear: input.taxYear,
        sourceSystem,
      },
    },
    update: {
      rawSourceId: rawSource.id,
      totalShares: normalized.totalShares,
      sourceImportedAt: rawSource.importedAt,
      latestAvailableYear: buildLatestAvailableYear(),
      dataQualityNote:
        filteredRows.length === 0
          ? "Aksjonærdata ikke tilgjengelig for valgt år."
          : normalized.totalShares === null
            ? "Totalt antall aksjer mangler eller er inkonsistent. Eierandel er derfor ufullstendig."
            : allErrors.length > 0
              ? "Importen inneholder valideringsavvik. Se importfeil for detaljer."
              : null,
      shareholderCount: 0,
      graphVersion: "v1",
      graphPayload: undefined,
    },
    create: {
      companyId: company.id,
      taxYear: input.taxYear,
      sourceSystem,
      rawSourceId: rawSource.id,
      totalShares: normalized.totalShares,
      sourceImportedAt: rawSource.importedAt,
      latestAvailableYear: buildLatestAvailableYear(),
      dataQualityNote:
        filteredRows.length === 0
          ? "Aksjonærdata ikke tilgjengelig for valgt år."
          : normalized.totalShares === null
            ? "Totalt antall aksjer mangler eller er inkonsistent. Eierandel er derfor ufullstendig."
            : allErrors.length > 0
              ? "Importen inneholder valideringsavvik. Se importfeil for detaljer."
              : null,
      graphVersion: "v1",
    },
  });

  await prisma.ownership.deleteMany({ where: { snapshotId: snapshot.id } });
  await prisma.shareholdingGraphNode.deleteMany({ where: { snapshotId: snapshot.id } });
  await prisma.shareholdingGraphEdge.deleteMany({ where: { snapshotId: snapshot.id } });

  const persistedOwnerships: Array<{
    shareholderId: string;
    shareholderName: string;
    shareholderType: "PERSON" | "COMPANY" | "UNKNOWN";
    linkedCompanyId?: string | null;
    linkedCompanyOrgNumber?: string | null;
    linkedCompanyName?: string | null;
    matchConfidence?: number | null;
    numberOfShares: bigint;
    ownershipPercent?: string | null;
    shareClass?: string | null;
  }> = [];

  for (const aggregate of normalized.ownerships) {
    const resolution = await resolveShareholderEntity(aggregate);
    const linkedCompany = resolution.linkedCompanyOrgNumber
      ? await prisma.company.findUnique({ where: { orgNumber: resolution.linkedCompanyOrgNumber } })
      : null;

    const shareholder = await prisma.shareholder.upsert({
      where: { fingerprint: aggregate.fingerprint },
      update: {
        type: resolution.type,
        name: aggregate.shareholderName,
        normalizedName: aggregate.normalizedName,
        birthYear: aggregate.birthYear,
        postalCode: aggregate.postalCode,
        postalPlace: aggregate.postalPlace,
        externalIdentifier: aggregate.shareholderIdentifier,
        linkedCompanyId: linkedCompany?.id ?? null,
        matchConfidence:
          resolution.confidence !== undefined && resolution.confidence !== null
            ? resolution.confidence.toString()
            : null,
        rawPayload: aggregate.rows.map((row) => row.raw) as never,
      },
      create: {
        fingerprint: aggregate.fingerprint,
        type: resolution.type,
        name: aggregate.shareholderName,
        normalizedName: aggregate.normalizedName,
        birthYear: aggregate.birthYear,
        postalCode: aggregate.postalCode,
        postalPlace: aggregate.postalPlace,
        externalIdentifier: aggregate.shareholderIdentifier,
        linkedCompanyId: linkedCompany?.id ?? null,
        matchConfidence:
          resolution.confidence !== undefined && resolution.confidence !== null
            ? resolution.confidence.toString()
            : null,
        rawPayload: aggregate.rows.map((row) => row.raw) as never,
      },
    });

    const ownershipPercent =
      normalized.totalShares && normalized.totalShares > BigInt(0)
        ? computeOwnershipPercentString(aggregate.numberOfShares, normalized.totalShares)
        : null;

    await prisma.ownership.create({
      data: {
        snapshotId: snapshot.id,
        companyId: company.id,
        shareholderId: shareholder.id,
        shareClass: aggregate.shareClass,
        numberOfShares: aggregate.numberOfShares,
        ownershipPercent: ownershipPercent,
        ownershipBasis:
          normalized.totalShares && normalized.totalShares > BigInt(0)
            ? "numberOfShares / totalShares"
            : null,
        dataQualityNote:
          normalized.totalShares && normalized.totalShares > BigInt(0)
            ? null
            : "Totalt antall aksjer mangler eller er inkonsistent i importen.",
        isDirect: true,
        sourceRowKey: aggregate.sourceRowKeys.join("|"),
      },
    });

    persistedOwnerships.push({
      shareholderId: shareholder.id,
      shareholderName: shareholder.name,
      shareholderType: shareholder.type,
      linkedCompanyId: linkedCompany?.id ?? null,
      linkedCompanyOrgNumber: linkedCompany?.orgNumber ?? resolution.linkedCompanyOrgNumber ?? null,
      linkedCompanyName: linkedCompany?.name ?? resolution.linkedCompanyName ?? null,
      matchConfidence:
        resolution.confidence !== undefined && resolution.confidence !== null
          ? resolution.confidence
          : null,
      numberOfShares: aggregate.numberOfShares,
      ownershipPercent,
      shareClass: aggregate.shareClass,
    });
  }

  const graph = buildOwnershipGraph({
    companyId: company.id,
    companyOrgNumber: company.orgNumber,
    companyName: company.name,
    ownerships: persistedOwnerships.sort((left, right) => {
      if (left.ownershipPercent && right.ownershipPercent) {
        return Number(right.ownershipPercent) - Number(left.ownershipPercent);
      }
      if (right.numberOfShares > left.numberOfShares) {
        return 1;
      }
      if (right.numberOfShares < left.numberOfShares) {
        return -1;
      }
      return 0;
    }),
  });

  await prisma.shareholdingGraphNode.createMany({
    data: graph.nodes.map((node, index) => ({
      snapshotId: snapshot.id,
      nodeKey: node.id,
      type: node.type,
      label: node.label,
      metadata: node.metadata as never,
      sortOrder: index,
    })),
  });

  await prisma.shareholdingGraphEdge.createMany({
    data: graph.edges.map((edge, index) => ({
      snapshotId: snapshot.id,
      edgeKey: edge.id,
      sourceNodeKey: edge.sourceNodeId,
      targetNodeKey: edge.targetNodeId,
      relationshipType: edge.relationshipType,
      percent: edge.percentRaw,
      shares: edge.shares ? BigInt(edge.shares) : null,
      shareClass: edge.shareClass,
      sortOrder: index,
    })),
  });

  await prisma.shareholdingSnapshot.update({
    where: { id: snapshot.id },
    data: {
      shareholderCount: persistedOwnerships.length,
      graphPayload: { nodes: graph.nodes, edges: graph.edges } as never,
    },
  });

  return {
    snapshotId: snapshot.id,
    importedRows: filteredRows.length,
    shareholders: persistedOwnerships.length,
    totalShares: normalized.totalShares?.toString() ?? null,
    validationErrors: allErrors.length,
  };
}
