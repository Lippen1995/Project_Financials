import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { NormalizedFinancialDocument } from "@/lib/types";
import { inferStringHashKey } from "@/integrations/brreg/annual-report-financials/text";

type BrregFinancialDocumentYear = string;

function mapDocumentYears(years: BrregFinancialDocumentYear[], orgNumber: string): NormalizedFinancialDocument[] {
  const now = new Date();

  return years
    .map((year) => ({
      sourceSystem: "BRREG",
      sourceEntityType: "annualReportDocument",
      sourceId: `${orgNumber}-${year}`,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: { year },
      year: Number(year),
      files: [
        {
          type: "aarsregnskap",
          id: year,
          label: "Offisiell kopi av årsregnskap",
          url: `${env.brregFinancialsBaseUrl}/aarsregnskap/kopi/${orgNumber}/${year}`,
        },
      ],
    }))
    .sort((left, right) => right.year - left.year);
}

export class BrregFinancialsProvider {
  async listAnnualReportDocuments(orgNumber: string) {
    const years = await fetchJson<string[]>(
      `${env.brregFinancialsBaseUrl}/aarsregnskap/kopi/${orgNumber}/aar`,
    );

    return mapDocumentYears(years, orgNumber);
  }

  async listAnnualReportFilings(orgNumber: string) {
    const discoveredAt = new Date();
    const documents = await this.listAnnualReportDocuments(orgNumber);

    return documents.map((document) => ({
      fiscalYear: document.year,
      sourceSystem: "BRREG",
      sourceUrl:
        document.files.find((file) => file.type === "aarsregnskap" && file.url)?.url ??
        `${env.brregFinancialsBaseUrl}/aarsregnskap/kopi/${orgNumber}/${document.year}`,
      sourceDocumentType: "ANNUAL_REPORT_PDF",
      sourceIdempotencyKey: inferStringHashKey(["BRREG", orgNumber, document.year, "annual-report"]),
      discoveredAt,
      document,
    }));
  }

  async downloadAnnualReportPdf(sourceUrl: string) {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "application/pdf,application/octet-stream",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to download annual report PDF: ${response.status}`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "application/pdf",
    };
  }
}
