import { beforeEach, describe, expect, it, vi } from "vitest";

import { getKnowledgeRuleStatus, searchBusinessKnowledge } from "@/server/knowledge/knowledge-repository";
import {
  getRuleStatusTool,
  searchAccountingGuidanceTool,
  searchBusinessPolicyTool,
  searchEuEeaLawTool,
  searchNorwegianLawTool,
} from "./search-knowledge";

vi.mock("@/server/knowledge/knowledge-repository", () => ({
  searchBusinessKnowledge: vi.fn(),
  getKnowledgeRuleStatus: vi.fn(),
}));

const result = {
  citationId: "knowledge:doc-1:chunk-1",
  documentId: "doc-1",
  externalId: "LOV-1997-06-13-44",
  title: "Aksjeloven",
  authority: "Lovdata",
  jurisdiction: "NO" as const,
  domain: "NORWEGIAN_LAW" as const,
  documentType: "LAW" as const,
  legalStatus: "IN_FORCE" as const,
  provisionRef: "§ 8-1",
  heading: "Hva som kan utdeles som utbytte",
  excerpt: "Selskapet kan bare dele ut utbytte ...",
  sourceUrl: "https://lovdata.no/dokument/NL/lov/1997-06-13-44",
  publishedAt: "1997-06-13T00:00:00.000Z",
  effectiveFrom: "1999-01-01T00:00:00.000Z",
  effectiveTo: null,
  eeaStatus: {
    incorporationStatus: "NOT_RELEVANT" as const,
    decisionReference: null,
    incorporatedAt: null,
    effectiveFrom: null,
  },
  norwayImplementation: {
    status: "NOT_REQUIRED" as const,
    implementingReference: null,
    implementedAt: null,
  },
  effectiveAtDate: true,
  relevanceScore: 0.82,
  provenance: {
    sourceSystem: "LOVDATA_API",
    sourceEntityType: "law",
    sourceId: "LOV-1997-06-13-44:v1",
    fetchedAt: "2026-07-21T08:00:00.000Z",
    normalizedAt: "2026-07-21T08:00:00.000Z",
  },
};

describe("Njord offline knowledge tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchBusinessKnowledge).mockResolvedValue([result]);
  });

  it.each([
    [searchNorwegianLawTool, ["NORWEGIAN_LAW"]],
    [searchAccountingGuidanceTool, ["ACCOUNTING", "IFRS"]],
    [searchEuEeaLawTool, ["EU_EEA_LAW"]],
    [searchBusinessPolicyTool, ["BUSINESS_POLICY"]],
  ] as const)("applies the authoritative domain filter for %s", async (tool, domains) => {
    const output = await tool.execute({ query: "utbytte", asOf: null, limit: 5 });

    expect(searchBusinessKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ query: "utbytte", domains: [...domains], limit: 5 }),
    );
    expect(output.results[0]).toMatchObject({ citationId: result.citationId });
  });

  it("returns a dated rule status without asking the network", async () => {
    vi.mocked(getKnowledgeRuleStatus).mockResolvedValue({
      asOf: "2026-07-21T00:00:00.000Z",
      matched: true,
      candidates: [{ ...result, effectiveAtDate: true }],
    });

    const output = await getRuleStatusTool.execute({
      reference: "LOV-1997-06-13-44",
      asOf: "2026-07-21",
      limit: 5,
    });

    expect(getKnowledgeRuleStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reference: "LOV-1997-06-13-44" }),
    );
    expect(output.matched).toBe(true);
  });
});
