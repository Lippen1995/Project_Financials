import { prisma } from "@/lib/prisma";

export type AnalysisWorkflow = "MNA_SCREENING" | "SOURCING" | "COMPETITOR_ANALYSIS";
export type AnalysisStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";

type AnalysisSummaryRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  purpose: string;
  workflow: AnalysisWorkflow;
  status: AnalysisStatus;
  criteriaVersion: string;
  universeQueryVersion: string;
  calculationVersion: string | null;
  version: number;
  worklistCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AnalysisSummary = Omit<AnalysisSummaryRow, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

type AnalysisWorklistItemRow = {
  id: string;
  orgNumber: string;
  companyName: string;
  sortOrder: number;
  inclusionBasis: unknown;
  dataGaps: unknown;
  sourceBasis: unknown;
  notes: string | null;
};

type AnalysisWorklistRow = {
  id: string;
  type: "LONGLIST" | "SHORTLIST" | "SOURCING" | "PEER_SET";
  name: string;
  purpose: string;
  criteriaVersion: string;
  universeResultVersion: string | null;
  screeningVersion: string | null;
  rankingVersion: string | null;
  evaluatedCount: number | null;
  includedCount: number | null;
  excludedCount: number | null;
  truncatedCount: number | null;
  universeExecutedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: AnalysisWorklistItemRow[];
};

type AnalysisDetailRow = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  purpose: string;
  workflow: AnalysisWorkflow;
  status: AnalysisStatus;
  criteriaVersion: string;
  criteria: unknown;
  universeQueryVersion: string;
  universeQuery: unknown;
  calculationVersion: string | null;
  calculationConfig: unknown;
  sourceBasis: unknown;
  conclusion: unknown;
  followUp: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  worklists: AnalysisWorklistRow[];
};

export type AnalysisDetail = Omit<
  AnalysisDetailRow,
  "createdAt" | "updatedAt" | "worklists"
> & {
  createdAt: string;
  updatedAt: string;
  worklists: Array<Omit<
    AnalysisWorklistRow,
    "createdAt" | "updatedAt" | "universeExecutedAt"
  > & {
    createdAt: string;
    updatedAt: string;
    universeExecutedAt: string | null;
  }>;
};

export type AnalysisReadRepository = {
  listAccessible(userId: string, includeArchived: boolean): Promise<AnalysisSummaryRow[]>;
  loadAccessibleDetail(userId: string, analysisId: string): Promise<AnalysisDetailRow | null>;
};

const prismaRepository: AnalysisReadRepository = {
  async listAccessible(userId, includeArchived) {
    const analyses = await prisma.analysis.findMany({
      where: {
        workspace: { members: { some: { userId } } },
        ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        workspaceId: true,
        workspace: { select: { name: true } },
        title: true,
        purpose: true,
        workflow: true,
        status: true,
        criteriaVersion: true,
        universeQueryVersion: true,
        calculationVersion: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { worklists: true } },
      },
    });
    return analyses.map((analysis) => ({
      id: analysis.id,
      workspaceId: analysis.workspaceId,
      workspaceName: analysis.workspace.name,
      title: analysis.title,
      purpose: analysis.purpose,
      workflow: analysis.workflow,
      status: analysis.status,
      criteriaVersion: analysis.criteriaVersion,
      universeQueryVersion: analysis.universeQueryVersion,
      calculationVersion: analysis.calculationVersion,
      version: analysis.version,
      worklistCount: analysis._count.worklists,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
    }));
  },
  async loadAccessibleDetail(userId, analysisId) {
    const analysis = await prisma.analysis.findFirst({
      where: {
        id: analysisId,
        workspace: { members: { some: { userId } } },
      },
      select: {
        id: true,
        workspaceId: true,
        workspace: { select: { name: true } },
        title: true,
        purpose: true,
        workflow: true,
        status: true,
        criteriaVersion: true,
        criteria: true,
        universeQueryVersion: true,
        universeQuery: true,
        calculationVersion: true,
        calculationConfig: true,
        sourceBasis: true,
        conclusion: true,
        followUp: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        worklists: {
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            type: true,
            name: true,
            purpose: true,
            criteriaVersion: true,
            universeResultVersion: true,
            screeningVersion: true,
            rankingVersion: true,
            evaluatedCount: true,
            includedCount: true,
            excludedCount: true,
            truncatedCount: true,
            universeExecutedAt: true,
            createdAt: true,
            updatedAt: true,
            items: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              select: {
                id: true,
                orgNumber: true,
                companyName: true,
                sortOrder: true,
                inclusionBasis: true,
                dataGaps: true,
                sourceBasis: true,
                notes: true,
              },
            },
          },
        },
      },
    });
    if (!analysis) return null;
    const { workspace, ...detail } = analysis;
    return {
      ...detail,
      workspaceName: workspace.name,
    };
  },
};

function toSummary(row: AnalysisSummaryRow): AnalysisSummary {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: AnalysisDetailRow): AnalysisDetail {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    worklists: row.worklists.map((worklist) => ({
      ...worklist,
      createdAt: worklist.createdAt.toISOString(),
      updatedAt: worklist.updatedAt.toISOString(),
      universeExecutedAt: worklist.universeExecutedAt?.toISOString() ?? null,
    })),
  };
}

export function createAnalysisReadService(repository: AnalysisReadRepository = prismaRepository) {
  return {
    async list(actorUserId: string, options: { includeArchived?: boolean } = {}) {
      const rows = await repository.listAccessible(
        actorUserId,
        options.includeArchived ?? false,
      );
      return rows.map(toSummary);
    },
    async get(actorUserId: string, analysisId: string) {
      const normalizedId = analysisId.trim();
      if (!normalizedId || normalizedId.length > 128) return null;
      const row = await repository.loadAccessibleDetail(actorUserId, normalizedId);
      return row ? toDetail(row) : null;
    },
  };
}

export const analysisReadService = createAnalysisReadService();
