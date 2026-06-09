import { writeFile } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import {
  buildCompanyEventShadowFeatureVector,
  scoreCompanyEventShadowModel,
} from "@/server/news/company-event-shadow-model";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const limitArg = argValue("limit");
  const output = argValue("output");
  const asJson = process.argv.includes("--json") || Boolean(output);
  const limit = limitArg ? Number(limitArg) : 500;

  const [feedbackRows, exposureFeedbackRows] = await Promise.all([
    prisma.companyEventFeedback.findMany({
    take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 500,
    orderBy: { reviewedAt: "desc" },
    select: {
      id: true,
      label: true,
      action: true,
      previousValue: true,
      correctedValue: true,
      reviewedAt: true,
      event: {
        select: {
          id: true,
          companyId: true,
          title: true,
          eventType: true,
          investorValueScore: true,
          confidenceScore: true,
          noveltyScore: true,
          metadata: true,
          evidence: {
            select: { id: true },
          },
          exposures: {
            where: { active: true },
            orderBy: [{ exposureScore: "desc" }, { confidenceScore: "desc" }],
            take: 1,
            select: {
              exposureType: true,
              exposureScore: true,
              confidenceScore: true,
            },
          },
        },
      },
    },
    }),
    prisma.companyEventExposureFeedback.findMany({
      take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 500,
      orderBy: { reviewedAt: "desc" },
      select: {
        id: true,
        label: true,
        relevanceScore: true,
        investorValueScore: true,
        previousValue: true,
        correctedValue: true,
        reviewedAt: true,
        exposure: {
          select: {
            id: true,
            eventId: true,
            companyId: true,
            exposureType: true,
            exposureScore: true,
            confidenceScore: true,
            metadata: true,
            event: {
              select: {
                companyId: true,
                title: true,
                eventType: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const rows = feedbackRows
    .filter((row) => row.event.exposures[0])
    .map((row) => {
      const topExposure = row.event.exposures[0]!;
      const features = buildCompanyEventShadowFeatureVector({
        investorValueScore: row.event.investorValueScore,
        confidenceScore: row.event.confidenceScore,
        noveltyScore: row.event.noveltyScore,
        metadata: row.event.metadata,
        evidenceCount: row.event.evidence.length,
        exposureType: topExposure.exposureType,
        exposureScore: topExposure.exposureScore,
        exposureConfidence: topExposure.confidenceScore,
      });
      const shadow = scoreCompanyEventShadowModel(features);

      return {
        feedbackId: row.id,
        targetKind: "event",
        eventId: row.event.id,
        companyId: row.event.companyId,
        title: row.event.title,
        eventType: row.event.eventType,
        label: row.label,
        action: row.action,
        previousValue: row.previousValue,
        correctedValue: row.correctedValue,
        reviewedAt: row.reviewedAt.toISOString(),
        heuristicScore: row.event.investorValueScore,
        shadowProbability: shadow.probability,
        shadowBucket: shadow.bucket,
        exposureType: topExposure.exposureType,
        exposureScore: topExposure.exposureScore,
        exposureConfidence: topExposure.confidenceScore,
        features,
      };
    });

  const exposureRows = exposureFeedbackRows.map((row) => ({
    feedbackId: row.id,
    targetKind: "exposure",
    exposureId: row.exposure.id,
    eventId: row.exposure.eventId,
    sourceCompanyId: row.exposure.event.companyId,
    targetCompanyId: row.exposure.companyId,
    title: row.exposure.event.title,
    eventType: row.exposure.event.eventType,
    label: row.label,
    reviewedAt: row.reviewedAt.toISOString(),
    relevanceScore: row.relevanceScore,
    investorValueScore: row.investorValueScore,
    previousValue: row.previousValue,
    correctedValue: row.correctedValue,
    exposureType: row.exposure.exposureType,
    exposureScore: row.exposure.exposureScore,
    exposureConfidence: row.exposure.confidenceScore,
    exposureMetadata: row.exposure.metadata,
  }));
  const dataset = [...rows, ...exposureRows];

  if (output) {
    await writeFile(output, JSON.stringify(dataset, null, 2), "utf8");
    console.log(`Company Event shadow dataset written to ${output}`);
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(dataset, null, 2));
    return;
  }

  console.log("Company Event shadow dataset");
  console.log(`Rows: ${dataset.length}`);
  console.log("");
  for (const row of rows.slice(0, 10)) {
    console.log(
      `- ${row.label} | heuristic ${Math.round(row.heuristicScore)} | shadow ${row.shadowProbability} | ${row.title}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
