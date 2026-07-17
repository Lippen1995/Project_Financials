import { prisma } from "@/lib/prisma";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import {
  getOwnershipAvailableYears,
  getSubsidiaryTraversal,
} from "@/server/ownership/group-structure-service";

export type GroupEmployeeSummary = {
  employeeCount: number | null;
  companyCount: number;
  coveredCompanyCount: number;
  complete: boolean;
  traversalTruncated: boolean;
  ownershipYear: number;
};

type CompanyEmployeeInput = {
  orgNumber: string;
  employeeCount: number | null;
};

type GroupEmployeeDependencies = {
  getLatestOwnershipYear: () => Promise<number | null>;
  getSubsidiaryTraversal: (params: {
    orgNumber: string;
    year: number;
  }) => Promise<{ orgNumbers: string[]; truncated: boolean }>;
  getEmployeeCounts: (orgNumbers: string[]) => Promise<Map<string, number | null>>;
};

const defaultDependencies: GroupEmployeeDependencies = {
  async getLatestOwnershipYear() {
    return (await getOwnershipAvailableYears())[0] ?? null;
  },
  getSubsidiaryTraversal,
  async getEmployeeCounts(orgNumbers) {
    if (orgNumbers.length === 0) return new Map();
    const companies = await prisma.company.findMany({
      where: { orgNumber: { in: orgNumbers } },
      select: { orgNumber: true, employeeCount: true },
    });
    const counts = new Map(companies.map((company) => [company.orgNumber, company.employeeCount]));
    const missingOrgNumbers = orgNumbers.filter((orgNumber) => counts.get(orgNumber) == null);
    const provider = new BrregCompanyProvider();
    let nextIndex = 0;
    async function fetchWorker() {
      while (nextIndex < missingOrgNumbers.length) {
        const orgNumber = missingOrgNumbers[nextIndex++]!;
        try {
          const company = await provider.getCompany(orgNumber);
          if (company) counts.set(orgNumber, company.employeeCount ?? null);
        } catch {
          // A failed Brreg fallback leaves this member uncovered; the caller labels the sum "minst".
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(6, missingOrgNumbers.length) }, () => fetchWorker()),
    );
    return counts;
  },
};

/**
 * Aggregate the latest Brreg employee count for a parent and every company it controls.
 * A summary is returned only for companies that actually have controlled subsidiaries.
 */
export async function getGroupEmployeeSummaries(
  companies: CompanyEmployeeInput[],
  dependencies: GroupEmployeeDependencies = defaultDependencies,
): Promise<Map<string, GroupEmployeeSummary>> {
  const ownershipYear = await dependencies.getLatestOwnershipYear();
  if (ownershipYear === null || companies.length === 0) return new Map();

  const subsidiaryEntries = await Promise.all(
    companies.map(async (company) => [
      company.orgNumber,
      await dependencies.getSubsidiaryTraversal({
        orgNumber: company.orgNumber,
        year: ownershipYear,
      }),
    ] as const),
  );
  const subsidiaryOrgNumbers = [
    ...new Set(subsidiaryEntries.flatMap(([, traversal]) => traversal.orgNumbers)),
  ];
  const subsidiaryCounts = await dependencies.getEmployeeCounts(subsidiaryOrgNumbers);
  const companyByOrgNumber = new Map(companies.map((company) => [company.orgNumber, company]));
  const summaries = new Map<string, GroupEmployeeSummary>();

  for (const [orgNumber, traversal] of subsidiaryEntries) {
    const subsidiaries = traversal.orgNumbers;
    if (subsidiaries.length === 0) continue;
    const values = [
      companyByOrgNumber.get(orgNumber)?.employeeCount ?? null,
      ...subsidiaries.map((subsidiary) => subsidiaryCounts.get(subsidiary) ?? null),
    ];
    const availableValues = values.filter((value): value is number => value !== null);

    summaries.set(orgNumber, {
      employeeCount: availableValues.length > 0
        ? availableValues.reduce((total, value) => total + value, 0)
        : null,
      companyCount: values.length,
      coveredCompanyCount: availableValues.length,
      complete: availableValues.length === values.length && !traversal.truncated,
      traversalTruncated: traversal.truncated,
      ownershipYear,
    });
  }

  return summaries;
}
