import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import type { NormalizedFinancialDocument, SourceMetadata } from "@/lib/types";
import { inferStringHashKey } from "@/lib/norwegian-text";
import {
  parseStructuredRegnskapResponse,
  StructuredAnnualAccounts,
} from "@/integrations/brreg/structured-regnskap";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";

export type StructuredAnnualAccountsResult = SourceMetadata & {
  status: "AVAILABLE" | "UNAVAILABLE";
  accounts: StructuredAnnualAccounts[];
  /** Set when the registry cannot serve this company (unsupported layout,
   *  nothing filed) — callers should record and move on, not retry. */
  unavailableReason: string | null;
};

type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type BrregFinancialsProviderDependencies = {
  fetch?: ProviderFetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
  timeoutMs?: number;
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
  private readonly fetchImpl: ProviderFetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly timeoutMs: number;

  constructor(dependencies: BrregFinancialsProviderDependencies = {}) {
    this.fetchImpl = dependencies.fetch ?? fetch;
    this.sleep =
      dependencies.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = dependencies.now ?? (() => new Date());
    this.random = dependencies.random ?? Math.random;
    this.timeoutMs = dependencies.timeoutMs ?? 8_000;
  }

  private retryDelay(attempt: number, retryAfter: string | null = null) {
    const retryAfterSeconds = Number(retryAfter);
    const backoffMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 2000 * 2 ** (attempt - 1) + Math.floor(this.random() * 1000);
    return Math.min(backoffMs, 60_000);
  }

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
    const normalizedOrgNumber = norwegianOrganizationNumberSchema.parse(orgNumber);
    const url = `${env.brregFinancialsBaseUrl}/${normalizedOrgNumber}`;
    const maxAttempts = 4;
    let lastStatus: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (attempt === maxAttempts) {
          throw new Error("Failed to fetch structured annual accounts: network");
        }
        await this.sleep(this.retryDelay(attempt));
        continue;
      }

      if (response.ok) {
        const fetchedAt = this.now();
        const accounts = parseStructuredRegnskapResponse(await response.json(), {
          orgNumber: normalizedOrgNumber,
          fetchedAt,
          normalizedAt: this.now(),
        });
        return {
          status: accounts.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
          accounts,
          unavailableReason:
            accounts.length > 0 ? null : "Brreg returnerte ingen regnskapsoppføringer.",
          sourceSystem: "BRREG",
          sourceEntityType: "structuredAnnualAccountsResponse",
          sourceId: normalizedOrgNumber,
          fetchedAt,
          normalizedAt: this.now(),
          rawPayload: {
            httpStatus: response.status,
            accountCount: accounts.length,
          },
        };
      }

      if (response.status === 404 || response.status === 410) {
        const checkedAt = this.now();
        return {
          status: "UNAVAILABLE",
          accounts: [],
          unavailableReason: `HTTP ${response.status}: ingen regnskap`,
          sourceSystem: "BRREG",
          sourceEntityType: "structuredAnnualAccountsResponse",
          sourceId: normalizedOrgNumber,
          fetchedAt: checkedAt,
          normalizedAt: checkedAt,
          rawPayload: { httpStatus: response.status },
        };
      }

      if (response.status === 500) {
        // The registry answers 500 both for unsupported layouts (permanent)
        // and transient faults; the body distinguishes them.
        const body = await response.text();
        if (/ikke (er )?st\S*ttet/i.test(body)) {
          const checkedAt = this.now();
          return {
            status: "UNAVAILABLE",
            accounts: [],
            unavailableReason: "Oppstillingsplan ikke støttet",
            sourceSystem: "BRREG",
            sourceEntityType: "structuredAnnualAccountsResponse",
            sourceId: normalizedOrgNumber,
            fetchedAt: checkedAt,
            normalizedAt: checkedAt,
            rawPayload: {
              httpStatus: response.status,
              reasonCode: "UNSUPPORTED_LAYOUT",
            },
          };
        }
        lastStatus = 500;
      } else {
        lastStatus = response.status;
        if (response.status !== 429 && response.status < 500) {
          break;
        }
      }

      if (attempt === maxAttempts) break;
      await this.sleep(this.retryDelay(attempt, response.headers.get("retry-after")));
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
