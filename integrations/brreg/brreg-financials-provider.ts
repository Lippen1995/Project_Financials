import env from "@/lib/env";
import { NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { fetchJson } from "@/integrations/http";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { FinancialsProvider } from "@/integrations/provider-interface";

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

export class BrregFinancialsProvider implements FinancialsProvider {
  async getFinancialStatements(orgNumber: string) {
    const statements: NormalizedFinancialStatement[] = [];
    let documents: NormalizedFinancialDocument[] = [];

    try {
      const latestStatement = await fetchJson<Record<string, any>>(
        `${env.brregFinancialsBaseUrl}/${orgNumber}`,
      );
      statements.push(mapBrregFinancialStatement(latestStatement, orgNumber));
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

    return {
      statements,
      documents,
      availability: {
        available: statements.length > 0,
        sourceSystem: "BRREG",
        message:
          statements.length > 0
            ? "ProjectX viser apne regnskapstall fra Bronnoysundregistrenes Regnskapsregister for sist tilgjengelige arsregnskap."
            : "ProjectX fant ingen apne regnskapstall for virksomheten akkurat na.",
      },
    };
  }
}
