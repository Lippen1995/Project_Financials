import "./_load-env";
import { reprocessAnnualReportFilingById } from "@/server/services/annual-report-financials-service";
import { prisma } from "@/lib/prisma";
const IDS = [
  "cmpf7rzra000bvmusjq2317ms", // CANICA 2021
  "cmpf7rzqi0007vmusbke18kad", // CANICA 2023
  "cmobtujsq000fvmvo9l9qppa8", // PROFF 2017
  "cmobtujsb000bvmvoasemqhzr", // PROFF 2019
  "cmobtujs10009vmvogmdoowt3", // PROFF 2020
  "cmobtujrs0007vmvos2b14yat", // PROFF 2021
  "cmobtujrj0005vmvopubneto4", // PROFF 2022
  "cmobtujr90003vmvorzjg483p", // PROFF 2023
];
async function main() {
  for (const id of IDS) {
    try {
      const r = await reprocessAnnualReportFilingById(id, { note: "Reprocess with comparative-year + alias-bootstrap model" });
      console.log(`OK ${id}: published=${(r as any).published} skipped=${(r as any).skipped ?? false}`);
    } catch (e) {
      console.log(`FAIL ${id}: ${(e as Error).message}`);
    }
  }
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
