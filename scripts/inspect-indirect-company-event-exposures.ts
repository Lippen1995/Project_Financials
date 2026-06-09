import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const exposures = await prisma.companyEventExposure.findMany({
    where: {
      exposureType: { not: "direct" },
      event: { status: "ACTIVE" },
    },
    include: {
      company: {
        select: { id: true, name: true, orgNumber: true },
      },
      event: {
        include: {
          company: {
            select: { id: true, name: true, orgNumber: true },
          },
          evidence: {
            include: {
              document: {
                include: {
                  source: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { relevanceScore: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: [
      { exposureScore: "desc" },
      { event: { lastSeen: "desc" } },
    ],
  });

  console.log(
    JSON.stringify(
      exposures.map((exposure) => ({
        exposureId: exposure.id,
        targetCompanyId: exposure.companyId,
        targetCompany: exposure.company.name,
        targetOrgNumber: exposure.company.orgNumber,
        sourceCompanyId: exposure.event.companyId,
        sourceCompany: exposure.event.company.name,
        sourceOrgNumber: exposure.event.company.orgNumber,
        eventId: exposure.eventId,
        eventType: exposure.event.eventType,
        title: exposure.event.title,
        summary: exposure.event.summary,
        eventInvestorValueScore: exposure.event.investorValueScore,
        exposureType: exposure.exposureType,
        exposureScore: exposure.exposureScore,
        confidenceScore: exposure.confidenceScore,
        rationale: exposure.rationale,
        sourceId: exposure.event.evidence[0]?.document.source.id ?? null,
        sourceName: exposure.event.evidence[0]?.document.source.name ?? null,
        sourceUrl: exposure.event.evidence[0]?.document.canonicalUrl ?? null,
      })),
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
