import { describe, expect, it } from "vitest";

import {
  createAnalysisReadService,
  type AnalysisReadRepository,
  type AnalysisWorkflow,
} from "./analysis-read-service";
import {
  createAnalysisService,
  type AnalysisRepository,
} from "./analysis-service";
import type { CompanyUniverseCandidate } from "./company-analysis-domain";
import { createCompanyUniverseService } from "./company-universe-service";

const observedAt = new Date("2026-07-28T08:00:00.000Z");
type OfficialCompanyFixture = {
  companyName: string;
  sourceBasis: Array<{
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: string;
    normalizedAt: string;
  }>;
};

const sourceByOrgNumber: Record<string, OfficialCompanyFixture> = {
  "923609016": {
    companyName: "EQUINOR ASA",
    sourceBasis: [{
      sourceSystem: "BRREG",
      sourceEntityType: "enhet",
      sourceId: "923609016",
      fetchedAt: "2026-07-09T20:08:19.474Z",
      normalizedAt: "2026-07-09T20:08:19.474Z",
    }],
  },
  "984851006": {
    companyName: "DNB BANK ASA",
    sourceBasis: [{
      sourceSystem: "BRREG",
      sourceEntityType: "enhet",
      sourceId: "984851006",
      fetchedAt: "2026-07-09T20:10:02.099Z",
      normalizedAt: "2026-07-09T20:10:02.099Z",
    }],
  },
  "982463718": {
    companyName: "TELENOR ASA",
    sourceBasis: [{
      sourceSystem: "BRREG",
      sourceEntityType: "enhet",
      sourceId: "982463718",
      fetchedAt: "2026-07-09T20:09:57.017Z",
      normalizedAt: "2026-07-09T20:09:57.017Z",
    }],
  },
  "914778271": {
    companyName: "Norsk Hydro ASA",
    sourceBasis: [{
      sourceSystem: "BRREG",
      sourceEntityType: "enhet",
      sourceId: "914778271",
      fetchedAt: "2026-07-09T20:07:47.307Z",
      normalizedAt: "2026-07-09T20:07:47.307Z",
    }],
  },
};

type StoredAnalysis = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  createdByUserId: string;
  workflow: AnalysisWorkflow;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";
  title: string;
  purpose: string;
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
  worklists: Array<{
    id: string;
    type: "LONGLIST" | "SHORTLIST" | "SOURCING" | "PEER_SET";
    name: string;
    purpose: string;
    criteriaVersion: string;
    universeResultVersion: string | null;
    financialDatasetMode: "reported" | "simulated" | null;
    financialDatasetVersion: `reported:${number}` | `simulated:${string}:${number}` | null;
    screeningVersion: string | null;
    rankingVersion: string | null;
    evaluatedCount: number | null;
    includedCount: number | null;
    excludedCount: number | null;
    truncatedCount: number | null;
    universeExecutedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
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
    exclusions: Array<{
      orgNumber: string;
      companyName: string;
      reasons: string[];
      sourceBasis: OfficialCompanyFixture["sourceBasis"];
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

function createWorkflowHarness() {
  const analyses = new Map<string, StoredAnalysis>();

  const writeRepository: AnalysisRepository = {
    async requireWorkspaceAccess() {},
    async createAnalysis(input) {
      const id = `analysis-${input.workflow.toLowerCase()}`;
      const analysis: StoredAnalysis = {
        id,
        workspaceId: input.workspaceId,
        workspaceName: "Fjord Insight",
        createdByUserId: input.createdByUserId,
        workflow: input.workflow,
        status: "DRAFT",
        title: input.title,
        purpose: input.purpose,
        criteriaVersion: input.criteriaVersion,
        criteria: input.criteria,
        universeQueryVersion: input.universeQueryVersion,
        universeQuery: input.universeQuery,
        calculationVersion: input.calculationVersion,
        calculationConfig: input.calculationConfig,
        sourceBasis: input.sourceBasis,
        conclusion: null,
        followUp: null,
        version: 1,
        worklists: [],
        createdAt: observedAt,
        updatedAt: observedAt,
      };
      analyses.set(id, analysis);
      return analysis;
    },
    async getAnalysisAccess(analysisId) {
      const analysis = analyses.get(analysisId);
      return analysis
        ? {
            id: analysis.id,
            workspaceId: analysis.workspaceId,
            version: analysis.version,
            workflow: analysis.workflow,
            criteria: analysis.criteria,
            universeQuery: analysis.universeQuery,
            calculationConfig: analysis.calculationConfig,
            worklistCount: analysis.worklists.length,
            hasConclusion: analysis.conclusion != null,
          }
        : null;
    },
    async updateAnalysis(analysisId, expectedVersion, input) {
      const analysis = analyses.get(analysisId);
      if (!analysis || analysis.version !== expectedVersion) return false;
      analysis.version = input.version;
      analysis.status = input.status;
      analysis.conclusion = input.conclusion;
      analysis.followUp = input.followUp;
      analysis.sourceBasis = input.sourceBasis;
      analysis.updatedAt = observedAt;
      return true;
    },
    async updateDraft() {
      return false;
    },
    async loadOfficialCompanies(orgNumbers) {
      return orgNumbers.flatMap((orgNumber) => {
        const source = sourceByOrgNumber[orgNumber];
        return source ? [{ orgNumber, ...source }] : [];
      });
    },
    async hasRecordedNjordAnswer() {
      return true;
    },
    async createWorklist(input) {
      const analysis = analyses.get(input.analysisId);
      if (!analysis || analysis.version !== input.expectedAnalysisVersion) {
        throw new Error("Analysis changed since the worklist was prepared.");
      }
      analysis.version += 1;
      const worklist = {
        id: `${analysis.id}-worklist`,
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
        universeExecutedAt: input.universeResult ? observedAt : null,
        createdAt: observedAt,
        updatedAt: observedAt,
        items: input.items.map((item, index) => ({
          id: `${analysis.id}-item-${index + 1}`,
          orgNumber: item.orgNumber,
          companyName: item.companyName,
          sortOrder: item.sortOrder,
          inclusionBasis: item.inclusionBasis,
          dataGaps: item.dataGaps,
          sourceBasis: item.sourceBasis,
          notes: item.notes ?? null,
        })),
        exclusions: input.universeResult?.excluded ?? [],
      };
      analysis.worklists.push(worklist);
      return worklist;
    },
    async getWorklist(analysisId, worklistId) {
      const worklist = analyses
        .get(analysisId)
        ?.worklists.find((item) => item.id === worklistId);
      return worklist
        ? {
            id: worklist.id,
            analysisId,
            items: worklist.items,
          }
        : null;
    },
    async listWorklistExclusions(analysisId, worklistId, input) {
      const worklist = analyses
        .get(analysisId)
        ?.worklists.find((item) => item.id === worklistId);
      if (!worklist) return null;
      const filtered = worklist.exclusions
        .filter((item) => input.cursor == null || item.orgNumber > input.cursor)
        .slice(0, input.limit);
      return {
        universeResultVersion: worklist.universeResultVersion,
        financialDatasetMode: worklist.financialDatasetMode,
        financialDatasetVersion: worklist.financialDatasetVersion,
        screeningVersion: worklist.screeningVersion,
        rankingVersion: worklist.rankingVersion,
        evaluatedCount: worklist.evaluatedCount,
        includedCount: worklist.includedCount,
        excludedCount: worklist.excludedCount,
        truncatedCount: worklist.truncatedCount,
        universeExecutedAt: worklist.universeExecutedAt,
        items: filtered,
        nextCursor: null,
      };
    },
    async reorderWorklist() {},
    async addWorklistItem() {
      throw new Error("Not used by the workflow proof.");
    },
    async saveFeedback() {
      throw new Error("Not used by the workflow proof.");
    },
  };

  const readRepository: AnalysisReadRepository = {
    async listAccessible() {
      return [...analyses.values()].map((analysis) => ({
        id: analysis.id,
        workspaceId: analysis.workspaceId,
        workspaceName: analysis.workspaceName,
        title: analysis.title,
        purpose: analysis.purpose,
        workflow: analysis.workflow,
        status: analysis.status,
        criteriaVersion: analysis.criteriaVersion,
        universeQueryVersion: analysis.universeQueryVersion,
        calculationVersion: analysis.calculationVersion,
        version: analysis.version,
        worklistCount: analysis.worklists.length,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
      }));
    },
    async loadAccessibleDetail(_userId, analysisId) {
      return analyses.get(analysisId) ?? null;
    },
  };

  const candidatesByWorkflow = {
    MNA_SCREENING: { included: "923609016", excluded: "914778271" },
    SOURCING: { included: "984851006", excluded: "982463718" },
    COMPETITOR_ANALYSIS: { included: "982463718", excluded: "984851006" },
  } as const;
  const candidateDetails = {
    "923609016": { naceCode: "06.100", municipalityNumber: "1103", employeeCount: 21_467 },
    "984851006": { naceCode: "64.190", municipalityNumber: "0301", employeeCount: 7_536 },
    "982463718": { naceCode: "61.100", municipalityNumber: "3201", employeeCount: 298 },
    "914778271": { naceCode: "24.420", municipalityNumber: "0301", employeeCount: 391 },
  } as const;
  const toCandidate = (
    orgNumber: keyof typeof candidateDetails,
  ): CompanyUniverseCandidate => {
    const official = sourceByOrgNumber[orgNumber]!;
    return {
      orgNumber,
      name: official.companyName,
      legalForm: "ASA",
      status: "ACTIVE",
      ...candidateDetails[orgNumber],
      companySource: official.sourceBasis[0]!,
      financials: null,
    };
  };
  const universeRunner = createCompanyUniverseService({
    async loadCandidates(query) {
      const selection = candidatesByWorkflow[query.workflow];
      return {
        candidates: [
          toCandidate(selection.included),
          toCandidate(selection.excluded),
        ],
        truncated: false,
        datasetMode: "reported",
        financialDatasetVersion: "reported:21",
      };
    },
  });

  return {
    write: createAnalysisService(writeRepository, universeRunner),
    read: createAnalysisReadService(readRepository),
  };
}

const workflows = [
  {
    workflow: "MNA_SCREENING" as const,
    title: "M&A-screening",
    purpose: "Finn dokumenterte oppkjøpskandidater.",
    worklistType: "LONGLIST" as const,
    expectedOrgNumber: "923609016",
    excludedOrgNumber: "914778271",
    industryCodePrefix: "06",
  },
  {
    workflow: "SOURCING" as const,
    title: "Leverandørsourcing",
    purpose: "Finn dokumenterte leverandørkandidater.",
    worklistType: "SOURCING" as const,
    expectedOrgNumber: "984851006",
    excludedOrgNumber: "982463718",
    industryCodePrefix: "64",
  },
  {
    workflow: "COMPETITOR_ANALYSIS" as const,
    title: "Konkurrentanalyse",
    purpose: "Bygg et dokumentert peer-sett.",
    worklistType: "PEER_SET" as const,
    expectedOrgNumber: "982463718",
    excludedOrgNumber: "984851006",
    industryCodePrefix: "61",
  },
];

describe("Sprint 3 analysis workflows", () => {
  for (const scenario of workflows) {
    it(`completes ${scenario.workflow} from purpose through ranked worklist to stored conclusion`, async () => {
      const harness = createWorkflowHarness();
      const analysis = await harness.write.create("user-1", {
        workspaceId: "workspace-1",
        title: scenario.title,
        purpose: scenario.purpose,
        workflow: scenario.workflow,
        criteria: { officialDataOnly: true },
        universeQuery: {
          version: "company-universe-v1",
          workflow: scenario.workflow,
          statuses: ["ACTIVE"],
          industryCodePrefixes: [scenario.industryCodePrefix],
          missingDataPolicy: "INCLUDE_WITH_GAP",
          limit: 100,
        },
        calculationConfig: {
          ranking: [{
            metric: "EMPLOYEE_COUNT",
            direction: "HIGHER_BETTER",
            weight: 100,
          }],
        },
      });

      const worklist = await harness.write.createWorklistFromUniverse("user-1", analysis.id, {
        expectedAnalysisVersion: 1,
        type: scenario.worklistType,
        name: `${scenario.title} – prioritert liste`,
        purpose: scenario.purpose,
      });
      const exclusions = await harness.write.listWorklistExclusions(
        "user-1",
        analysis.id,
        worklist.id,
        { limit: 25 },
      );
      await harness.write.updateConclusion("user-1", analysis.id, {
        expectedVersion: 2,
        status: "COMPLETED",
        conclusion: { summary: `Prioriter ${scenario.expectedOrgNumber}.` },
        followUp: { nextStep: "Valider kandidaten manuelt." },
        sourceOrgNumbers: [scenario.expectedOrgNumber],
      });

      const stored = await harness.read.get("user-1", analysis.id);

      expect(exclusions).toMatchObject({
        universeResultVersion: "company-universe-result-v1",
        financialDatasetMode: "reported",
        financialDatasetVersion: "reported:21",
        screeningVersion: "company-screening-v1",
        rankingVersion: "company-ranking-v1",
        excludedCount: 1,
        items: [{
          orgNumber: scenario.excludedOrgNumber,
          reasons: ["INDUSTRY_NOT_INCLUDED"],
          sourceBasis: [{
            sourceSystem: "BRREG",
            sourceEntityType: "enhet",
            sourceId: scenario.excludedOrgNumber,
            fetchedAt: expect.any(String),
            normalizedAt: expect.any(String),
          }],
        }],
      });

      expect(stored).toMatchObject({
        workflow: scenario.workflow,
        purpose: scenario.purpose,
        status: "COMPLETED",
        version: 3,
        universeQueryVersion: "company-universe-v1",
        calculationVersion: "company-ranking-v1",
        conclusion: { summary: `Prioriter ${scenario.expectedOrgNumber}.` },
        sourceBasis: [
          expect.objectContaining({
            sourceSystem: "BRREG",
            sourceId: scenario.expectedOrgNumber,
          }),
        ],
        worklists: [{
          type: scenario.worklistType,
          purpose: scenario.purpose,
          universeResultVersion: "company-universe-result-v1",
          financialDatasetMode: "reported",
          financialDatasetVersion: "reported:21",
          screeningVersion: "company-screening-v1",
          rankingVersion: "company-ranking-v1",
          evaluatedCount: 2,
          includedCount: 1,
          excludedCount: 1,
          items: [{
            orgNumber: scenario.expectedOrgNumber,
            sortOrder: 1,
            inclusionBasis: [
              "MATCHED_VERSIONED_UNIVERSE_QUERY",
              "RANKED_BY_COMPANY_RANKING_V1",
              "RANK_1",
              "SCORE_100",
              "COVERAGE_100_PERCENT",
            ],
            sourceBasis: [
              expect.objectContaining({
                sourceSystem: "BRREG",
                sourceId: scenario.expectedOrgNumber,
              }),
            ],
          }],
        }],
      });
    });
  }
});
