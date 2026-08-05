import "./_load-env";
import { prisma } from "@/lib/prisma";
import { processAnnualReportFiling } from "@/server/services/annual-report-financials-service";

const ORGS = process.argv.slice(2);
if (ORGS.length === 0) { console.error("usage: tsx process-new-latest.ts <org> [org...]"); process.exit(1); }

async function main() {
  for (const org of ORGS) {
    const company = await prisma.company.findUnique({ where: { orgNumber: org }, select: { id: true, name: true } });
    if (!company) { console.log(`SKIP ${org}: no company`); continue; }
    const filing = await prisma.annualReportFiling.findFirst({
      where: { companyId: company.id, status: "DISCOVERED" },
      orderBy: { fiscalYear: "desc" },
      select: { id: true, fiscalYear: true },
    });
    if (!filing) { console.log(`SKIP ${org} ${company.name}: no DISCOVERED filing`); continue; }
    const t0 = Date.now();
    try {
      const r: any = await processAnnualReportFiling(filing.id);
      const facts = await prisma.financialFact.count({ where: { filingId: filing.id } });
      const f = await prisma.annualReportFiling.findUnique({ where: { id: filing.id }, select: { status: true } });
      console.log(`OK   ${org} ${company.name.slice(0,24).padEnd(24)} FY${filing.fiscalYear} status=${f?.status} facts=${facts} published=${r?.published} ${((Date.now()-t0)/1000).toFixed(0)}s`);
    } catch (e) {
      console.log(`FAIL ${org} ${company.name.slice(0,24).padEnd(24)} FY${filing.fiscalYear} ${((Date.now()-t0)/1000).toFixed(0)}s: ${(e as Error).message.slice(0,120)}`);
    }
  }
}
main().then(()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exit(1);});
