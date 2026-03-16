import { prisma } from "@/lib/prisma";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";

const companyProvider = new BrregCompanyProvider();
const financialsProvider = new BrregFinancialsProvider();

export async function importAnnualReportsForCompany(orgNumber: string) {
  const company = await companyProvider.getCompany(orgNumber);
  if (!company) {
    throw new Error(`Fant ikke virksomhet ${orgNumber} hos Brreg.`);
  }

  await upsertCompanySnapshot(company);

  const financials = await financialsProvider.getFinancialStatements(orgNumber);

  const dbCompany = await prisma.company.findUnique({
    where: { orgNumber },
  });

  if (!dbCompany) {
    throw new Error(`Virksomhet ${orgNumber} ble ikke lagret i databasen.`);
  }

  await prisma.financialStatement.deleteMany({
    where: { companyId: dbCompany.id },
  });

  for (const statement of financials.statements) {
    await prisma.financialStatement.create({
      data: {
        companyId: dbCompany.id,
        fiscalYear: statement.fiscalYear,
        currency: statement.currency,
        revenue: statement.revenue,
        operatingProfit: statement.operatingProfit,
        netIncome: statement.netIncome,
        equity: statement.equity,
        assets: statement.assets,
        sourceSystem: statement.sourceSystem,
        sourceEntityType: statement.sourceEntityType,
        sourceId: statement.sourceId,
        fetchedAt: statement.fetchedAt,
        normalizedAt: statement.normalizedAt,
        rawPayload: statement.rawPayload as never,
      },
    });
  }

  return {
    orgNumber,
    companyName: company.name,
    statementsImported: financials.statements.length,
    documentYears: financials.documents.map((document) => document.year),
  };
}
