import { writeFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

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
  const limit = Math.min(numericArg("limit", 100), 500);
  const companyLimit = Math.min(numericArg("companies", 20), 50);
  const articleLimit = Math.min(numericArg("articles", 20), 50);
  const output = argValue("output");

  const [companies, articles, existingFeedback] = await Promise.all([
    prisma.petroleumCompanyExposureSnapshot.findMany({
      where: {
        OR: [
          { operatedProductionOe: { gt: 0 } },
          { remainingReservesOe: { gt: 0 } },
          { operatorFieldCount: { gt: 0 } },
          { licenceCount: { gt: 0 } },
        ],
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
      },
      orderBy: [
        { operatedProductionOe: "desc" },
        { remainingReservesOe: "desc" },
      ],
      take: companyLimit,
    }),
    prisma.newsArticle.findMany({
      where: {
        source: {
          in: ["eia-today", "eia-press", "eia-petroleum-weekly", "iea-news"],
        },
      },
      include: {
        extraction: {
          select: { lead: true, mainText: true },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: articleLimit,
    }),
    prisma.newsRelevanceFeedback.findMany({
      select: { newsArticleId: true, companyId: true },
    }),
  ]);

  const reviewed = new Set(
    existingFeedback.map((row) => `${row.newsArticleId}:${row.companyId}`),
  );
  const pairs: Array<{
    key: string;
    company: (typeof companies)[number];
    article: (typeof articles)[number];
  }> = [];
  let round = 0;
  while (pairs.length < limit && round < Math.max(companies.length, articles.length)) {
    for (let companyOffset = 0; companyOffset < companies.length; companyOffset += 1) {
      if (pairs.length >= limit) break;
      const company = companies[companyOffset];
      const article = articles[(companyOffset + round) % articles.length];
      if (!article) continue;
      const key = `${article.id}:${company.companyId}`;
      if (reviewed.has(key) || pairs.some((pair) => pair.key === key)) continue;
      pairs.push({ key, company, article });
    }
    round += 1;
  }

  const result = {
    generatedAt: new Date().toISOString(),
    selectedPairs: pairs.length,
    selectedCompanies: new Set(pairs.map((pair) => pair.company.companyId)).size,
    selectedArticles: new Set(pairs.map((pair) => pair.article.id)).size,
    pairs: pairs.map(({ company, article }) => ({
      articleId: article.id,
      companyId: company.companyId,
      companyName: company.company.name,
      organizationNumber: company.company.orgNumber,
      industryCode: company.company.industryCode,
      petroleumExposure: {
        operatorFieldCount: company.operatorFieldCount,
        licenceCount: company.licenceCount,
        operatedProductionOe: company.operatedProductionOe,
        remainingReservesOe: company.remainingReservesOe,
        mainAreas: company.mainAreas,
      },
      source: article.source,
      publishedAt: article.publishedAt.toISOString(),
      title: article.title,
      summary: article.summary,
      lead: article.extraction?.lead ?? null,
      mainText: article.extraction?.mainText?.slice(0, 4_000) ?? null,
      url: article.url,
    })),
  };

  if (output) {
    await writeFile(output, JSON.stringify(result, null, 2), "utf8");
    console.log(`Manual macro sample written to ${output}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
