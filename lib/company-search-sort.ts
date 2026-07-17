export type CompanySearchRow = {
  orgNumber: string;
  name: string;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  industry: string | null;
  city: string | null;
  revenue: number | null;
  revenueFiscalYear: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  employeeCount: number | null;
  groupEmployeeCount?: number | null;
  groupEmployeeCountComplete?: boolean;
  groupEmployeeTraversalTruncated?: boolean;
  groupEmployeeCompanyCount?: number;
  groupEmployeeOwnershipYear?: number;
};

export type CompanySearchSortKey =
  | "company"
  | "orgNumber"
  | "industry"
  | "status"
  | "revenue"
  | "employees";

export type CompanySearchSortDirection = "asc" | "desc";

function compareNullable<T>(
  left: T | null,
  right: T | null,
  compare: (leftValue: T, rightValue: T) => number,
  direction: CompanySearchSortDirection,
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const value = compare(left, right);
  return direction === "asc" ? value : -value;
}

const norwegianCollator = new Intl.Collator("nb-NO", {
  numeric: true,
  sensitivity: "base",
});

const statusLabels: Record<CompanySearchRow["status"], string> = {
  ACTIVE: "Aktiv",
  DISSOLVED: "Avviklet",
  BANKRUPT: "Konkurs",
};

export function sortCompanySearchRows(
  rows: CompanySearchRow[],
  key: CompanySearchSortKey,
  direction: CompanySearchSortDirection,
) {
  return rows.slice().sort((left, right) => {
    switch (key) {
      case "company":
        return norwegianCollator.compare(left.name, right.name) * (direction === "asc" ? 1 : -1);
      case "orgNumber":
        return norwegianCollator.compare(left.orgNumber, right.orgNumber) *
          (direction === "asc" ? 1 : -1);
      case "industry":
        return compareNullable(left.industry, right.industry, norwegianCollator.compare, direction);
      case "status":
        return norwegianCollator.compare(statusLabels[left.status], statusLabels[right.status]) *
          (direction === "asc" ? 1 : -1);
      case "revenue":
        return compareNullable(left.revenue, right.revenue, (a, b) => a - b, direction);
      case "employees":
        return compareNullable(
          left.employeeCount,
          right.employeeCount,
          (a, b) => a - b,
          direction,
        );
    }
  });
}
