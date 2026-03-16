import env from "@/lib/env";
import { NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { fetchJson } from "@/integrations/http";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { extractHistoricalStatementsFromAnnualReports } from "@/integrations/brreg/pdf-financial-history";
import { FinancialsProvider } from "@/integrations/provider-interface";
import { readFinancialCache, writeFinancialCache } from "@/server/persistence/financial-cache";

type BrregFinancialDocumentYear = string;

function mapDocumentYears(years: BrregFinancialDocumentYear[], orgNumber: string): NormalizedFinancialDocument[] {
  const now = new Date();

  return years
    .map((year) => ({
      sourceSystem: "BRREG",
      sourceEntityType: "financialDocument",
      sourceId: `${orgNumber}-${year}`,
      fetchedAt: now,
      normalizedAt: now,
      rawPayload: { year },
      year: Number(year),
      files: [
        {
          type: "aarsregnskap",
          id: year,
          label: "Kopi av arsregnskap",
        },
      ],
    }))
    .sort((left, right) => right.year - left.year);
}

function deepMerge(target: Record<string, any>, source: Record<string, any>) {
  const output = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === "object" &&
      !Array.isArray(output[key])
    ) {
      output[key] = deepMerge(output[key], value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

export class BrregFinancialsProvider implements FinancialsProvider {
  async getFinancialStatements(orgNumber: string) {
    const cached = await readFinancialCache(orgNumber);
    if (cached) {
      return {
        statements: cached.statements,
        documents: cached.documents,
        availability: cached.availability,
      };
    }

    const statements = new Map<number, NormalizedFinancialStatement>();
    let documents: NormalizedFinancialDocument[] = [];
    let latestApiPayload: Record<string, any> | null = null;

    try {
      const latestResponse = await fetchJson<Record<string, any> | Record<string, any>[]>(
        `${env.brregFinancialsBaseUrl}/${orgNumber}`,
      );
      const latestStatement = Array.isArray(latestResponse) ? latestResponse[0] : latestResponse;

      if (latestStatement) {
        latestApiPayload = latestStatement;
        const mapped = mapBrregFinancialStatement(latestStatement, orgNumber);
        statements.set(mapped.fiscalYear, mapped);
      }
    } catch {
      // Keep an honest empty state if the open regnskap endpoint fails.
    }

    try {
      const years = await fetchJson<string[]>(
        `${env.brregFinancialsBaseUrl}/aarsregnskap/kopi/${orgNumber}/aar`,
      );
      documents = mapDocumentYears(years, orgNumber);
    } catch {
      documents = [];
    }

    if (documents.length > 1) {
      try {
        const historicalStatements = await extractHistoricalStatementsFromAnnualReports(
          orgNumber,
          documents.map((document) => document.year),
        );

        for (const statement of historicalStatements) {
          statements.set(statement.fiscalYear, statement);
        }
      } catch {
        // Keep latest API statement if OCR-based history extraction fails.
      }
    }

    if (latestApiPayload) {
      const latestMapped = mapBrregFinancialStatement(latestApiPayload, orgNumber);
      const existing = statements.get(latestMapped.fiscalYear);

      if (existing) {
        statements.set(latestMapped.fiscalYear, {
          ...existing,
          revenue: latestMapped.revenue ?? existing.revenue,
          operatingProfit: latestMapped.operatingProfit ?? existing.operatingProfit,
          netIncome: latestMapped.netIncome ?? existing.netIncome,
          equity: latestMapped.equity ?? existing.equity,
          assets: latestMapped.assets ?? existing.assets,
          rawPayload: deepMerge(
            (existing.rawPayload ?? {}) as Record<string, any>,
            latestApiPayload,
          ),
        });
      } else {
        statements.set(latestMapped.fiscalYear, latestMapped);
      }
    }

    const statementList = Array.from(statements.values()).sort(
      (left, right) => right.fiscalYear - left.fiscalYear,
    );

    const result = {
      statements: statementList,
      documents,
      availability: {
        available: statementList.length > 0,
        sourceSystem: "BRREG",
        message:
          statementList.length > 1
            ? "ProjectX viser apne regnskapstall fra Bronnoysundregistrenes Regnskapsregister og historikk parsret fra offisielle Brreg-PDF-kopier av arsregnskap."
            : statementList.length > 0
              ? "ProjectX viser apne regnskapstall fra Bronnoysundregistrenes Regnskapsregister for sist tilgjengelige arsregnskap."
            : "ProjectX fant ingen apne regnskapstall for virksomheten akkurat na.",
      },
    };

    try {
      await writeFinancialCache(orgNumber, result);
    } catch {
      // Ignore local cache write failures and still return live data.
    }

    return result;
  }
}
