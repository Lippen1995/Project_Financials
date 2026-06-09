import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    createNewsSignal: vi.fn(),
  },
  prismaMock: {
    sourceDocument: {
      findMany: vi.fn(),
    },
    company: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/server/news/company-event-repository", () => repositoryMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { buildCompanyAliases, normalizeCompanyName } from "@/server/news/company-alias-service";
import { buildEntityIndex, getCandidateCompanyIdsFromText } from "@/server/news/company-entity-index";
import {
  extractCompanyEntityHints,
  findCompanyMatchesForDocument,
  persistCompanyMentionSignals,
  resolveCompanyEntitiesForRecentDocuments,
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

  it("normalizes real Norwegian letters for event and entity matching", () => {
    expect(normalizeCompanyName("Blåbær & Rør AS")).toBe("blabaer & ror as");
    expect(normalizeCompanyName("Administrerende direktør får ny låneavtale")).toBe(
      "administrerende direktor far ny laneavtale",
    );
  });

  it("builds useful aliases from names, slugs and domains", () => {
    expect(buildCompanyAliases(companies[1])).toEqual(
      expect.arrayContaining(["Nordic Thermal Systems AS", "nordic thermal systems", "nordicthermal.example"]),
    );
    expect(buildCompanyAliases(companies[1])).not.toContain("NTS");
  });

  it("does not turn an unrelated website brand into a free text company alias", () => {
    const aliases = buildCompanyAliases({
      name: "FJORD REKRUTTERING AS",
      website: "https://www.people.no",
      legalForm: "AS",
    });

    expect(aliases).toContain("people.no");
    expect(aliases).not.toContain("people");
  });

  it("does not give a parent brand alias to subsidiaries sharing its domain", () => {
    const aliases = buildCompanyAliases({
      name: "EQUINOR BIL OSLO",
      website: "https://www.equinor.com",
      legalForm: "AS",
    });

    expect(aliases).toContain("equinor.com");
    expect(aliases).not.toContain("equinor");
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

  it("rejects ambiguous single-word companies without a verified website", () => {
    const ambiguousCompanies = [
      {
        id: "point",
        name: "POINT AS",
        orgNumber: "222333444",
        legalForm: "AS",
      },
      {
        id: "complex",
        name: "COMPLEX AS",
        orgNumber: "333444555",
        legalForm: "AS",
      },
    ];

    expect(
      findCompanyMatchesForDocument(
        document({
          title: "Some signs point to a stronger market",
          summary: "Analysts say the evidence may point in the same direction.",
        }),
        ambiguousCompanies,
      ),
    ).toEqual([]);
    expect(
      findCompanyMatchesForDocument(
        document({
          title: "Bank flags delays as tasks grow complex",
          summary: "The most complex work will take longer than expected.",
        }),
        ambiguousCompanies,
      ),
    ).toEqual([]);
  });

  it("keeps established single-word brands with a verified website", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        title: "Equinor reports a new discovery",
        summary: "Equinor expects drilling to continue this year.",
      }),
      companies,
    );

    expect(matches.some((match) => match.companyId === "eqnr")).toBe(true);
  });

  it("rejects a website-backed single word used as an ordinary verb mid-title", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        sourceId: "insurancejournal",
        title: "US lawmakers release draft bill on state AI rules",
        summary: "Lawmakers release the proposal after months of negotiations.",
      }),
      [
        {
          id: "release",
          name: "RELEASE AS",
          orgNumber: "934123456",
          website: "https://www.release.no",
          legalForm: "AS",
        },
      ],
    );

    expect(matches).toEqual([]);
  });

  it("does not map a government department to a same-name Norwegian company", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        sourceId: "google-news",
        title: "USA Rare Earth secures CHIPS package from Department of Commerce",
        summary: "The US Commerce Department approved the package.",
      }),
      [
        {
          id: "commerce",
          name: "COMMERCE AS",
          orgNumber: "999888777",
          website: "https://commerce.no",
          legalForm: "AS",
        },
      ],
    );

    expect(matches).toEqual([]);
  });

  it("does not treat a former employee reference as a direct company event", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        sourceId: "google-news-upstream",
        title: "Former Equinor executive bolsters Orsted's top team",
        summary: "The former Equinor executive will join Orsted next month.",
      }),
      companies,
    );

    expect(matches.some((match) => match.companyId === "eqnr")).toBe(false);
  });

  it("allows a Norwegian business source to identify a local single-word brand", () => {
    const matches = findCompanyMatchesForDocument(
      document({
        sourceId: "e24",
        title: "Milliardforbedring for Oda",
        summary: "Oda reduserte underskuddet betydelig.",
      }),
      [
        {
          id: "oda",
          name: "ODA AS",
          orgNumber: "923123456",
          legalForm: "AS",
        },
      ],
    );

    expect(matches.some((match) => match.companyId === "oda")).toBe(true);
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

  it("matches explicit aliases without guessing short initialisms", () => {
    const matches = findCompanyMatchesForDocument(
      document({ title: "Nordic Thermal Systems signs industrial heat agreement" }),
      companies,
    );

    expect(matches[0]?.companyId).toBe("nts");
    expect(matches[0]?.evidence.some((item) => item.kind.startsWith("alias"))).toBe(true);
  });

  it("does not treat generated three-letter initialisms as company identity", () => {
    const collisionCompanies = [
      {
        id: "hpe",
        name: "Hans Petter Engineering AS",
        orgNumber: "111222333",
        legalForm: "AS",
      },
      {
        id: "bot",
        name: "Bygg Og Treteknikk AS",
        orgNumber: "444555666",
        legalForm: "AS",
      },
    ];

    expect(
      findCompanyMatchesForDocument(
        document({ title: "HPE shares soar as AI infrastructure demand rises" }),
        collisionCompanies,
      ),
    ).toEqual([]);
    expect(
      findCompanyMatchesForDocument(
        document({ title: "Bot Auto appoints a new chief operating officer" }),
        collisionCompanies,
      ),
    ).toEqual([]);
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

  it("does not match company aliases or tokens inside unrelated words", () => {
    const candidates = [
      {
        id: "ring",
        name: "Ring AS",
        orgNumber: "222333444",
        slug: "ring-as",
        legalForm: "AS",
      },
    ];
    const matches = findCompanyMatchesForDocument(
      document({ title: "Manufacturing demand improves across Europe" }),
      candidates,
      { threshold: 0.1 },
    );
    const index = buildEntityIndex(candidates);
    const candidateIds = getCandidateCompanyIdsFromText(index, "Manufacturing demand improves");

    expect(candidateIds.has("ring")).toBe(false);
    expect(matches).toEqual([]);
  });

  it("builds an index that narrows candidate companies from document text", () => {
    const index = buildEntityIndex(companies);
    const candidateIds = getCandidateCompanyIdsFromText(index, "Nordic Thermal Systems announces expansion");

    expect(candidateIds.has("nts")).toBe(true);
    expect(candidateIds.has("eqnr")).toBe(false);
  });

  it("extracts issuer names and organization numbers as targeted DB hints", () => {
    const hints = extractCompanyEntityHints([
      document({
        title: "Remote Industrials AS: Tildelt ny kontrakt",
        sourcePayload: {
          issuerName: "Payload Robotics ASA",
          orgNumber: "987654321",
        },
      }),
    ]);

    expect(hints.issuerNames).toEqual(expect.arrayContaining(["Remote Industrials AS", "Payload Robotics ASA"]));
    expect(hints.orgNumbers).toContain("987654321");
  });

  it("trusts structured company identity over textual subsidiary-like matches", () => {
    const issuerCompanies = [
      companies[0],
      {
        id: "equinor-bil",
        name: "Equinor Bil Oslo AS",
        orgNumber: "981617517",
        legalForm: "AS",
      },
    ];

    const matches = findCompanyMatchesForDocument(
      document({
        title: "Equinor ASA: Share buy-back",
        sourcePayload: {
          companyId: "eqnr",
          orgNumber: "923609016",
          issuerName: "Equinor ASA",
        },
      }),
      issuerCompanies,
    );

    expect(matches.map((match) => match.companyId)).toEqual(["eqnr"]);
  });

  it("resolves companies from targeted hints even when the baseline company window misses them", async () => {
    const remoteCompany = {
      id: "remote",
      name: "Remote Industrials AS",
      orgNumber: "987654321",
      slug: "remote-industrials-as",
      website: null,
      legalForm: "AS",
      status: "ACTIVE",
      industryCode: { code: "28.990", title: "Industri" },
    };

    prismaMock.sourceDocument.findMany.mockResolvedValue([
      document({
        id: "doc-targeted",
        title: "Remote Industrials AS: Tildelt ny kontrakt",
        sourcePayload: { orgNumber: "987654321" },
      }),
    ]);
    prismaMock.company.findMany.mockResolvedValueOnce([remoteCompany]).mockResolvedValueOnce([companies[0]]);
    repositoryMock.createNewsSignal.mockResolvedValue({ id: "signal-targeted" });

    const result = await resolveCompanyEntitiesForRecentDocuments({ limit: 1, companyLimit: 1 });

    expect(result).toEqual({ documentsProcessed: 1, signalsCreated: 1 });
    expect(prismaMock.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { orgNumber: { in: ["987654321"] } },
            { name: { equals: "Remote Industrials AS", mode: "insensitive" } },
          ]),
        }),
      }),
    );
    expect(repositoryMock.createNewsSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-targeted",
        companyId: "remote",
      }),
    );
  });

  it("limits entity resolution to the sources from the current sync", async () => {
    prismaMock.sourceDocument.findMany.mockResolvedValue([]);
    prismaMock.company.findMany.mockResolvedValue([]);

    await resolveCompanyEntitiesForRecentDocuments({
      limit: 20,
      sourceIds: ["oslobors"],
    });

    expect(prismaMock.sourceDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceId: { in: ["oslobors"] },
        },
        take: 20,
      }),
    );
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
