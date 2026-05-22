import { type FinancialStatementQualityStatus, type StatementScope } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type PublishedAnnualReportMode =
  | "AUTOMATIC"
  | "REVIEWED_WITHOUT_CHANGES"
  | "MANUALLY_CORRECTED";

export type PublishedAnnualReportRow = {
  filingId: string;
  companyName: string;
  orgNumber: string;
  fiscalYear: number;
  publishedAt: string;
  publishMode: PublishedAnnualReportMode;
  publishModeLabel: string;
  scopeLabel: string;
  sourceUrl: string;
  reviewHref: string | null;
};

export type PublishedAnnualReportsResult = {
  rows: PublishedAnnualReportRow[];
  summary: Array<{
    key: PublishedAnnualReportMode;
    label: string;
    count: number;
  }>;
};

const MODE_LABELS: Record<PublishedAnnualReportMode, string> = {
  AUTOMATIC: "Automatisk publisert",
  REVIEWED_WITHOUT_CHANGES: "Manuelt vurdert uten endringer",
  MANUALLY_CORRECTED: "Manuelt korrigert før publisering",
};

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Ikke publisert";
  }

  return value.toLocaleString("nb-NO");
}

function formatScope(scopes: StatementScope[]) {
  const unique = Array.from(new Set(scopes));
  if (unique.length === 0) {
    return "Ikke registrert";
  }
  if (unique.length === 2) {
    return "Selskap og konsern";
  }
  return unique[0] === "CONSOLIDATED" ? "Konsern" : "Selskap";
}

function deriveMode(input: {
  qualityStatuses: FinancialStatementQualityStatus[];
  reviewCount: number;
}): PublishedAnnualReportMode {
  if (input.qualityStatuses.includes("MANUAL_REVIEW")) {
    return "MANUALLY_CORRECTED";
  }
  if (input.reviewCount > 0) {
    return "REVIEWED_WITHOUT_CHANGES";
  }
  return "AUTOMATIC";
}

export async function listPublishedAnnualReports(input?: {
  query?: string;
  mode?: PublishedAnnualReportMode | "ALL";
}) : Promise<PublishedAnnualReportsResult> {
  const trimmedQuery = input?.query?.trim() ?? "";

  const filings = await prisma.annualReportFiling.findMany({
    where: {
      publishedSnapshotAt: { not: null },
      ...(trimmedQuery
        ? {
            OR: [
              {
                company: {
                  name: {
                    contains: trimmedQuery,
                    mode: "insensitive" as const,
                  },
                },
              },
              {
                company: {
                  orgNumber: {
                    contains: trimmedQuery,
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { publishedSnapshotAt: "desc" },
    select: {
      id: true,
      fiscalYear: true,
      sourceUrl: true,
      publishedSnapshotAt: true,
      company: {
        select: {
          name: true,
          orgNumber: true,
        },
      },
      publishedStatements: {
        where: {
          publishedAt: { not: null },
        },
        select: {
          qualityStatus: true,
          statementScope: true,
        },
      },
      reviews: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
        },
      },
    },
  });

  const mapped = filings.map((filing) => {
    const publishMode = deriveMode({
      qualityStatuses: filing.publishedStatements.map((statement) => statement.qualityStatus),
      reviewCount: filing.reviews.length,
    });

    return {
      filingId: filing.id,
      companyName: filing.company.name,
      orgNumber: filing.company.orgNumber,
      fiscalYear: filing.fiscalYear,
      publishedAt: formatDate(filing.publishedSnapshotAt),
      publishMode,
      publishModeLabel: MODE_LABELS[publishMode],
      scopeLabel: formatScope(filing.publishedStatements.map((statement) => statement.statementScope)),
      sourceUrl: filing.sourceUrl,
      reviewHref: filing.reviews[0] ? `/admin/annual-report-reviews/${filing.reviews[0].id}` : null,
    } satisfies PublishedAnnualReportRow;
  });

  const filtered =
    input?.mode && input.mode !== "ALL"
      ? mapped.filter((row) => row.publishMode === input.mode)
      : mapped;

  return {
    rows: filtered,
    summary: (["AUTOMATIC", "REVIEWED_WITHOUT_CHANGES", "MANUALLY_CORRECTED"] as PublishedAnnualReportMode[]).map(
      (mode) => ({
        key: mode,
        label: MODE_LABELS[mode],
        count: mapped.filter((row) => row.publishMode === mode).length,
      }),
    ),
  };
}
