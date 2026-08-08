import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";
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
  const ingestion = await ingestStructuredFinancialsForCompany(orgNumber);

  // The count comes from the ingest result rather than a read-back of the store. That removes
  // the last caller of the legacy published-financials reader, and reports what this run
  // actually published instead of everything the company has ever had on file — a re-run with
  // nothing new to fetch used to report the full historical count.
  return {
    orgNumber,
    companyName: company.name,
    statementsImported: ingestion.published,
    fiscalYears: ingestion.fiscalYears,
  };
}
