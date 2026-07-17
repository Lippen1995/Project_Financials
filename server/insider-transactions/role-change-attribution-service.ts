import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { weightShares } from "@/server/insider-transactions/reported-change-window";
import { getCompanyRoleAssignments } from "@/server/registry/role-search-service";

function normalizedTokens(value: string) {
  return value
    .toLocaleUpperCase("nb-NO")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-ZÆØÅ0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

export function namesReferToSamePerson(left: string, right: string) {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  return leftTokens.length >= 2 && leftTokens.join("|") === rightTokens.join("|");
}

export function selectUniqueRolePerson<
  T extends { holderType: string; personIdentityKey: string | null; holderName: string },
>(roles: T[], primaryInsiderName: string): T | null {
  const candidatesByIdentity = new Map<string, T>();
  for (const role of roles) {
    if (
      role.holderType === "PERSON" &&
      role.personIdentityKey &&
      namesReferToSamePerson(role.holderName, primaryInsiderName)
    ) {
      candidatesByIdentity.set(role.personIdentityKey, role);
    }
  }
  return candidatesByIdentity.size === 1
    ? [...candidatesByIdentity.values()][0]
    : null;
}

function normalizedCompanyName(value: string) {
  return value
    .toLocaleUpperCase("nb-NO")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(AS|ASA|AB|LTD|LIMITED|PLC)\b/g, " ")
    .replace(/[^A-ZÆØÅ0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function rebuildRoleChangeAttributions(input: {
  companyId: string;
  orgNumber: string;
  snapshotTaxYear: number;
}) {
  const roles = await getCompanyRoleAssignments(input.orgNumber);
  const transactions = await prisma.insiderTransaction.findMany({
    where: {
      companyId: input.companyId,
      status: "ACTIVE",
      instrumentType: "SHARE",
    },
    orderBy: { transactionDate: "desc" },
  });

  const replacements: Prisma.RoleInsiderTransactionAttributionCreateManyInput[] = [];
  for (const transaction of transactions) {
    const role = selectUniqueRolePerson(roles, transaction.primaryInsiderName);
    if (!role) continue;

    const isDirect = namesReferToSamePerson(
      transaction.reportingPartyName,
      transaction.primaryInsiderName,
    );
    const indirect = isDirect
      ? null
      : role.indirectHoldings.find(
          (holding) =>
            (transaction.reportingPartyOrgNumber &&
              holding.orgNumber === transaction.reportingPartyOrgNumber) ||
            normalizedCompanyName(holding.name) === normalizedCompanyName(transaction.reportingPartyName),
        );
    if (!isDirect && !indirect) continue;

    const ownershipFraction = isDirect ? 1 : indirect!.personOwnershipFraction;
    replacements.push({
        transactionId: transaction.id,
        personIdentityKey: role.personIdentityKey!,
        snapshotTaxYear: input.snapshotTaxYear,
        direct: isDirect,
        legalPartyName: transaction.reportingPartyName,
        legalPartyOrgNumber: transaction.reportingPartyOrgNumber,
        ownershipFraction: ownershipFraction.toString(),
        attributedShares: weightShares(
          transaction.reportedShares,
          ownershipFraction.toString(),
        ).toString(),
        ownershipPath: isDirect
          ? [{ type: "DIRECT", person: role.holderName }]
          : [
              { type: "PERSON", name: role.holderName },
              { type: "COMPANY", orgNumber: indirect!.orgNumber, name: indirect!.name },
              { type: "ISSUER", orgNumber: input.orgNumber },
            ],
        resolutionMethod: isDirect ? "PDMR_EXACT_NAME" : "PDMR_AND_REGISTERED_OWNERSHIP_PATH",
        resolutionConfidence: isDirect ? 1 : 0.95,
        normalizedAt: new Date(),
    });
  }

  await prisma.$transaction(async (transactionClient) => {
    await transactionClient.roleInsiderTransactionAttribution.deleteMany({
      where: {
        snapshotTaxYear: input.snapshotTaxYear,
        transaction: { companyId: input.companyId },
      },
    });
    if (replacements.length > 0) {
      await transactionClient.roleInsiderTransactionAttribution.createMany({
        data: replacements,
      });
    }
  });

  return {
    created: replacements.length,
    unresolved: transactions.length - replacements.length,
  };
}
