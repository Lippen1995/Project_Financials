import { prisma } from "@/lib/prisma";
import { listAnnualReportReviewQueue } from "@/server/services/annual-report-financials-service";
import { readFlag, readListFlag, readNumberFlag } from "@/scripts/financial-script-utils";

async function main() {
  const ruleCode = readFlag("rule");
  if (!ruleCode) {
    throw new Error("Bruk --rule=RULE_CODE for å filtrere review-køen.");
  }

  const result = await listAnnualReportReviewQueue({
    orgNumbers: readListFlag("org"),
    ruleCodes: [ruleCode],
    statuses: ["PENDING_REVIEW", "REPROCESS_REQUESTED"],
    limit: readNumberFlag("limit"),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
