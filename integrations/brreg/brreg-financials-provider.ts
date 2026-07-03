import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { NormalizedFinancialDocument } from "@/lib/types";
import { inferStringHashKey } from "@/integrations/brreg/annual-report-financials/text";
import {
  mapStructuredRegnskapResponse,
  StructuredAnnualAccounts,
} from "@/integrations/brreg/structured-regnskap";

export type StructuredAnnualAccountsResult = {
  accounts: StructuredAnnualAccounts[];
  /** Set when the registry cannot serve this company (unsupported layout,
   *  nothing filed) — callers should record and move on, not retry. */
  unavailableReason: string | null;
};

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
      sourceDiscoveryKey: inferStringHashKey(["BRREG", orgNumber, document.year, "annual-report"]),
      sourceIdempotencyKey: inferStringHashKey(["BRREG", orgNumber, document.year, "annual-report", "pending"]),
      discoveredAt,
      document,
    }));
  }

  /**
   * Latest filed annual accounts as structured JSON (exact whole-NOK values).
   * Returns `unavailableReason` instead of throwing for the registry's known
   * non-retryable cases: HTTP 404/410 (nothing filed) and the HTTP 500 the API
   * uses for unsupported oppstillingsplan variants (banks/insurers).
   */
  async fetchStructuredAnnualAccounts(orgNumber: string): Promise<StructuredAnnualAccountsResult> {
    const url = `${env.brregFinancialsBaseUrl}/${orgNumber}`;
    const maxAttempts = 4;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (response.ok) {
        return {
          accounts: mapStructuredRegnskapResponse(await response.json()),
          unavailableReason: null,
        };
      }

      if (response.status === 404 || response.status === 410) {
        return { accounts: [], unavailableReason: `HTTP ${response.status}: ingen regnskap` };
      }

      if (response.status === 500) {
        // The registry answers 500 both for unsupported layouts (permanent)
        // and transient faults; the body distinguishes them.
        const body = await response.text();
        if (/ikke (er )?st\S*ttet/i.test(body)) {
          return { accounts: [], unavailableReason: "Oppstillingsplan ikke støttet" };
        }
        lastStatus = 500;
      } else {
        lastStatus = response.status;
        if (response.status !== 429 && response.status < 500) {
          break;
        }
      }

      if (attempt === maxAttempts) break;
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const backoffMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 60_000)));
    }

    throw new Error(`Failed to fetch structured annual accounts: ${lastStatus}`);
  }

  async downloadAnnualReportPdf(sourceUrl: string) {
    const maxAttempts = 4;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(sourceUrl, {
        headers: {
          Accept: "application/pdf,application/octet-stream",
        },
        cache: "no-store",
      });

      if (response.ok) {
        return {
          buffer: Buffer.from(await response.arrayBuffer()),
          mimeType: response.headers.get("content-type") ?? "application/pdf",
        };
      }

      lastStatus = response.status;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts) {
        break;
      }

      // Respekter Retry-After ved rate limiting; ellers eksponentiell backoff med jitter.
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const backoffMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 60_000)));
    }

    throw new Error(`Failed to download annual report PDF: ${lastStatus}`);
  }
}
