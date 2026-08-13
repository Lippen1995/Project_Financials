import { Prisma } from "@prisma/client";

import type { CompanyMapRangeKey, CompanyMapRangeSelection } from "@/lib/company-map";

/**
 * The filter set the public map applies identically to the viewport, the coverage counters and the
 * ranked list. Keeping one builder for all three is what stops the map and the list below it from
 * disagreeing about which companies are in scope.
 */
export type CompanyMapFilterSelection = {
  organisationForms: string[] | null;
  companyStatuses: Array<"ACTIVE" | "DISSOLVED" | "BANKRUPT">;
  search: string | null;
  counties: string[] | null;
  onlyGroupMembers: boolean;
  requirePublishedFinancials: boolean;
  ranges: CompanyMapRangeSelection[];
};

/** Ranges answered by a column that exists on the entity snapshot itself. */
const ENTITY_RANGE_KEYS = new Set<CompanyMapRangeKey>(["employees"]);

export function companyMapRangesNeedingFinancials(
  ranges: CompanyMapRangeSelection[],
) {
  return ranges.filter((range) => !ENTITY_RANGE_KEYS.has(range.key));
}

/**
 * True when the filter set can only be settled by looking at a published statement, and the
 * entity-side queries therefore have to reach for the financial snapshot.
 */
export function companyMapNeedsFinancialRows(filters: CompanyMapFilterSelection) {
  return (
    filters.requirePublishedFinancials ||
    companyMapRangesNeedingFinancials(filters.ranges).length > 0
  );
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function conjunction(predicates: Array<Prisma.Sql | null>): Prisma.Sql {
  const present = predicates.filter((predicate): predicate is Prisma.Sql =>
    predicate !== null,
  );
  if (present.length === 0) return Prisma.sql`TRUE`;
  return present.reduce((left, right) => Prisma.sql`${left} AND ${right}`);
}

/**
 * A ratio is only defined against a positive denominator. Anything else evaluates to NULL, which
 * drops the row from a bounded comparison rather than reporting a fabricated percentage.
 */
function ratioExpression(
  alias: Prisma.Sql,
  numerator: string,
  denominator: string,
) {
  return Prisma.sql`CASE WHEN ${alias}.${Prisma.raw(`"${denominator}"`)} > 0 THEN ${alias}.${Prisma.raw(`"${numerator}"`)}::double precision * 100 / ${alias}.${Prisma.raw(`"${denominator}"`)}::double precision END`;
}

function rangeExpression(alias: Prisma.Sql, key: CompanyMapRangeKey): Prisma.Sql {
  switch (key) {
    case "revenue":
      return Prisma.sql`${alias}."revenue"`;
    case "ebit":
      return Prisma.sql`${alias}."ebit"`;
    case "equity":
      return Prisma.sql`${alias}."equity"`;
    case "totalAssets":
      return Prisma.sql`${alias}."totalAssets"`;
    case "employees":
      return Prisma.sql`${alias}."employeeCount"`;
    case "ebitMargin":
      return ratioExpression(alias, "ebit", "revenue");
    case "returnOnEquity":
      return ratioExpression(alias, "netIncome", "equity");
    case "equityRatio":
      return ratioExpression(alias, "equity", "totalAssets");
  }
}

function rangePredicates(
  alias: Prisma.Sql,
  ranges: CompanyMapRangeSelection[],
): Array<Prisma.Sql | null> {
  return ranges.flatMap((range) => {
    const expression = rangeExpression(alias, range.key);
    return [
      range.min === null ? null : Prisma.sql`${expression} >= ${range.min}`,
      range.max === null ? null : Prisma.sql`${expression} <= ${range.max}`,
    ];
  });
}

function searchPredicate(alias: Prisma.Sql, search: string | null) {
  if (!search) return null;
  const namePredicate = Prisma.sql`${alias}."name" ILIKE ${`%${escapeLike(search)}%`} ESCAPE '\\'`;
  const digits = search.replace(/\D/g, "");
  if (digits.length < 3 || !/^[\d\s]+$/.test(search)) return namePredicate;
  return Prisma.sql`(${namePredicate} OR ${alias}."orgNumber" LIKE ${`${digits}%`})`;
}

function countyPredicate(alias: Prisma.Sql, counties: string[] | null) {
  if (!counties || counties.length === 0) return null;
  return Prisma.sql`left(${alias}."municipalityNumber", 2) IN (${Prisma.join(counties)})`;
}

/**
 * Every filter that a single snapshot row can answer on its own. Financial ranges are deliberately
 * excluded: they depend on the statement scope and currency the caller selected, so the callers
 * pair this with {@link companyMapFinancialRangePredicate} against the matching financial rows.
 */
export function companyMapEntityPredicate({
  alias,
  filters,
}: {
  alias: Prisma.Sql;
  filters: CompanyMapFilterSelection;
}): Prisma.Sql {
  const organisationForms = filters.organisationForms
    ? Prisma.sql`${alias}."organisationForm" IN (${Prisma.join(filters.organisationForms)})`
    : null;
  return conjunction([
    organisationForms,
    Prisma.sql`${alias}."companyStatus"::text IN (${Prisma.join(filters.companyStatuses)})`,
    searchPredicate(alias, filters.search),
    countyPredicate(alias, filters.counties),
    filters.onlyGroupMembers
      ? Prisma.sql`${alias}."groupRootOrgNumber" IS NOT NULL`
      : null,
    ...rangePredicates(
      alias,
      filters.ranges.filter((range) => ENTITY_RANGE_KEYS.has(range.key)),
    ),
  ]);
}

/**
 * The financial half of the filter set, evaluated against one already scope- and currency-narrowed
 * financial row. Returns null when the caller selected no financial range at all.
 */
export function companyMapFinancialRangePredicate({
  alias,
  filters,
}: {
  alias: Prisma.Sql;
  filters: Pick<
    CompanyMapFilterSelection,
    "ranges" | "requirePublishedFinancials"
  >;
}): Prisma.Sql | null {
  const financialRanges = companyMapRangesNeedingFinancials(filters.ranges);
  if (financialRanges.length === 0 && !filters.requirePublishedFinancials) {
    return null;
  }
  return conjunction([
    filters.requirePublishedFinancials
      ? Prisma.sql`${alias}."revenue" IS NOT NULL`
      : null,
    ...rangePredicates(alias, financialRanges),
  ]);
}
