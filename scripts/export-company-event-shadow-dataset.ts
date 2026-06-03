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

  const feedbackRows = await prisma.companyEventFeedback.findMany({
    take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 500,
    orderBy: { reviewedAt: "desc" },
    select: {
      id: true,
      label: true,
      action: true,
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
  });

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
        eventId: row.event.id,
        companyId: row.event.companyId,
        title: row.event.title,
        eventType: row.event.eventType,
        label: row.label,
        action: row.action,
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

  if (output) {
    await writeFile(output, JSON.stringify(rows, null, 2), "utf8");
    console.log(`Company Event shadow dataset written to ${output}`);
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log("Company Event shadow dataset");
  console.log(`Rows: ${rows.length}`);
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
