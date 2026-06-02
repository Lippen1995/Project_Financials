import { type AnnualReportFilingStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AdminFilingRow = {
  id: string;
  companyName: string;
  orgNumber: string;
  fiscalYear: number;
  status: AnnualReportFilingStatus;
  statusLabel: string;
  parserVersion: string | null;
  updatedAt: string;
  reviewHref: string | null;
};

export type AdminFilingsResult = {
  rows: AdminFilingRow[];
  totalCount: number;
  statusCounts: Array<{ status: AnnualReportFilingStatus; label: string; count: number }>;
};

const STATUS_LABELS: Record<AnnualReportFilingStatus, string> = {
  DISCOVERED: "Oppdaget",
  DOWNLOADED: "Lastet ned",
  PROCESSING: "Behandles",
  PREFLIGHTED: "Preflight OK",
  EXTRACTED: "Ekstrahert",
  VALIDATED: "Validert",
  MANUAL_REVIEW: "Manuell kontroll",
  PUBLISHED: "Publisert",
  FAILED: "Feilet",
};

const STATUS_ORDER: AnnualReportFilingStatus[] = [
  "DISCOVERED",
  "DOWNLOADED",
  "PROCESSING",
  "PREFLIGHTED",
  "EXTRACTED",
  "VALIDATED",
  "MANUAL_REVIEW",
  "PUBLISHED",
  "FAILED",
];

export async function listAdminFilings(input: {
  status?: AnnualReportFilingStatus;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminFilingsResult> {
  const limit = input.limit ?? 100;
  const offset = input.offset ?? 0;
  const query = input.query?.trim();

  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(query
      ? {
          OR: [
            { company: { name: { contains: query, mode: "insensitive" as const } } },
            { company: { orgNumber: { contains: query } } },
          ],
        }
      : {}),
  };

  const [rows, totalCount, statusGroups] = await Promise.all([
    prisma.annualReportFiling.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        fiscalYear: true,
        status: true,
        parserVersionLastTried: true,
        updatedAt: true,
        company: {
          select: { name: true, orgNumber: true },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    prisma.annualReportFiling.count({ where }),
    prisma.annualReportFiling.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const statusCounts = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: statusGroups.find((g) => g.status === status)?._count.id ?? 0,
  }));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      companyName: row.company.name,
      orgNumber: row.company.orgNumber,
      fiscalYear: row.fiscalYear,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status],
      parserVersion: row.parserVersionLastTried,
      updatedAt: row.updatedAt.toLocaleString("nb-NO"),
      reviewHref: row.reviews[0] ? `/admin/annual-report-reviews/${row.reviews[0].id}` : null,
    })),
    totalCount,
    statusCounts,
  };
}
