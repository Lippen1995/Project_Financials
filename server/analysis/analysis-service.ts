import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { FinancialDatasetMode, FinancialDatasetVersion } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { financialsRepository } from "@/server/financials/financials-repository";
import { requireWorkspaceMembership } from "@/server/services/workspace-service";
import {
  companyUniverseQuerySchema,
  rankingCriterionSchema,
} from "./company-analysis-domain";
import { companyUniverseService } from "./company-universe-service";

const sourceMetadataSchema = z.object({
  sourceSystem: z.string().trim().min(1).max(100),
  sourceEntityType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(500),
  fetchedAt: z.string().datetime(),
  normalizedAt: z.string().datetime(),
}).strict();

const jsonObjectSchema = z.record(z.unknown());
const calculationConfigSchema = z.object({
  ranking: z.array(rankingCriterionSchema).min(1).max(10),
}).strict();

const analysisContextShape = {
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2_000),
  workflow: z.enum(["MNA_SCREENING", "SOURCING", "COMPETITOR_ANALYSIS"]),
  criteria: jsonObjectSchema,
  universeQuery: companyUniverseQuerySchema,
  calculationConfig: calculationConfigSchema.nullable().optional(),
} as const;

function requireMatchingWorkflow(
  value: { workflow: string; universeQuery: { workflow: string } },
  context: z.RefinementCtx,
) {
  if (value.workflow !== value.universeQuery.workflow) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Analysis workflow must match the universe workflow.",
      path: ["universeQuery", "workflow"],
    });
  }
}

export const createAnalysisSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  ...analysisContextShape,
}).strict().superRefine(requireMatchingWorkflow);

export const updateDraftSchema = z.object({
  expectedVersion: z.number().int().min(1),
  ...analysisContextShape,
}).strict().superRefine(requireMatchingWorkflow);

export const updateConclusionSchema = z.object({
  expectedVersion: z.number().int().min(1),
  status: z.enum(["DRAFT", "IN_PROGRESS", "COMPLETED", "ARCHIVED"]),
  conclusion: jsonObjectSchema,
  followUp: jsonObjectSchema.optional(),
  sourceOrgNumbers: z.array(z.string().regex(/^\d{9}$/)).min(1).max(500),
}).strict();

const worklistItemSchema = z.object({
  orgNumber: z.string().regex(/^\d{9}$/),
  inclusionBasis: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  dataGaps: z.array(z.string().trim().min(1).max(200)).max(50),
  notes: z.string().trim().max(2_000).optional(),
}).strict();

export const createWorklistSchema = z.object({
  expectedAnalysisVersion: z.number().int().min(1),
  type: z.enum(["LONGLIST", "SHORTLIST", "SOURCING", "PEER_SET"]),
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2_000),
  criteriaVersion: z.string().trim().min(1).max(100),
  items: z.array(worklistItemSchema).min(1).max(500),
}).strict();

export const createWorklistFromUniverseSchema = z.object({
  expectedAnalysisVersion: z.number().int().min(1),
  type: z.enum(["LONGLIST", "SHORTLIST", "SOURCING", "PEER_SET"]),
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2_000),
}).strict();

const financialDatasetModeSchema = z.enum(["reported", "simulated"]);
const financialDatasetVersionSchema = z
  .string()
  .regex(/^(?:reported:\d+|simulated:[A-Za-z0-9_-]+:\d+)$/) as z.ZodType<FinancialDatasetVersion>;

const universeResultEvidenceSchema = z.object({
  version: z.literal("company-universe-result-v1"),
  datasetMode: financialDatasetModeSchema,
  financialDatasetVersion: financialDatasetVersionSchema,
  screeningVersion: z.literal("company-screening-v1"),
  rankingVersion: z.literal("company-ranking-v1").nullable(),
  counts: z.object({
    evaluated: z.number().int().nonnegative().max(5_000),
    included: z.number().int().nonnegative().max(500),
    excluded: z.number().int().nonnegative().max(5_000),
    truncated: z.number().int().nonnegative().max(5_000),
  }).strict(),
  excluded: z.array(z.object({
    orgNumber: z.string().regex(/^\d{9}$/),
    companyName: z.string().trim().min(1).max(500),
    reasons: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
    sourceBasis: z.array(sourceMetadataSchema).min(1).max(10),
  }).strict()).max(5_000),
}).strict().superRefine((value, context) => {
  if (!value.financialDatasetVersion.startsWith(`${value.datasetMode}:`)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Universe dataset mode must match its financial dataset version.",
      path: ["financialDatasetVersion"],
    });
  }
  if (value.counts.excluded !== value.excluded.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Universe exclusion count must match the stored exclusion evidence.",
      path: ["counts", "excluded"],
    });
  }
});

export const reorderWorklistSchema = z.object({
  itemIds: z.array(z.string().trim().min(1).max(128)).min(1).max(500),
}).strict().superRefine((value, context) => {
  if (new Set(value.itemIds).size !== value.itemIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Worklist order contains duplicate item IDs.",
      path: ["itemIds"],
    });
  }
});

export const listWorklistExclusionsSchema = z.object({
  cursor: z.string().regex(/^\d{9}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const promoteWorklistItemSchema = z.object({
  itemId: z.string().trim().min(1).max(128),
  targetWorklistId: z.string().trim().min(1).max(128),
}).strict();

export const feedbackSchema = z.object({
  analysisId: z.string().trim().min(1).max(128).optional(),
  answerKey: z.string().trim().min(1).max(200),
  label: z.enum(["USEFUL", "INCORRECT"]),
  notes: z.string().trim().max(2_000).optional(),
}).strict();

type CreateAnalysisInput = z.input<typeof createAnalysisSchema>;
type UpdateDraftInput = z.input<typeof updateDraftSchema>;
type UpdateConclusionInput = z.input<typeof updateConclusionSchema>;
type CreateWorklistInput = z.input<typeof createWorklistSchema>;
type FeedbackInput = z.input<typeof feedbackSchema>;

type CompanyUniverseRunner = {
  run(input: unknown): Promise<{
    version: "company-universe-result-v1";
    datasetMode: "reported" | "simulated";
    financialDatasetVersion: FinancialDatasetVersion;
    status: "COMPLETE" | "REFINE_REQUIRED";
    screeningVersion: "company-screening-v1";
    rankingVersion?: "company-ranking-v1" | null;
    message?: string;
    counts: {
      evaluated: number;
      included: number;
      excluded: number;
      truncated: number;
    };
    included: Array<{
      orgNumber: string;
      inclusionReasons: string[];
      dataGaps: string[];
      rank?: number;
      score?: number | null;
      coveragePercent?: number;
    }>;
    excluded: Array<{
      orgNumber: string;
      name: string;
      reasons: string[];
      sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
    }>;
  }>;
};

export type AnalysisRepository = {
  requireWorkspaceAccess(userId: string, workspaceId: string): Promise<void>;
  createAnalysis(input: {
    workspaceId: string;
    createdByUserId: string;
    title: string;
    purpose: string;
    workflow: CreateAnalysisInput["workflow"];
    criteriaVersion: "analysis-criteria-v1";
    criteria: Record<string, unknown>;
    universeQueryVersion: "company-universe-v1";
    universeQuery: Record<string, unknown>;
    calculationVersion: "company-ranking-v1" | null;
    calculationConfig: Record<string, unknown> | null;
    sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
  }): Promise<any>;
  getAnalysisAccess(analysisId: string): Promise<{
    id: string;
    workspaceId: string;
    version: number;
    workflow: CreateAnalysisInput["workflow"];
    criteria: unknown;
    universeQuery: unknown;
    calculationConfig: unknown;
    worklistCount: number;
    hasConclusion: boolean;
  } | null>;
  updateAnalysis(
    analysisId: string,
    expectedVersion: number,
    input: {
      version: number;
      status: UpdateConclusionInput["status"];
      conclusion: Record<string, unknown>;
      followUp: Record<string, unknown> | null;
      sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
      archivedAt: Date | null;
    },
  ): Promise<boolean>;
  updateDraft(
    analysisId: string,
    expectedVersion: number,
    input: {
      version: number;
      title: string;
      purpose: string;
      workflow: CreateAnalysisInput["workflow"];
      criteriaVersion: "analysis-criteria-v1";
      criteria: Record<string, unknown>;
      universeQueryVersion: "company-universe-v1";
      universeQuery: Record<string, unknown>;
      calculationVersion: "company-ranking-v1" | null;
      calculationConfig: Record<string, unknown> | null;
    },
  ): Promise<boolean>;
  loadOfficialCompanies(orgNumbers: string[], fiscalYear?: number | null): Promise<Array<{
    orgNumber: string;
    companyName: string;
    sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
  }>>;
  hasRecordedNjordAnswer(userId: string, answerKey: string): Promise<boolean>;
  createWorklist(input: {
    analysisId: string;
    expectedAnalysisVersion: number;
    createdByUserId: string;
    type: CreateWorklistInput["type"];
    name: string;
    purpose: string;
    criteriaVersion: string;
    universeResult: z.infer<typeof universeResultEvidenceSchema> | null;
    items: Array<z.infer<typeof worklistItemSchema> & {
      sortOrder: number;
      companyName: string;
      sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
    }>;
  }): Promise<any>;
  getWorklist(analysisId: string, worklistId: string): Promise<{
    id: string;
    analysisId: string;
    items: Array<{
      id: string;
      orgNumber: string;
      companyName: string;
      sortOrder: number;
      inclusionBasis: unknown;
      dataGaps: unknown;
      sourceBasis: unknown;
      notes: string | null;
    }>;
  } | null>;
  listWorklistExclusions(
    analysisId: string,
    worklistId: string,
    input: { cursor: string | null; limit: number },
  ): Promise<{
    universeResultVersion: string | null;
    financialDatasetMode: FinancialDatasetMode | null;
    financialDatasetVersion: FinancialDatasetVersion | null;
    screeningVersion: string | null;
    rankingVersion: string | null;
    evaluatedCount: number | null;
    includedCount: number | null;
    excludedCount: number | null;
    truncatedCount: number | null;
    universeExecutedAt: Date | null;
    items: Array<{
      orgNumber: string;
      companyName: string;
      reasons: unknown;
      sourceBasis: unknown;
    }>;
    nextCursor: string | null;
  } | null>;
  reorderWorklist(worklistId: string, itemIds: string[]): Promise<void>;
  addWorklistItem(input: {
    worklistId: string;
    orgNumber: string;
    companyName: string;
    sortOrder: number;
    inclusionBasis: unknown;
    dataGaps: unknown;
    sourceBasis: unknown;
    notes: string | null;
  }): Promise<any>;
  saveFeedback(input: {
    userId: string;
    analysisId: string | null;
    answerKey: string;
    label: FeedbackInput["label"];
    notes: string | null;
  }): Promise<any>;
};

const prismaRepository: AnalysisRepository = {
  async requireWorkspaceAccess(userId, workspaceId) {
    await requireWorkspaceMembership(userId, workspaceId);
  },
  async createAnalysis(input) {
    return prisma.analysis.create({
      data: {
        ...input,
        criteria: input.criteria as Prisma.InputJsonValue,
        universeQuery: input.universeQuery as Prisma.InputJsonValue,
        calculationConfig: input.calculationConfig as Prisma.InputJsonValue | undefined ?? undefined,
        sourceBasis: input.sourceBasis as Prisma.InputJsonValue,
      },
    });
  },
  async getAnalysisAccess(analysisId) {
    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        workspaceId: true,
        version: true,
        workflow: true,
        criteria: true,
        universeQuery: true,
        calculationConfig: true,
        conclusion: true,
        _count: { select: { worklists: true } },
      },
    });
    return analysis
      ? {
          id: analysis.id,
          workspaceId: analysis.workspaceId,
          version: analysis.version,
          workflow: analysis.workflow,
          criteria: analysis.criteria,
          universeQuery: analysis.universeQuery,
          calculationConfig: analysis.calculationConfig,
          worklistCount: analysis._count.worklists,
          hasConclusion: analysis.conclusion != null,
        }
      : null;
  },
  async updateAnalysis(analysisId, expectedVersion, input) {
    const result = await prisma.analysis.updateMany({
      where: { id: analysisId, version: expectedVersion },
      data: {
        ...input,
        conclusion: input.conclusion as Prisma.InputJsonValue,
        followUp: input.followUp === null
          ? Prisma.DbNull
          : input.followUp as Prisma.InputJsonValue,
        sourceBasis: input.sourceBasis as Prisma.InputJsonValue,
      },
    });
    return result.count === 1;
  },
  async updateDraft(analysisId, expectedVersion, input) {
    const result = await prisma.analysis.updateMany({
      where: { id: analysisId, version: expectedVersion },
      data: {
        ...input,
        criteria: input.criteria as Prisma.InputJsonValue,
        universeQuery: input.universeQuery as Prisma.InputJsonValue,
        calculationConfig: input.calculationConfig === null
          ? Prisma.DbNull
          : input.calculationConfig as Prisma.InputJsonValue,
      },
    });
    return result.count === 1;
  },
  async loadOfficialCompanies(orgNumbers, fiscalYear) {
    const [companies, financialCompanies] = await Promise.all([
      prisma.registryEntity.findMany({
        where: { orgNumber: { in: orgNumbers } },
        select: {
          orgNumber: true,
          name: true,
          sourceSystem: true,
          sourceEntityType: true,
          sourceId: true,
          fetchedAt: true,
          normalizedAt: true,
        },
      }),
      prisma.company.findMany({
        where: { orgNumber: { in: orgNumbers } },
        select: { id: true, orgNumber: true },
      }),
    ]);

    // Only the provenance of the newest official statement is wanted here, never its figures,
    // but it still has to come from the live dataset: an analysis run against a simulated
    // dataset must cite that dataset's provenance rather than the reported source underneath.
    const orgNumberByCompanyId = new Map(
      financialCompanies.map((company) => [company.id, company.orgNumber] as const),
    );
    const liveStatements =
      financialCompanies.length === 0
        ? []
        : (
            await financialsRepository.getCompaniesFinancials({
              companyIds: financialCompanies.map((company) => company.id),
              ...(fiscalYear == null ? {} : { fiscalYear }),
            })
          ).statements;

    const financialSourceByOrgNumber = new Map<string, (typeof liveStatements)[number]>();
    for (const statement of liveStatements) {
      if (statement.sourceSystem !== "BRREG") continue;
      const orgNumber = orgNumberByCompanyId.get(statement.companyId);
      if (!orgNumber) continue;
      const current = financialSourceByOrgNumber.get(orgNumber);
      const isNewer =
        !current ||
        statement.fiscalYear > current.fiscalYear ||
        (statement.fiscalYear === current.fiscalYear &&
          statement.normalizedAt > current.normalizedAt);
      if (isNewer) financialSourceByOrgNumber.set(orgNumber, statement);
    }
    return companies.map((company) => ({
      orgNumber: company.orgNumber,
      companyName: company.name,
      sourceBasis: [
        {
          sourceSystem: company.sourceSystem,
          sourceEntityType: company.sourceEntityType,
          sourceId: company.sourceId,
          fetchedAt: company.fetchedAt.toISOString(),
          normalizedAt: company.normalizedAt.toISOString(),
        },
        ...(() => {
          const statement = financialSourceByOrgNumber.get(company.orgNumber);
          return statement
            ? [{
                sourceSystem: statement.sourceSystem,
                sourceEntityType: statement.sourceEntityType,
                sourceId: statement.sourceId,
                fetchedAt: statement.fetchedAt.toISOString(),
                normalizedAt: statement.normalizedAt.toISOString(),
              }]
            : [];
        })(),
      ],
    }));
  },
  async hasRecordedNjordAnswer(userId, answerKey) {
    const event = await prisma.aiSearchUsageEvent.findFirst({
      where: { id: answerKey, userId, status: "RECORDED" },
      select: { id: true },
    });
    return Boolean(event);
  },
  async createWorklist(input) {
    return prisma.$transaction(async (transaction) => {
      const claim = await transaction.analysis.updateMany({
        where: {
          id: input.analysisId,
          version: input.expectedAnalysisVersion,
        },
        data: {
          version: { increment: 1 },
        },
      });
      if (claim.count !== 1) {
        throw new Error("Analysis changed since the worklist was prepared.");
      }
      const worklist = await transaction.analysisWorklist.create({
        data: {
          analysisId: input.analysisId,
          createdByUserId: input.createdByUserId,
          type: input.type,
          name: input.name,
          purpose: input.purpose,
          criteriaVersion: input.criteriaVersion,
          universeResultVersion: input.universeResult?.version ?? null,
          financialDatasetMode: input.universeResult?.datasetMode ?? null,
          financialDatasetVersion: input.universeResult?.financialDatasetVersion ?? null,
          screeningVersion: input.universeResult?.screeningVersion ?? null,
          rankingVersion: input.universeResult?.rankingVersion ?? null,
          evaluatedCount: input.universeResult?.counts.evaluated ?? null,
          includedCount: input.universeResult?.counts.included ?? null,
          excludedCount: input.universeResult?.counts.excluded ?? null,
          truncatedCount: input.universeResult?.counts.truncated ?? null,
          universeExecutedAt: input.universeResult ? new Date() : null,
          items: {
            create: input.items.map((item) => ({
              orgNumber: item.orgNumber,
              companyName: item.companyName,
              sortOrder: item.sortOrder,
              inclusionBasis: item.inclusionBasis,
              dataGaps: item.dataGaps,
              sourceBasis: item.sourceBasis,
              notes: item.notes,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (input.universeResult && input.universeResult.excluded.length > 0) {
        await transaction.analysisWorklistExclusion.createMany({
          data: input.universeResult.excluded.map((company) => ({
            worklistId: worklist.id,
            orgNumber: company.orgNumber,
            companyName: company.companyName,
            reasons: company.reasons,
            sourceBasis: company.sourceBasis,
          })),
        });
      }
      return worklist;
    });
  },
  async getWorklist(analysisId, worklistId) {
    return prisma.analysisWorklist.findFirst({
      where: { id: worklistId, analysisId },
      select: {
        id: true,
        analysisId: true,
        items: {
          orderBy: { sortOrder: "asc" },
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
    });
  },
  async listWorklistExclusions(analysisId, worklistId, input) {
    const worklist = await prisma.analysisWorklist.findFirst({
      where: { id: worklistId, analysisId },
      select: {
        universeResultVersion: true,
        financialDatasetMode: true,
        financialDatasetVersion: true,
        screeningVersion: true,
        rankingVersion: true,
        evaluatedCount: true,
        includedCount: true,
        excludedCount: true,
        truncatedCount: true,
        universeExecutedAt: true,
        exclusions: {
          where: input.cursor ? { orgNumber: { gt: input.cursor } } : undefined,
          orderBy: [{ orgNumber: "asc" }, { id: "asc" }],
          take: input.limit + 1,
          select: {
            orgNumber: true,
            companyName: true,
            reasons: true,
            sourceBasis: true,
          },
        },
      },
    });
    if (!worklist) return null;
    const hasMore = worklist.exclusions.length > input.limit;
    const items = worklist.exclusions.slice(0, input.limit);
    const { exclusions: _exclusions, ...metadata } = worklist;
    return {
      ...metadata,
      financialDatasetMode: metadata.financialDatasetMode === null
        ? null
        : financialDatasetModeSchema.parse(metadata.financialDatasetMode),
      financialDatasetVersion: metadata.financialDatasetVersion === null
        ? null
        : financialDatasetVersionSchema.parse(metadata.financialDatasetVersion),
      items,
      nextCursor: hasMore ? items.at(-1)?.orgNumber ?? null : null,
    };
  },
  async reorderWorklist(worklistId, itemIds) {
    await prisma.$transaction(async (transaction) => {
      for (const [index, itemId] of itemIds.entries()) {
        await transaction.analysisWorklistItem.updateMany({
          where: { id: itemId, worklistId },
          data: { sortOrder: -(index + 1) },
        });
      }
      for (const [index, itemId] of itemIds.entries()) {
        await transaction.analysisWorklistItem.updateMany({
          where: { id: itemId, worklistId },
          data: { sortOrder: index + 1 },
        });
      }
    });
  },
  async addWorklistItem(input) {
    try {
      return await prisma.analysisWorklistItem.create({
        data: {
          ...input,
          inclusionBasis: input.inclusionBasis as Prisma.InputJsonValue,
          dataGaps: input.dataGaps as Prisma.InputJsonValue,
          sourceBasis: input.sourceBasis as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Error("Company already exists in the target worklist.");
      }
      throw error;
    }
  },
  async saveFeedback(input) {
    return prisma.njordFeedback.upsert({
      where: {
        userId_answerKey: {
          userId: input.userId,
          answerKey: input.answerKey,
        },
      },
      create: input,
      update: {
        analysisId: input.analysisId,
        label: input.label,
        notes: input.notes,
      },
    });
  },
};

export function createAnalysisService(
  repository: AnalysisRepository = prismaRepository,
  universeRunner: CompanyUniverseRunner = companyUniverseService,
) {
  async function requireAnalysisAccess(actorUserId: string, analysisId: string) {
    const analysis = await repository.getAnalysisAccess(analysisId);
    if (!analysis) throw new Error("Analysis not found.");
    await repository.requireWorkspaceAccess(actorUserId, analysis.workspaceId);
    return analysis;
  }

  function getFiscalYear(analysis: { universeQuery: unknown }) {
    const parsed = companyUniverseQuerySchema.safeParse(analysis.universeQuery);
    return parsed.success ? parsed.data.fiscalYear ?? null : null;
  }

  function canonicalJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalJson);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, canonicalJson(item)]),
      );
    }
    return value ?? null;
  }

  function sameJson(left: unknown, right: unknown) {
    return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
  }

  async function persistWorklist(
    actorUserId: string,
    analysisId: string,
    parsed: z.infer<typeof createWorklistSchema>,
    universeResult: z.infer<typeof universeResultEvidenceSchema> | null = null,
  ) {
    const uniqueOrgNumbers = new Set(parsed.items.map((item) => item.orgNumber));
    if (uniqueOrgNumbers.size !== parsed.items.length) {
      throw new Error("Worklist contains duplicate organisation numbers.");
    }
    const analysis = await requireAnalysisAccess(actorUserId, analysisId);
    if (analysis.version !== parsed.expectedAnalysisVersion) {
      throw new Error("Analysis changed since the worklist was prepared.");
    }
    const officialCompanies = await repository.loadOfficialCompanies(
      [...uniqueOrgNumbers],
      getFiscalYear(analysis),
    );
    const officialByOrgNumber = new Map(
      officialCompanies.map((company) => [company.orgNumber, company]),
    );
    const missingOrgNumbers = [...uniqueOrgNumbers].filter(
      (orgNumber) => !officialByOrgNumber.has(orgNumber),
    );
    if (missingOrgNumbers.length > 0) {
      throw new Error("Worklist contains companies not found in the official registry mirror.");
    }
    return repository.createWorklist({
      analysisId,
      expectedAnalysisVersion: parsed.expectedAnalysisVersion,
      createdByUserId: actorUserId,
      type: parsed.type,
      name: parsed.name,
      purpose: parsed.purpose,
      criteriaVersion: parsed.criteriaVersion,
      universeResult,
      items: parsed.items.map((item, index) => {
        const official = officialByOrgNumber.get(item.orgNumber)!;
        return {
          ...item,
          companyName: official.companyName,
          sourceBasis: official.sourceBasis,
          sortOrder: index + 1,
        };
      }),
    });
  }

  return {
    async create(actorUserId: string, input: unknown) {
      const parsed = createAnalysisSchema.parse(input);
      await repository.requireWorkspaceAccess(actorUserId, parsed.workspaceId);
      return repository.createAnalysis({
        workspaceId: parsed.workspaceId,
        createdByUserId: actorUserId,
        title: parsed.title,
        purpose: parsed.purpose,
        workflow: parsed.workflow,
        criteriaVersion: "analysis-criteria-v1",
        criteria: parsed.criteria,
        universeQueryVersion: parsed.universeQuery.version,
        universeQuery: parsed.universeQuery,
        calculationVersion: parsed.calculationConfig ? "company-ranking-v1" : null,
        calculationConfig: parsed.calculationConfig ?? null,
        // A draft has no evidence yet. Provenance is added only from verified official mirrors
        // when a conclusion or worklist references concrete companies.
        sourceBasis: [],
      });
    },

    async updateConclusion(
      actorUserId: string,
      analysisId: string,
      input: unknown,
    ) {
      const parsed = updateConclusionSchema.parse(input);
      const analysis = await requireAnalysisAccess(actorUserId, analysisId);
      if (analysis.version !== parsed.expectedVersion) {
        throw new Error("Analysis changed since it was loaded.");
      }
      const sourceCompanies = await repository.loadOfficialCompanies([
        ...new Set(parsed.sourceOrgNumbers),
      ], getFiscalYear(analysis));
      const foundOrgNumbers = new Set(sourceCompanies.map((company) => company.orgNumber));
      if (parsed.sourceOrgNumbers.some((orgNumber) => !foundOrgNumbers.has(orgNumber))) {
        throw new Error("Conclusion references companies not found in the official registry mirror.");
      }
      const sourceBasis = sourceCompanies.flatMap((company) => company.sourceBasis);
      const updated = await repository.updateAnalysis(analysisId, parsed.expectedVersion, {
        version: parsed.expectedVersion + 1,
        status: parsed.status,
        conclusion: parsed.conclusion,
        followUp: parsed.followUp ?? null,
        sourceBasis,
        archivedAt: parsed.status === "ARCHIVED" ? new Date() : null,
      });
      if (!updated) throw new Error("Analysis changed since it was loaded.");
    },

    async updateDraft(
      actorUserId: string,
      analysisId: string,
      input: unknown,
    ) {
      const parsed = updateDraftSchema.parse(input);
      const analysis = await requireAnalysisAccess(actorUserId, analysisId);
      if (analysis.version !== parsed.expectedVersion) {
        throw new Error("Analysis changed since it was loaded.");
      }
      const contextChanged =
        analysis.workflow !== parsed.workflow ||
        !sameJson(analysis.criteria, parsed.criteria) ||
        !sameJson(analysis.universeQuery, parsed.universeQuery) ||
        !sameJson(analysis.calculationConfig, parsed.calculationConfig ?? null);
      if (
        contextChanged &&
        (analysis.worklistCount > 0 || analysis.hasConclusion)
      ) {
        throw new Error(
          "Analysis context is locked after worklists or a conclusion have been saved.",
        );
      }
      const updated = await repository.updateDraft(analysisId, parsed.expectedVersion, {
        version: parsed.expectedVersion + 1,
        title: parsed.title,
        purpose: parsed.purpose,
        workflow: parsed.workflow,
        criteriaVersion: "analysis-criteria-v1",
        criteria: parsed.criteria,
        universeQueryVersion: parsed.universeQuery.version,
        universeQuery: parsed.universeQuery,
        calculationVersion: parsed.calculationConfig ? "company-ranking-v1" : null,
        calculationConfig: parsed.calculationConfig ?? null,
      });
      if (!updated) throw new Error("Analysis changed since it was loaded.");
    },

    async createWorklist(
      actorUserId: string,
      analysisId: string,
      input: unknown,
    ) {
      const parsed = createWorklistSchema.parse(input);
      return persistWorklist(actorUserId, analysisId, parsed);
    },

    async createWorklistFromUniverse(
      actorUserId: string,
      analysisId: string,
      input: unknown,
    ) {
      const parsed = createWorklistFromUniverseSchema.parse(input);
      const analysis = await requireAnalysisAccess(actorUserId, analysisId);
      if (analysis.version !== parsed.expectedAnalysisVersion) {
        throw new Error("Analysis changed since the worklist was prepared.");
      }
      const query = companyUniverseQuerySchema.parse(analysis.universeQuery);
      const calculation = analysis.calculationConfig == null
        ? null
        : calculationConfigSchema.parse(analysis.calculationConfig);
      const result = await universeRunner.run({
        query,
        ...(calculation ? { ranking: calculation.ranking } : {}),
      });
      if (result.status === "REFINE_REQUIRED") {
        throw new Error(
          result.message ??
          "Universe is too broad for a complete result. Refine the stored filters.",
        );
      }
      if (result.included.length === 0) {
        throw new Error("The stored universe returned no companies.");
      }
      const items = result.included.map((company) => {
        if (company.inclusionReasons.length === 0) {
          throw new Error("Universe result is missing an inclusion basis.");
        }
        const rankingBasis = result.rankingVersion === "company-ranking-v1"
          ? [
              "RANKED_BY_COMPANY_RANKING_V1",
              ...(company.rank == null ? [] : [`RANK_${company.rank}`]),
              ...(company.score == null ? [] : [`SCORE_${company.score}`]),
              ...(company.coveragePercent == null
                ? []
                : [`COVERAGE_${company.coveragePercent}_PERCENT`]),
            ]
          : [];
        return {
          orgNumber: company.orgNumber,
          inclusionBasis: [...company.inclusionReasons, ...rankingBasis],
          dataGaps: company.dataGaps,
        };
      });
      const universeResult = universeResultEvidenceSchema.parse({
        version: result.version,
        datasetMode: result.datasetMode,
        financialDatasetVersion: result.financialDatasetVersion,
        screeningVersion: result.screeningVersion,
        rankingVersion: result.rankingVersion ?? null,
        counts: result.counts,
        excluded: result.excluded.map((company) => ({
          orgNumber: company.orgNumber,
          companyName: company.name,
          reasons: company.reasons,
          sourceBasis: company.sourceBasis,
        })),
      });
      return persistWorklist(
        actorUserId,
        analysisId,
        createWorklistSchema.parse({
          ...parsed,
          criteriaVersion: "analysis-criteria-v1",
          items,
        }),
        universeResult,
      );
    },

    async listWorklistExclusions(
      actorUserId: string,
      analysisId: string,
      worklistId: string,
      input: unknown,
    ) {
      const parsed = listWorklistExclusionsSchema.parse(input);
      await requireAnalysisAccess(actorUserId, analysisId);
      const result = await repository.listWorklistExclusions(
        analysisId,
        worklistId,
        {
          cursor: parsed.cursor ?? null,
          limit: parsed.limit,
        },
      );
      if (!result) throw new Error("Worklist not found.");
      return {
        ...result,
        universeExecutedAt: result.universeExecutedAt?.toISOString() ?? null,
      };
    },

    async reorderWorklist(
      actorUserId: string,
      analysisId: string,
      worklistId: string,
      input: unknown,
    ) {
      const parsed = reorderWorklistSchema.parse(input);
      await requireAnalysisAccess(actorUserId, analysisId);
      const worklist = await repository.getWorklist(analysisId, worklistId);
      if (!worklist) throw new Error("Worklist not found.");
      const storedItemIds = new Set(worklist.items.map((item) => item.id));
      if (
        parsed.itemIds.length !== storedItemIds.size ||
        parsed.itemIds.some((itemId) => !storedItemIds.has(itemId))
      ) {
        throw new Error("Worklist order must contain all stored items exactly once.");
      }
      await repository.reorderWorklist(worklistId, parsed.itemIds);
    },

    async promoteWorklistItem(
      actorUserId: string,
      analysisId: string,
      sourceWorklistId: string,
      input: unknown,
    ) {
      const parsed = promoteWorklistItemSchema.parse(input);
      if (sourceWorklistId === parsed.targetWorklistId) {
        throw new Error("Target worklist must be different from the source worklist.");
      }
      await requireAnalysisAccess(actorUserId, analysisId);
      const [sourceWorklist, targetWorklist] = await Promise.all([
        repository.getWorklist(analysisId, sourceWorklistId),
        repository.getWorklist(analysisId, parsed.targetWorklistId),
      ]);
      if (!sourceWorklist || !targetWorklist) throw new Error("Worklist not found.");
      const sourceItem = sourceWorklist.items.find((item) => item.id === parsed.itemId);
      if (!sourceItem) throw new Error("Worklist item not found.");
      if (targetWorklist.items.some((item) => item.orgNumber === sourceItem.orgNumber)) {
        throw new Error("Company already exists in the target worklist.");
      }
      const nextSortOrder = targetWorklist.items.reduce(
        (maximum, item) => Math.max(maximum, item.sortOrder),
        0,
      ) + 1;
      return repository.addWorklistItem({
        worklistId: targetWorklist.id,
        orgNumber: sourceItem.orgNumber,
        companyName: sourceItem.companyName,
        sortOrder: nextSortOrder,
        inclusionBasis: sourceItem.inclusionBasis,
        dataGaps: sourceItem.dataGaps,
        sourceBasis: sourceItem.sourceBasis,
        notes: sourceItem.notes,
      });
    },

    async saveNjordFeedback(actorUserId: string, input: unknown) {
      const parsed = feedbackSchema.parse(input);
      if (parsed.analysisId) await requireAnalysisAccess(actorUserId, parsed.analysisId);
      if (!await repository.hasRecordedNjordAnswer(actorUserId, parsed.answerKey)) {
        throw new Error("Njord answer not found.");
      }
      return repository.saveFeedback({
        userId: actorUserId,
        analysisId: parsed.analysisId ?? null,
        answerKey: parsed.answerKey,
        label: parsed.label,
        notes: parsed.notes ?? null,
      });
    },
  };
}

export const analysisService = createAnalysisService();
