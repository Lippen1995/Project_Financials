import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/server/services/workspace-service";
import { companyUniverseQuerySchema } from "./company-analysis-domain";

const sourceMetadataSchema = z.object({
  sourceSystem: z.string().trim().min(1).max(100),
  sourceEntityType: z.string().trim().min(1).max(100),
  sourceId: z.string().trim().min(1).max(500),
  fetchedAt: z.string().datetime(),
  normalizedAt: z.string().datetime(),
}).strict();

const jsonObjectSchema = z.record(z.unknown());

const createAnalysisSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2_000),
  workflow: z.enum(["MNA_SCREENING", "SOURCING", "COMPETITOR_ANALYSIS"]),
  criteria: jsonObjectSchema,
  universeQuery: companyUniverseQuerySchema,
  calculationConfig: jsonObjectSchema.optional(),
}).strict();

const updateConclusionSchema = z.object({
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

const createWorklistSchema = z.object({
  type: z.enum(["LONGLIST", "SHORTLIST", "SOURCING", "PEER_SET"]),
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(2_000),
  criteriaVersion: z.string().trim().min(1).max(100),
  items: z.array(worklistItemSchema).min(1).max(500),
}).strict();

const feedbackSchema = z.object({
  analysisId: z.string().trim().min(1).max(128).optional(),
  answerKey: z.string().trim().min(1).max(200),
  label: z.enum(["USEFUL", "INCORRECT"]),
  notes: z.string().trim().max(2_000).optional(),
}).strict();

type CreateAnalysisInput = z.input<typeof createAnalysisSchema>;
type UpdateConclusionInput = z.input<typeof updateConclusionSchema>;
type CreateWorklistInput = z.input<typeof createWorklistSchema>;
type FeedbackInput = z.input<typeof feedbackSchema>;

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
    universeQuery: unknown;
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
  loadOfficialCompanies(orgNumbers: string[], fiscalYear?: number | null): Promise<Array<{
    orgNumber: string;
    companyName: string;
    sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
  }>>;
  hasRecordedNjordAnswer(userId: string, answerKey: string): Promise<boolean>;
  createWorklist(input: {
    analysisId: string;
    createdByUserId: string;
    type: CreateWorklistInput["type"];
    name: string;
    purpose: string;
    criteriaVersion: string;
    items: Array<z.infer<typeof worklistItemSchema> & {
      sortOrder: number;
      companyName: string;
      sourceBasis: Array<z.infer<typeof sourceMetadataSchema>>;
    }>;
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
    return prisma.analysis.findUnique({
      where: { id: analysisId },
      select: { id: true, workspaceId: true, version: true, universeQuery: true },
    });
  },
  async updateAnalysis(analysisId, expectedVersion, input) {
    const result = await prisma.analysis.updateMany({
      where: { id: analysisId, version: expectedVersion },
      data: {
        ...input,
        conclusion: input.conclusion as Prisma.InputJsonValue,
        followUp: input.followUp as Prisma.InputJsonValue | undefined ?? undefined,
        sourceBasis: input.sourceBasis as Prisma.InputJsonValue,
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
        select: {
          orgNumber: true,
          financialStatements: {
            where: {
              sourceSystem: "BRREG",
              ...(fiscalYear == null ? {} : { fiscalYear }),
            },
            orderBy: [{ fiscalYear: "desc" }, { normalizedAt: "desc" }],
            take: 1,
            select: {
              sourceSystem: true,
              sourceEntityType: true,
              sourceId: true,
              fetchedAt: true,
              normalizedAt: true,
            },
          },
        },
      }),
    ]);
    const financialSourceByOrgNumber = new Map(
      financialCompanies.flatMap((company) => {
        const statement = company.financialStatements[0];
        return statement ? [[company.orgNumber, statement] as const] : [];
      }),
    );
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
    return prisma.analysisWorklist.create({
      data: {
        analysisId: input.analysisId,
        createdByUserId: input.createdByUserId,
        type: input.type,
        name: input.name,
        purpose: input.purpose,
        criteriaVersion: input.criteriaVersion,
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

export function createAnalysisService(repository: AnalysisRepository = prismaRepository) {
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

    async createWorklist(
      actorUserId: string,
      analysisId: string,
      input: unknown,
    ) {
      const parsed = createWorklistSchema.parse(input);
      const uniqueOrgNumbers = new Set(parsed.items.map((item) => item.orgNumber));
      if (uniqueOrgNumbers.size !== parsed.items.length) {
        throw new Error("Worklist contains duplicate organisation numbers.");
      }
      const analysis = await requireAnalysisAccess(actorUserId, analysisId);
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
        createdByUserId: actorUserId,
        type: parsed.type,
        name: parsed.name,
        purpose: parsed.purpose,
        criteriaVersion: parsed.criteriaVersion,
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
