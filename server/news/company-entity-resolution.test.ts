import { beforeEach, describe, expect, it, vi } from "vitest";

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    createNewsSignal: vi.fn(),
  },
}));

vi.mock("@/server/news/company-event-repository", () => repositoryMock);

import { buildCompanyAliases, normalizeCompanyName } from "@/server/news/company-alias-service";
import { buildEntityIndex, getCandidateCompanyIdsFromText } from "@/server/news/company-entity-index";
import {
  findCompanyMatchesForDocument,
  persistCompanyMentionSignals,
  scoreCompanyDocumentMatch,
  type SourceDocumentForEntityResolution,
} from "@/server/news/company-entity-resolution";

const companies = [
  {
    id: "eqnr",
    name: "Equinor ASA",
    orgNumber: "923609016",
    slug: "equinor-asa",
    website: "https://www.equinor.com",
    legalForm: "ASA",
    industryCode: { code: "06.100", title: "Utvinning av råolje" },
  },
  {
    id: "nts",
    name: "Nordic Thermal Systems AS",
    orgNumber: "999111222",
    slug: "nordic-thermal-systems-as",
    website: "https://nordicthermal.example",
    legalForm: "AS",
    industryCode: { code: "28.250", title: "Maskinindustri" },
  },
  {
    id: "as",
    name: "AS AS",
    orgNumber: "111222333",
    slug: "as-as",
    legalForm: "AS",
  },
];

function document(partial: Partial<SourceDocumentForEntityResolution>): SourceDocumentForEntityResolution {
  return {
    id: "doc-1",
    title: "Market update",
    summary: null,
    bodyText: null,
    ...partial,
  };
}

describe("company entity resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes Norwegian company names safely", () => {
    expect(normalizeCompanyName("Blåbær & Rør AS")).toBe("blabaer & ror as");
  });

  it("builds useful aliases from names, slugs and domains", () => {
    expect(buildCompanyAliases(companies[1])).toEqual(
      expect.arrayContaining(["Nordic Thermal Systems AS", "nordic thermal systems", "NTS", "nordicthermal.example"]),
    );
  });

  it("matches exact company names in titles with high confidence", () => {
    const matches = findCompanyMatchesForDocument(
      document({ title: "Equinor ASA announces a new oil discovery" }),
      companies,
    );

    expect(matches[0]).toMatchObject({
      companyId: "eqnr",
      mentionContext: "headline",
    });
    expect(matches[0]?.entityConfidence).toBeGreaterThan(0.7);
    expect(matches[0]?.evidence[0].kind).toContain("exact_name_title");
  });

  it("matches exact company names in summaries", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        title: "New offshore contract announced",
        summary: "Equinor ASA is named as operator in the project.",
      }),
      companies,
    );

    expect(matches[0]?.companyId).toBe("eqnr");
    expect(matches[0]?.mentionContext).toBe("summary");
  });

  it("matches organization numbers very strongly", () => {
    const matches = findCompanyMatchesForDocument(
      document({ title: "Issuer update", summary: "Org.nr. 923609016 reports a change." }),
      companies,
    );

    expect(matches[0]?.companyId).toBe("eqnr");
    expect(matches[0]?.entityConfidence).toBeGreaterThan(0.9);
  });

  it("penalizes common short company names below threshold", () => {
    const matches = findCompanyMatchesForDocument(document({ title: "AS wins small tender" }), companies);

    expect(matches.some((match) => match.companyId === "as")).toBe(false);
  });

  it("keeps weak body-only mentions below default threshold", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        title: "General energy market update",
        bodyText: "The report briefly lists Equinor ASA among many other historical examples.",
      }),
      companies,
    );

    expect(matches.some((match) => match.companyId === "eqnr")).toBe(false);
  });

  it("matches aliases and initialisms", () => {
    const matches = findCompanyMatchesForDocument(
      document({ title: "NTS signs industrial heat agreement" }),
      companies,
    );

    expect(matches[0]?.companyId).toBe("nts");
    expect(matches[0]?.evidence.some((item) => item.kind.startsWith("alias"))).toBe(true);
  });

  it("supports multiple significant token matches", () => {
    const match = scoreCompanyDocumentMatch(
      buildEntityIndex(companies).byCompanyId.get("nts")!,
      document({ title: "Nordic Thermal expands production" }),
    );

    expect(match?.entityConfidence).toBeGreaterThan(0.45);
    expect(match?.evidence.some((item) => item.kind === "significant_token_match")).toBe(true);
  });

  it("does not return matches below threshold", () => {
    const matches = findCompanyMatchesForDocument(document({ title: "Shell reports US shale update" }), companies);

    expect(matches).toEqual([]);
  });

  it("builds an index that narrows candidate companies from document text", () => {
    const index = buildEntityIndex(companies);
    const candidateIds = getCandidateCompanyIdsFromText(index, "Nordic Thermal Systems announces expansion");

    expect(candidateIds.has("nts")).toBe(true);
    expect(candidateIds.has("eqnr")).toBe(false);
  });

  it("persists company mention signals with evidence snapshots", async () => {
    repositoryMock.createNewsSignal.mockResolvedValue({ id: "signal-1" });

    const matches = await persistCompanyMentionSignals(
      document({ title: "Equinor ASA announces a new oil discovery" }),
      companies,
    );

    expect(matches).toHaveLength(1);
    expect(repositoryMock.createNewsSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        companyId: "eqnr",
        signalType: "company_mention",
        confidence: expect.any(Number),
        evidence: expect.objectContaining({
          evidence: expect.any(Array),
          lowSignalPenalty: expect.any(Number),
        }),
      }),
    );
  });
});
