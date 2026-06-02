import { describe, expect, it } from "vitest";

import {
  NEWS_RELEVANCE_THRESHOLD,
  __testables,
  extractNewsFeatures,
  generateNewsCandidates,
  scoreNewsFeatures,
  type CompanyNewsContext,
  type GeneratedNewsCandidate,
} from "@/server/services/news-relevance-engine";

function buildContext(partial: Partial<CompanyNewsContext> = {}): CompanyNewsContext {
  return {
    companyId: "company-1",
    orgNumber: "123456789",
    name: "Nordic Thermal Systems AS",
    normalizedName: "nordic thermal systems",
    aliases: ["Nordic Thermal Systems", "NTS"],
    websiteAliases: ["nordicthermalsystems.no", "nordicthermalsystems"],
    brandSupportTokens: ["thermal", "systems", "industry"],
    industryCode: "28.250",
    industryPrefixes: ["28", "2825"],
    sectorTokens: ["thermal", "systems", "industrial", "heat"],
    parentTokens: ["manufacturing", "industry"],
    regionTokens: ["oslo"],
    sourceSignals: ["AS", "123456789"],
    groupRelations: [],
    peerCompanies: [],
    ipProfile: {
      hasPortfolio: false,
      tokens: [],
      applicationNumbers: [],
      ownerNames: [],
    },
    ...partial,
  };
}

function buildCandidate(
  companyId = "company-1",
  reasons: GeneratedNewsCandidate["reasons"] = ["DIRECT_MENTION"],
  candidateScore = 0.52,
  macroHits: GeneratedNewsCandidate["macroHits"] = [],
): GeneratedNewsCandidate {
  return {
    companyId,
    reasons,
    candidateScore,
    macroHits,
  };
}

describe("news relevance engine", () => {
  it("builds useful aliases and strips legal suffixes", () => {
    expect(__testables.buildCompanyAliases("Nordic Thermal Systems AS")).toEqual(
      expect.arrayContaining(["Nordic Thermal Systems AS", "Nordic Thermal Systems", "NTS"]),
    );
  });

  it("generates direct mention candidates and scores them above threshold", () => {
    const context = buildContext();
    const article = {
      id: "article-1",
      title: "Nordic Thermal Systems vant stor industrikontrakt i Oslo",
      summary: "NTS utvider produksjonen etter avtalen.",
      source: "dn",
      publishedAt: new Date(),
    };

    const candidates = generateNewsCandidates(article, [context]);
    expect(candidates[0]?.reasons).toContain("DIRECT_MENTION");

    const features = extractNewsFeatures(article, context, candidates[0]!);
    const score = scoreNewsFeatures(article.id, context.companyId, features);

    expect(features.directMentionScore).toBeGreaterThan(0.4);
    expect(score.totalScore).toBeGreaterThan(NEWS_RELEVANCE_THRESHOLD);
    expect(score.reasons).toContain("Direkte omtale");
  });

  it("detects group relevance through related companies", () => {
    const context = buildContext({
      groupRelations: [
        {
          companyId: "parent-1",
          name: "Fjord Parent Holding",
          orgNumber: "987654321",
          aliases: ["Fjord Parent", "FPH"],
          confidence: 0.82,
          relationType: "OWNER",
        },
      ],
    });
    const article = {
      id: "article-2",
      title: "Fjord Parent kjøper nytt datterselskap i Sverige",
      summary: "Konsernet styrker sin industrielle portefølje.",
      source: "e24",
      publishedAt: new Date(),
    };

    const candidate = buildCandidate(context.companyId, ["GROUP_RELATION"]);
    const features = extractNewsFeatures(article, context, candidate);
    const score = scoreNewsFeatures(article.id, context.companyId, features);

    expect(features.groupScore).toBeGreaterThan(0.3);
    expect(score.primaryType).toBe("group");
    expect(score.reasons).toContain("Konsernrelatert");
  });

  it("weights macro relevance higher when industry fit is stronger", () => {
    const constructionContext = buildContext({
      industryPrefixes: ["41"],
      sectorTokens: ["bolig", "bygg", "entreprise"],
      parentTokens: ["construction"],
    });
    const fishContext = buildContext({
      companyId: "company-2",
      industryPrefixes: ["03"],
      sectorTokens: ["laks", "oppdrett", "fisk"],
      parentTokens: ["aquaculture"],
    });
    const article = {
      id: "article-3",
      title: "Boligbyggere presses av rente og inflasjon",
      summary: "Høyere styringsrente rammer nye prosjekter hardt.",
      source: "dn",
      publishedAt: new Date(),
    };

    const macroHits = [{ id: "rente", label: "Rente", strength: 0.68 }];
    const constructionFeatures = extractNewsFeatures(
      article,
      constructionContext,
      buildCandidate(constructionContext.companyId, ["INDUSTRY_SIGNAL", "MACRO_SIGNAL"], 0.46, macroHits),
    );
    const fishFeatures = extractNewsFeatures(
      article,
      fishContext,
      buildCandidate(fishContext.companyId, ["MACRO_SIGNAL"], 0.28, macroHits),
    );

    expect(constructionFeatures.macroScore).toBeGreaterThan(fishFeatures.macroScore);
  });

  it("allows broad interest-rate news without a company mention", () => {
    const context = buildContext({
      industryPrefixes: ["63"],
      sectorTokens: ["informasjonstjenester"],
      parentTokens: [],
    });
    const article = {
      id: "article-rate",
      title: "Policy rate raised to 4.25%",
      summary: "Norges Bank decided to raise the policy rate after its monetary policy meeting.",
      source: "norgesbank",
      publishedAt: new Date(),
    };

    const candidates = generateNewsCandidates(article, [context]);
    expect(candidates[0]?.reasons).toContain("MACRO_SIGNAL");

    const features = extractNewsFeatures(article, context, candidates[0]!);
    const score = scoreNewsFeatures(article.id, context.companyId, features);

    expect(score.primaryType).toBe("macro");
    expect(score.totalScore).toBeGreaterThan(NEWS_RELEVANCE_THRESHOLD);
  });

  it("does not treat unrelated M&A as standalone macro relevance", () => {
    const oilContext = buildContext({
      industryPrefixes: ["06", "0610"],
      sectorTokens: ["olje", "gass", "petroleum", "utvinning", "raolje"],
      parentTokens: ["energi"],
    });
    const article = {
      id: "article-unrelated-ma",
      title: "Elkjops oppkjop av Eplehuset ma vurderes naermere",
      summary: "Konkurransetilsynet vurderer markedet for Apple-produkter og norske forbrukere.",
      source: "konkurransetilsynet",
      publishedAt: new Date(),
    };

    const candidates = generateNewsCandidates(article, [oilContext]);
    expect(candidates).toHaveLength(0);
  });

  it("keeps peer-only articles below the relevance threshold without supporting context", () => {
    const context = buildContext({
      peerCompanies: [
        {
          companyId: "peer-1",
          name: "Arctic Furnace Labs",
          orgNumber: "111222333",
          aliases: ["AFL"],
          confidence: 0.74,
          industryPrefix: "28",
        },
      ],
    });
    const article = {
      id: "article-4",
      title: "Arctic Furnace Labs ansetter ny CFO",
      summary: "Lederskiftet kommer etter et travelt år.",
      source: "kampanje",
      publishedAt: new Date(),
    };

    const candidate = buildCandidate(context.companyId, ["PEER_MENTION"], 0.24);
    const features = extractNewsFeatures(article, context, candidate);
    const score = scoreNewsFeatures(article.id, context.companyId, features);

    expect(features.peerScore).toBeGreaterThan(0.15);
    expect(score.totalScore).toBeLessThan(NEWS_RELEVANCE_THRESHOLD);
  });

  it("detects patent and innovation signals from portfolio tokens", () => {
    const context = buildContext({
      ipProfile: {
        hasPortfolio: true,
        tokens: ["heat battery", "phase change material", "patent"],
        applicationNumbers: ["NO20241234"],
        ownerNames: ["Nordic Thermal Systems AS"],
      },
    });
    const article = {
      id: "article-5",
      title: "Nordic Thermal Systems sender patentsøknad for heat battery",
      summary: "NO20241234 beskriver ny faseendringsteknologi for industriell lagring.",
      source: "tu",
      publishedAt: new Date(),
    };

    const candidate = buildCandidate(context.companyId, ["DIRECT_MENTION", "IP_SIGNAL"]);
    const features = extractNewsFeatures(article, context, candidate);
    const score = scoreNewsFeatures(article.id, context.companyId, features);

    expect(features.ipScore).toBeGreaterThan(0.35);
    expect(score.reasons).toContain("Patent/innovasjon");
  });

  it("penalizes ambiguous short-name alias matches when other support is weak", () => {
    const penalty = __testables.computeAmbiguityPenalty("Sel AS", ["Sel"], 0.08, 0, 0.04, 0);
    expect(penalty).toBeGreaterThan(0.2);
  });
});
