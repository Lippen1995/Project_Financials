import type { CompanyMapAddressResolutionStatus } from "@/server/company-map/address-resolution";

export type CompanyMapCoverageRecord = {
  organisationForm: string | null;
  companyStatus: string;
  resolutionStatus: CompanyMapAddressResolutionStatus;
  hasMetric: boolean;
};

export type CompanyMapCoverageFilters = {
  organisationForms?: readonly string[];
  companyStatuses?: readonly string[];
};

export type CompanyMapCoverage = {
  eligible: number;
  plotted: number;
  omitted: number;
  coveragePercent: number;
  omissions: Partial<Record<Exclude<CompanyMapAddressResolutionStatus, "MATCHED">, number>>;
  financialCoverage: {
    plottedWithMetric: number;
    plottedWithoutMetric: number;
    metricCoveragePercent: number;
  };
};

const DEFAULT_ORGANISATION_FORMS = ["AS", "ASA"];
const DEFAULT_COMPANY_STATUSES = ["ACTIVE"];

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

export function calculateCompanyMapCoverage(
  records: readonly CompanyMapCoverageRecord[],
  filters: CompanyMapCoverageFilters = {},
): CompanyMapCoverage {
  const organisationForms = new Set(
    (filters.organisationForms ?? DEFAULT_ORGANISATION_FORMS).map((value) => value.toUpperCase()),
  );
  const companyStatuses = new Set(
    (filters.companyStatuses ?? DEFAULT_COMPANY_STATUSES).map((value) => value.toUpperCase()),
  );
  const eligibleRecords = records.filter(
    (record) =>
      organisationForms.has(record.organisationForm?.toUpperCase() ?? "") &&
      companyStatuses.has(record.companyStatus.toUpperCase()),
  );
  const plottedRecords = eligibleRecords.filter((record) => record.resolutionStatus === "MATCHED");
  const omissions: CompanyMapCoverage["omissions"] = {};

  for (const record of eligibleRecords) {
    if (record.resolutionStatus === "MATCHED") continue;
    omissions[record.resolutionStatus] = (omissions[record.resolutionStatus] ?? 0) + 1;
  }

  const plottedWithMetric = plottedRecords.filter((record) => record.hasMetric).length;
  const plottedWithoutMetric = plottedRecords.length - plottedWithMetric;

  return {
    eligible: eligibleRecords.length,
    plotted: plottedRecords.length,
    omitted: eligibleRecords.length - plottedRecords.length,
    coveragePercent: percentage(plottedRecords.length, eligibleRecords.length),
    omissions,
    financialCoverage: {
      plottedWithMetric,
      plottedWithoutMetric,
      metricCoveragePercent: percentage(plottedWithMetric, plottedRecords.length),
    },
  };
}
