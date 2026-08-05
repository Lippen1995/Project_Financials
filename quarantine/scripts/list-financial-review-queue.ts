import { prisma } from "@/lib/prisma";
import { listAnnualReportReviewQueue } from "@/server/services/annual-report-financials-service";
import { readListFlag, readNumberFlag } from "@/scripts/financial-script-utils";

async function main() {
  const result = await listAnnualReportReviewQueue({
    orgNumbers: readListFlag("org"),
    ruleCodes: readListFlag("rule"),
    statuses: readListFlag("status") as
      | ("PENDING_REVIEW" | "ACCEPTED" | "REJECTED" | "REPROCESS_REQUESTED" | "RESOLVED_BY_NEW_RUN")[]
      | undefined,
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
