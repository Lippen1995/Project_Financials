import { prisma } from "@/lib/prisma";

export type ArticleInput = {
  id: string;
  title: string;
  summary: string | null;
};

export type CompanyInput = {
  id: string;
  name: string;
  industryCode?: { code: string; title: string; description?: string | null } | null;
};

export type RelevanceScore = {
  newsArticleId: string;
  totalScore: number;
  directScore: number;
  sectorScore: number;
  macroScore: number;
  competitorScore: number;
  reasoning: string | null;
  tags: string[];
  scoredBy: string;
};

const MACRO_KEYWORDS: Record<string, string[]> = {
  rente: ["styringsrente", "rente", "norges bank", "pengepolitikk", "inflasjon", "rentehøyning", "rentekutt", "renteøkning"],
  regulering: ["regulering", "lov", "forskrift", "eu-direktiv", "finanstilsynet", "konkurransetilsynet", "krav", "compliance"],
  ma: ["oppkjøp", "fusjon", "kapitalinnhenting", "emisjon", "børsnotering", "ipo", "overtakelse", "eierskap"],
  konkurs: ["konkurs", "betalingsutsettelse", "avvikling", "insolvens", "akkord", "gjeldsforhandling"],
  energi: ["energipris", "strømpris", "oljepris", "gasspris", "kraftpris", "energikrise"],
  konjunktur: ["lavkonjunktur", "høykonjunktur", "resesjon", "vekst", "bnp", "sysselsetting", "arbeidsledighet"],
};

function normalizeNorwegian(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(normalizeNorwegian(text).split(" ").filter((w) => w.length >= 3));
}

function keywordOverlapScore(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const normalizedText = normalizeNorwegian(text);
  const hits = keywords.filter((kw) => normalizedText.includes(normalizeNorwegian(kw)));
  return Math.min(hits.length / Math.max(keywords.length * 0.3, 3), 1.0);
}

function scoreDirectMatch(companyName: string, text: string): number {
  const needle = normalizeNorwegian(
    companyName
      .toLowerCase()
      .replace(/\b(as|asa|ans|da|sa|ba|kf|sf|fkf|iks|stiftelse|konsern)\b/gi, "")
      .trim(),
  );
  if (needle.length < 3) return 0;
  const haystack = normalizeNorwegian(text);
  if (haystack.includes(needle)) return needle.length >= 8 ? 1.0 : 0.7;
  const words = needle.split(" ").filter((w) => w.length >= 4);
  if (words.length >= 2 && words.every((w) => haystack.includes(w))) return 0.6;
  return 0;
}

function scoreMacroKeywords(text: string): { score: number; tags: string[] } {
  const tags: string[] = [];
  let totalHits = 0;
  for (const [category, keywords] of Object.entries(MACRO_KEYWORDS)) {
    const s = keywordOverlapScore(text, keywords);
    if (s > 0) {
      tags.push(category);
      totalHits++;
    }
  }
  return { score: Math.min(totalHits * 0.25, 1.0), tags };
}

function scoreCompetitorActivity(text: string, sectorKeywords: string[]): number {
  if (sectorKeywords.length === 0) return 0;
  const sectorOverlap = keywordOverlapScore(text, sectorKeywords);
  const maKeywords = MACRO_KEYWORDS.ma ?? [];
  const maOverlap = keywordOverlapScore(text, maKeywords);
  return sectorOverlap * 0.5 + maOverlap * 0.5;
}

function buildReasoning(
  directScore: number,
  sectorScore: number,
  macroScore: number,
  competitorScore: number,
  macroTags: string[],
): string | null {
  if (directScore >= 0.6) return "Selskapet er nevnt direkte i artikkelen.";
  if (macroScore >= 0.5 && macroTags.length > 0) {
    const tagMap: Record<string, string> = {
      rente: "renteendring",
      regulering: "reguleringsendring",
      ma: "M&A-aktivitet",
      konkurs: "konkursnyhet",
      energi: "energiprisendring",
      konjunktur: "konjunkturnyhet",
    };
    const label = tagMap[macroTags[0]] ?? macroTags[0];
    return `Makroøkonomisk relevans: ${label}.`;
  }
  if (sectorScore >= 0.4) return "Artikkelen er relevant for selskapets bransje.";
  if (competitorScore >= 0.4) return "Mulig konkurrent- eller bransjeaktivitet.";
  return null;
}

async function getSectorKeywords(industryCode: string): Promise<string[]> {
  const prefix = industryCode.slice(0, 2);
  const codes = await prisma.industryCode.findMany({
    where: {
      OR: [{ code: industryCode }, { code: { startsWith: prefix } }],
    },
    select: { title: true, description: true },
    take: 30,
  });

  const allText = codes.map((c) => `${c.title} ${c.description ?? ""}`).join(" ");
  const tokens = tokenize(allText);
  return Array.from(tokens).filter((w) => w.length >= 4);
}

export async function scoreArticlesLocally(
  articles: ArticleInput[],
  company: CompanyInput,
): Promise<RelevanceScore[]> {
  const sectorKeywords = company.industryCode
    ? await getSectorKeywords(company.industryCode.code)
    : [];

  const results: RelevanceScore[] = [];

  for (const article of articles) {
    const text = `${article.title} ${article.summary ?? ""}`;

    const directScore = scoreDirectMatch(company.name, text);
    const sectorScore = keywordOverlapScore(text, sectorKeywords) * 0.8;
    const { score: macroScore, tags: macroTags } = scoreMacroKeywords(text);
    const competitorScore = scoreCompetitorActivity(text, sectorKeywords) * 0.6;

    const totalScore = Math.max(directScore, sectorScore, macroScore * 0.7, competitorScore);

    if (totalScore < 0.35) continue;

    const allTags = [
      ...macroTags,
      ...(directScore >= 0.6 ? ["direkte"] : []),
      ...(sectorScore >= 0.4 ? ["sektor"] : []),
      ...(competitorScore >= 0.4 ? ["konkurrent"] : []),
    ];

    results.push({
      newsArticleId: article.id,
      totalScore,
      directScore,
      sectorScore,
      macroScore,
      competitorScore,
      reasoning: buildReasoning(directScore, sectorScore, macroScore, competitorScore, macroTags),
      tags: allTags,
      scoredBy: "local",
    });
  }

  return results;
}
