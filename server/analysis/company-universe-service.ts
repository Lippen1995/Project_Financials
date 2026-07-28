import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  companyUniverseQuerySchema,
  rankScreenedCompanies,
  rankingCriterionSchema,
  screenCompanyUniverse,
  type CompanyUniverseCandidate,
  type CompanyUniverseQuery,
} from "./company-analysis-domain";

type UniverseRow = {
  orgNumber: string;
  name: string;
  legalForm: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  naceCode: string | null;
  municipalityNumber: string | null;
  employeeCount: number | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  fiscalYear: number | null;
  revenue: bigint | null;
  operatingProfit: bigint | null;
  financialSourceSystem: string | null;
  financialSourceEntityType: string | null;
  financialSourceId: string | null;
  financialFetchedAt: Date | null;
  financialNormalizedAt: Date | null;
};

function safeNumber(value: bigint | null) {
  if (value == null) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

function toCandidate(row: UniverseRow): CompanyUniverseCandidate {
  const revenue = safeNumber(row.revenue);
  const operatingProfit = safeNumber(row.operatingProfit);
  const hasFinancialSource = Boolean(
    row.fiscalYear != null &&
    row.financialSourceSystem &&
    row.financialSourceEntityType &&
    row.financialSourceId &&
    row.financialFetchedAt &&
    row.financialNormalizedAt,
  );
  return {
    orgNumber: row.orgNumber,
    name: row.name,
    legalForm: row.legalForm,
    status: row.status,
    naceCode: row.naceCode,
    municipalityNumber: row.municipalityNumber,
    employeeCount: row.employeeCount,
    companySource: {
      sourceSystem: row.sourceSystem,
      sourceEntityType: row.sourceEntityType,
      sourceId: row.sourceId,
      fetchedAt: row.fetchedAt.toISOString(),
      normalizedAt: row.normalizedAt.toISOString(),
    },
    financials: hasFinancialSource
      ? {
          fiscalYear: row.fiscalYear!,
          revenue,
          operatingProfit,
          operatingMarginBps:
            revenue != null && revenue !== 0 && operatingProfit != null
              ? Math.round((operatingProfit / revenue) * 10_000)
              : null,
          source: {
            sourceSystem: row.financialSourceSystem!,
            sourceEntityType: row.financialSourceEntityType!,
            sourceId: row.financialSourceId!,
            fetchedAt: row.financialFetchedAt!.toISOString(),
            normalizedAt: row.financialNormalizedAt!.toISOString(),
          },
        }
      : null,
  };
}

export type CompanyUniverseRepository = {
  loadCandidates(query: CompanyUniverseQuery): Promise<{
    candidates: CompanyUniverseCandidate[];
    truncated: boolean;
  }>;
};

const prismaRepository: CompanyUniverseRepository = {
  async loadCandidates(query) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`e."status"::text IN (${Prisma.join(query.statuses)})`,
    ];
    if (query.query) {
      conditions.push(Prisma.sql`(
        e."name" ILIKE ${`%${query.query}%`} OR e."orgNumber" = ${query.query}
      )`);
    }
    if (query.industryCodePrefixes.length > 0) {
      conditions.push(Prisma.sql`(${Prisma.join(
        query.industryCodePrefixes.map((prefix) => Prisma.sql`e."naceCode" LIKE ${`${prefix}%`}`),
        " OR ",
      )})`);
    }
    if (query.municipalityNumbers.length > 0) {
      conditions.push(
        Prisma.sql`e."municipalityNumber" IN (${Prisma.join(query.municipalityNumbers)})`,
      );
    }
    if (query.legalForms.length > 0) {
      conditions.push(Prisma.sql`e."organisationForm" IN (${Prisma.join(query.legalForms)})`);
    }
    const poolLimit = Math.min(5_000, Math.max(500, query.limit * 10));
    const fiscalYear = query.fiscalYear ?? null;
    const rows = await prisma.$queryRaw<UniverseRow[]>(Prisma.sql`
      SELECT
        e."orgNumber",
        e."name",
        e."organisationForm" AS "legalForm",
        e."status"::text AS "status",
        e."naceCode",
        e."municipalityNumber",
        e."employeeCount",
        e."sourceSystem",
        e."sourceEntityType",
        e."sourceId",
        e."fetchedAt",
        e."normalizedAt",
        financial."fiscalYear",
        financial."revenue",
        financial."operatingProfit",
        financial."sourceSystem" AS "financialSourceSystem",
        financial."sourceEntityType" AS "financialSourceEntityType",
        financial."sourceId" AS "financialSourceId",
        financial."fetchedAt" AS "financialFetchedAt",
        financial."normalizedAt" AS "financialNormalizedAt"
      FROM "RegistryEntity" e
      LEFT JOIN "Company" company ON company."orgNumber" = e."orgNumber"
      LEFT JOIN LATERAL (
        SELECT statement.*
        FROM "FinancialStatement" statement
        WHERE statement."companyId" = company."id"
          AND statement."sourceSystem" = 'BRREG'
          AND (${fiscalYear}::int IS NULL OR statement."fiscalYear" = ${fiscalYear})
        ORDER BY statement."fiscalYear" DESC, statement."statementScope" DESC
        LIMIT 1
      ) financial ON TRUE
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY e."orgNumber" ASC
      LIMIT ${poolLimit + 1}
    `);
    return {
      candidates: rows.slice(0, poolLimit).map(toCandidate),
      truncated: rows.length > poolLimit,
    };
  },
};

export const companyUniverseRunInputSchema = z.object({
  query: companyUniverseQuerySchema,
  ranking: z.array(rankingCriterionSchema).min(1).max(10).optional(),
}).strict();

export function createCompanyUniverseService(repository: CompanyUniverseRepository = prismaRepository) {
  return {
    async run(input: unknown) {
      const parsed = companyUniverseRunInputSchema.parse(input);
      const { candidates, truncated } = await repository.loadCandidates(parsed.query);
      if (truncated) {
        return {
          version: "company-universe-result-v1" as const,
          status: "REFINE_REQUIRED" as const,
          screeningVersion: "company-screening-v1" as const,
          rankingVersion: parsed.ranking ? "company-ranking-v1" as const : null,
          query: parsed.query,
          ranking: parsed.ranking ?? [],
          included: [],
          excluded: [],
          counts: {
            evaluated: candidates.length,
            included: 0,
            excluded: 0,
            truncated: 1,
          },
          message:
            "Universet er for bredt til en komplett og etterprøvbar beregning. Legg til næring, geografi, organisasjonsform eller tekstfilter.",
        };
      }
      const screening = screenCompanyUniverse(candidates, parsed.query);
      const included = parsed.ranking
        ? rankScreenedCompanies(screening.matched, parsed.ranking).slice(0, parsed.query.limit)
        : screening.included;
      return {
        version: "company-universe-result-v1" as const,
        status: "COMPLETE" as const,
        screeningVersion: screening.version,
        rankingVersion: parsed.ranking ? "company-ranking-v1" as const : null,
        query: parsed.query,
        ranking: parsed.ranking ?? [],
        included,
        excluded: screening.excluded,
        counts: screening.counts,
      };
    },
  };
}

export const companyUniverseService = createCompanyUniverseService();
