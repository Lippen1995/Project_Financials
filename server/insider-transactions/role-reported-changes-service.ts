import { prisma } from "@/lib/prisma";
import type { ReportedRoleChange } from "@/server/insider-transactions/reported-change-window";
import {
  getCompanyRoleAssignments,
  type CompanyRole,
} from "@/server/registry/role-search-service";

export type CompanyRoleWithReportedChanges = CompanyRole & {
  reportedChanges: ReportedRoleChange[];
};

export type CompanyRoleActivityOverview = {
  snapshot: { taxYear: number; asOfDate: string } | null;
  roles: CompanyRoleWithReportedChanges[];
};

export function snapshotDateForTaxYear(taxYear: number) {
  return new Date(Date.UTC(taxYear, 11, 31));
}

export async function getCompanyRoleActivityOverview(
  orgNumber: string,
): Promise<CompanyRoleActivityOverview> {
  const roles = await getCompanyRoleAssignments(orgNumber);
  const latest = await prisma.shareholderRegisterHolding.aggregate({
    where: { issuerOrgNumber: orgNumber },
    _max: { taxYear: true },
  });
  const taxYear = latest._max.taxYear;
  if (taxYear === null) {
    return { snapshot: null, roles: roles.map((role) => ({ ...role, reportedChanges: [] })) };
  }

  const asOfDate = snapshotDateForTaxYear(taxYear);
  const attributions = await prisma.roleInsiderTransactionAttribution.findMany({
    where: {
      snapshotTaxYear: taxYear,
      resolutionConfidence: { gte: 0.9 },
      transaction: {
        company: { orgNumber },
        status: "ACTIVE",
        instrumentType: "SHARE",
        transactionDate: { gt: asOfDate },
      },
    },
    include: { transaction: true },
    orderBy: { transaction: { transactionDate: "desc" } },
  });

  const changesByPerson = new Map<string, ReportedRoleChange[]>();
  for (const attribution of attributions) {
    const transaction = attribution.transaction;
    const change: ReportedRoleChange = {
      transactionId: transaction.id,
      transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
      action:
        transaction.action === "PURCHASE" ||
        transaction.action === "SALE" ||
        transaction.action === "SUBSCRIPTION"
          ? transaction.action
          : "OTHER",
      reportedShares: transaction.reportedShares.toString(),
      attributedShares: attribution.attributedShares.toFixed(0),
      ownershipFraction: attribution.ownershipFraction.toString(),
      direct: attribution.direct,
      legalPartyName: attribution.legalPartyName,
      sourceUrl: transaction.sourceUrl,
    };
    const existing = changesByPerson.get(attribution.personIdentityKey) ?? [];
    existing.push(change);
    changesByPerson.set(attribution.personIdentityKey, existing);
  }

  return {
    snapshot: { taxYear, asOfDate: asOfDate.toISOString().slice(0, 10) },
    roles: roles.map((role) => ({
      ...role,
      reportedChanges: role.personIdentityKey
        ? changesByPerson.get(role.personIdentityKey) ?? []
        : [],
    })),
  };
}
