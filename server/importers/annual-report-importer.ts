import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";
import { getPublishedAnnualReportFinancials } from "@/server/financials/published-financials-reader";
import { ingestStructuredFinancialsForCompany } from "@/server/services/structured-financials-service";

const companyProvider = new BrregCompanyProvider();

/**
 * Imports a company and its official financials.
 *
 * Previously called syncCompanyAnnualReportFinancials, which discovered,
 * downloaded and OCR-extracted annual report PDFs. It now uses the structured
 * Regnskapsregisteret feed, in line with the go-live plan taking OCR out of the
 * production data flow. This was the last path by which a retained npm script
 * (backfill:distress-financials) could still start the OCR pipeline.
 *
 * This is a worker, not a request path, so calling Brreg directly is correct
 * here — GL-A01 constrains what a user request may do, not a batch job.
 */
export async function importAnnualReportsForCompany(orgNumber: string) {
  const company = await companyProvider.getCompany(orgNumber);
  if (!company) {
    throw new Error(`Fant ikke virksomhet ${orgNumber} hos Brreg.`);
  }

  await upsertCompanySnapshot(company);
  await ingestStructuredFinancialsForCompany(orgNumber);
  const published = await getPublishedAnnualReportFinancials(orgNumber);

  return {
    orgNumber,
    companyName: company.name,
    statementsImported: published.statements.length,
    documentYears: published.documents.map((document) => document.year),
  };
}
