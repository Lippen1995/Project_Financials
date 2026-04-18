import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";
import {
  getPublishedAnnualReportFinancials,
  syncCompanyAnnualReportFinancials,
} from "@/server/services/annual-report-financials-service";

const companyProvider = new BrregCompanyProvider();

export async function importAnnualReportsForCompany(orgNumber: string) {
  const company = await companyProvider.getCompany(orgNumber);
  if (!company) {
    throw new Error(`Fant ikke virksomhet ${orgNumber} hos Brreg.`);
  }

  await upsertCompanySnapshot(company);
  await syncCompanyAnnualReportFinancials(orgNumber);
  const published = await getPublishedAnnualReportFinancials(orgNumber);

  return {
    orgNumber,
    companyName: company.name,
    statementsImported: published.statements.length,
    documentYears: published.documents.map((document) => document.year),
  };
}
