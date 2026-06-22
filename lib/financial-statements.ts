import { NormalizedFinancialStatement } from "@/lib/types";

/**
 * Selects one headline statement per fiscal year. Consolidated accounts take
 * precedence when both consolidated and company accounts are available.
 */
export function getHeadlineFinancialStatements(
  statements: NormalizedFinancialStatement[],
): NormalizedFinancialStatement[] {
  const byYear = new Map<number, NormalizedFinancialStatement>();

  for (const statement of statements) {
    const existing = byYear.get(statement.fiscalYear);
    if (
      !existing ||
      (statement.statementScope === "CONSOLIDATED" &&
        existing.statementScope !== "CONSOLIDATED")
    ) {
      byYear.set(statement.fiscalYear, statement);
    }
  }

  return [...byYear.values()].sort((left, right) => right.fiscalYear - left.fiscalYear);
}
