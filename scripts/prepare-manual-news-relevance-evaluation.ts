import { writeFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DEFAULT_SOURCES = [
  "sodir-news",
  "sodir-production",
  "sodir-drilling-permits",
  "sodir-exploration-results",
  "eia-today",
  "eia-press",
  "eia-petroleum-weekly",
  "iea-news",
];

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function numericArg(name: string, fallback: number) {
  const parsed = Number(argValue(name));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const limit = Math.min(numericArg("limit", 300), 1_000);
  const perCompany = Math.min(numericArg("per-company", 12), 50);
  const sources = (argValue("sources")?.split(",") ?? DEFAULT_SOURCES)
    .map((source) => source.trim())
    .filter(Boolean);
  const output = argValue("output");

  const rows = await prisma.newsArticleRelevance.findMany({
    where: {
      newsArticle: {
        source: { in: sources },
      },
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          orgNumber: true,
          industryCode: true,
        },
      },
      newsArticle: {
        include: {
          feedback: {
            select: { companyId: true },
          },
          extraction: {
            select: {
              lead: true,
              mainText: true,
              sourceDomain: true,
            },
          },
        },
      },
    },
    orderBy: [
      { totalScore: "desc" },
      { newsArticle: { publishedAt: "desc" } },
    ],
    take: 10_000,
  });

  const companyCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const selected: (typeof rows)[number][] = [];
  const sourceQueue = [...sources];

  while (selected.length < limit && sourceQueue.length > 0) {
    let selectedThisRound = false;
    for (const source of sourceQueue) {
      if (selected.length >= limit) break;
      const candidate = rows.find((row) => {
        if (selected.includes(row)) return false;
        if (row.newsArticle.source !== source) return false;
        if (row.newsArticle.feedback.some((feedback) => feedback.companyId === row.companyId)) {
          return false;
        }
        return (companyCounts.get(row.companyId) ?? 0) < perCompany;
      });
      if (!candidate) continue;
      selected.push(candidate);
      companyCounts.set(
        candidate.companyId,
        (companyCounts.get(candidate.companyId) ?? 0) + 1,
      );
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      selectedThisRound = true;
    }
    if (!selectedThisRound) break;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    population: rows.length,
    selectedPairs: selected.length,
    selectedCompanies: companyCounts.size,
    sources: Object.fromEntries(sourceCounts),
    pairs: selected.map((row) => ({
      articleId: row.newsArticleId,
      companyId: row.companyId,
      companyName: row.company.name,
      organizationNumber: row.company.orgNumber,
      industryCode: row.company.industryCode,
      source: row.newsArticle.source,
      publishedAt: row.newsArticle.publishedAt.toISOString(),
      title: row.newsArticle.title,
      summary: row.newsArticle.summary,
      lead: row.newsArticle.extraction?.lead ?? null,
      mainText: row.newsArticle.extraction?.mainText?.slice(0, 4_000) ?? null,
      url: row.newsArticle.url,
      model: {
        totalScore: row.totalScore,
        confidenceScore: row.confidenceScore,
        directScore: row.directScore,
        sectorScore: row.sectorScore,
        macroScore: row.macroScore,
        competitorScore: row.competitorScore,
        primaryType: row.primaryType,
        reasons: row.reasons,
        evidence: row.evidence,
      },
    })),
  };

  if (output) {
    await writeFile(output, JSON.stringify(result, null, 2), "utf8");
    console.log(`Manual relevance sample written to ${output}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
