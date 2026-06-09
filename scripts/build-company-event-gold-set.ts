import { writeFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TARGET_PER_STRATUM = 100;

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const output = argValue("output");
  const [eventFeedback, exposureFeedback, articleFeedback] = await Promise.all([
    prisma.companyEventFeedback.findMany({
      where: { action: "rated" },
      orderBy: { reviewedAt: "desc" },
      select: {
        id: true,
        label: true,
        correctedValue: true,
        notes: true,
        reviewedAt: true,
        event: {
          select: {
            id: true,
            companyId: true,
            eventType: true,
            title: true,
            investorValueScore: true,
            company: { select: { name: true, orgNumber: true } },
            evidence: {
              take: 1,
              select: {
                document: {
                  select: {
                    sourceId: true,
                    canonicalUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.companyEventExposureFeedback.findMany({
      orderBy: { reviewedAt: "desc" },
      select: {
        id: true,
        label: true,
        relevanceScore: true,
        investorValueScore: true,
        correctedValue: true,
        notes: true,
        reviewedAt: true,
        exposure: {
          select: {
            id: true,
            exposureType: true,
            event: {
              select: {
                id: true,
                eventType: true,
                title: true,
                companyId: true,
              },
            },
            company: {
              select: { id: true, name: true, orgNumber: true },
            },
          },
        },
      },
    }),
    prisma.newsRelevanceFeedback.findMany({
      where: {
        relevanceScore: { not: null },
        investorValueScore: { not: null },
      },
      orderBy: { reviewedAt: "desc" },
      select: {
        id: true,
        label: true,
        relevanceScore: true,
        investorValueScore: true,
        issueTags: true,
        notes: true,
        reviewedAt: true,
        company: {
          select: { id: true, name: true, orgNumber: true },
        },
        newsArticle: {
          select: {
            id: true,
            source: true,
            title: true,
            url: true,
          },
        },
      },
    }),
  ]);

  const direct = eventFeedback.map((item) => {
    const corrected = asObject(item.correctedValue);
    return {
      stratum: "direct_company_news",
      feedbackId: item.id,
      eventId: item.event.id,
      sourceCompanyId: item.event.companyId,
      targetCompanyId: item.event.companyId,
      companyName: item.event.company.name,
      orgNumber: item.event.company.orgNumber,
      eventType: item.event.eventType,
      title: item.event.title,
      sourceId: item.event.evidence[0]?.document.sourceId ?? null,
      canonicalUrl: item.event.evidence[0]?.document.canonicalUrl ?? null,
      entityMatchCorrect: item.label !== "NOT_RELEVANT",
      targetExposureCorrect: true,
      eventTypeCorrect: !stringArray(corrected.issueTags).includes("wrong_event_type"),
      relevanceScore: corrected.relevanceScore ?? null,
      investorValueScore: corrected.investorValueScore ?? null,
      expectedEventType: corrected.expectedEventType ?? item.event.eventType,
      duplicateStory: stringArray(corrected.issueTags).includes("possible_duplicate"),
      routineDisclosure: [
        "reporting_invitation",
        "routine_insider",
        "dividend_ex_date",
        "governance_proxy",
        "employee_share_plan",
      ].includes(String(corrected.reasonCode ?? "")),
      notes: item.notes,
      reviewedAt: item.reviewedAt.toISOString(),
    };
  });

  const indirect = exposureFeedback.map((item) => {
    const corrected = asObject(item.correctedValue);
    const tags = stringArray(corrected.issueTags);
    const stratum = tags.includes("wrong_source_company")
      ? "identity_collision_negative"
      : tags.includes("group_read_across")
        ? "group_project_read_across"
        : item.exposure.exposureType === "petroleum"
          ? "industry_regulatory_news"
          : "macro_commodity_news";
    return {
      stratum,
      feedbackId: item.id,
      eventId: item.exposure.event.id,
      exposureId: item.exposure.id,
      sourceCompanyId: item.exposure.event.companyId,
      targetCompanyId: item.exposure.company.id,
      companyName: item.exposure.company.name,
      orgNumber: item.exposure.company.orgNumber,
      eventType: item.exposure.event.eventType,
      title: item.exposure.event.title,
      entityMatchCorrect: !tags.includes("wrong_source_company"),
      targetExposureCorrect: item.relevanceScore >= 70,
      eventTypeCorrect: !tags.includes("wrong_event_type"),
      relevanceScore: item.relevanceScore,
      investorValueScore: item.investorValueScore,
      duplicateStory: tags.includes("duplicate_exposure"),
      routineDisclosure: false,
      issueTags: tags,
      notes: item.notes,
      reviewedAt: item.reviewedAt.toISOString(),
    };
  });

  const official = articleFeedback.map((item) => ({
    stratum: item.issueTags.includes("wrong_legal_entity") ||
      item.issueTags.includes("identity_collision")
      ? "identity_collision_negative"
      : item.newsArticle.source.startsWith("eia-") ||
          item.newsArticle.source.startsWith("iea-")
        ? "macro_commodity_news"
        : "industry_regulatory_news",
    feedbackId: item.id,
    eventId: item.newsArticle.id,
    sourceCompanyId: null,
    targetCompanyId: item.company.id,
    companyName: item.company.name,
    orgNumber: item.company.orgNumber,
    eventType: "official_context_article",
    title: item.newsArticle.title,
    sourceId: item.newsArticle.source,
    canonicalUrl: item.newsArticle.url,
    entityMatchCorrect: !item.issueTags.includes("wrong_legal_entity"),
    targetExposureCorrect: (item.relevanceScore ?? 0) >= 70,
    eventTypeCorrect: true,
    relevanceScore: item.relevanceScore,
    investorValueScore: item.investorValueScore,
    duplicateStory: item.issueTags.includes("possible_duplicate"),
    routineDisclosure: false,
    issueTags: item.issueTags,
    notes: item.notes,
    reviewedAt: item.reviewedAt.toISOString(),
  }));

  const rows = [...direct, ...indirect, ...official];
  const strata = [
    "direct_company_news",
    "macro_commodity_news",
    "industry_regulatory_news",
    "group_project_read_across",
    "identity_collision_negative",
  ].map((stratum) => {
    const available = rows.filter((row) => row.stratum === stratum);
    return {
      stratum,
      target: TARGET_PER_STRATUM,
      reviewed: available.length,
      remaining: Math.max(0, TARGET_PER_STRATUM - available.length),
      precision:
        available.length === 0
          ? null
          : Number(
              (
                available.filter((row) => row.targetExposureCorrect).length /
                available.length
              ).toFixed(3),
            ),
    };
  });
  const result = {
    generatedAt: new Date().toISOString(),
    methodology: "manual-feedback-gold-set-v1",
    targetCases: TARGET_PER_STRATUM * strata.length,
    reviewedCases: rows.length,
    strata,
    rows,
  };

  if (output) {
    await writeFile(output, JSON.stringify(result, null, 2), "utf8");
    console.log(`Gold set written to ${output}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
