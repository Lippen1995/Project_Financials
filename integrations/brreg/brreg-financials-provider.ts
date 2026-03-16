import env from "@/lib/env";
import { NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { fetchJson } from "@/integrations/http";
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

function normalizeOperatingCostBreakdown(statement: NormalizedFinancialStatement) {
  const payload = (statement.rawPayload ?? {}) as Record<string, any>;
  const resultat = payload.resultatregnskapResultat;
  const driftsresultat = resultat?.driftsresultat;
  const driftsinntekter = driftsresultat?.driftsinntekter;
  const driftskostnad = driftsresultat?.driftskostnad;
  const finansresultat = resultat?.finansresultat;

  if (!driftskostnad || !driftsresultat) {
    return statement;
  }

  const salgsinntekter = Number(driftsinntekter?.salgsinntekter);
  let sumDriftsinntekter = Number(driftsinntekter?.sumDriftsinntekter);
  let sumDriftskostnad = Number(driftskostnad.sumDriftskostnad);
  const varekostnad = Number(driftskostnad.varekostnad);
  const annenDriftskostnad = Number(driftskostnad.annenDriftskostnad);
  let operatingProfit = Number(driftsresultat.driftsresultat);

  if (!Number.isFinite(sumDriftsinntekter) && Number.isFinite(salgsinntekter)) {
    sumDriftsinntekter = salgsinntekter;
    driftsinntekter.sumDriftsinntekter = salgsinntekter;
  }

  if (
    !Number.isFinite(sumDriftskostnad) &&
    Number.isFinite(sumDriftsinntekter) &&
    Number.isFinite(operatingProfit)
  ) {
    sumDriftskostnad = sumDriftsinntekter - operatingProfit;
    driftskostnad.sumDriftskostnad = sumDriftskostnad;
  }

  const sumFinansinntekter = Number(finansresultat?.finansinntekt?.sumFinansinntekter);
  const sumFinanskostnad = Number(finansresultat?.finanskostnad?.sumFinanskostnad);

  if (Number.isFinite(sumFinansinntekter) && Number.isFinite(sumFinanskostnad)) {
    finansresultat.nettoFinans = sumFinansinntekter - sumFinanskostnad;
  }

  const nettoFinans = Number(finansresultat?.nettoFinans);
  if (
    Number.isFinite(sumDriftskostnad) &&
    Number.isFinite(varekostnad) &&
    Number.isFinite(annenDriftskostnad)
  ) {
    const reconciledLoennskostnad = sumDriftskostnad - varekostnad - annenDriftskostnad;
    if (reconciledLoennskostnad >= 0) {
      driftskostnad.loennskostnad = reconciledLoennskostnad;
    }
  }

  if (Number.isFinite(sumDriftsinntekter) && Number.isFinite(sumDriftskostnad)) {
    operatingProfit = sumDriftsinntekter - sumDriftskostnad;
    driftsresultat.driftsresultat = operatingProfit;
  }

  const normalizedOperatingProfit = Number(driftsresultat.driftsresultat);

  if (Number.isFinite(normalizedOperatingProfit) && Number.isFinite(nettoFinans)) {
    resultat.ordinaertResultatFoerSkattekostnad = normalizedOperatingProfit + nettoFinans;
  }

  return {
    ...statement,
    operatingProfit:
      typeof driftsresultat.driftsresultat === "number"
        ? driftsresultat.driftsresultat
        : statement.operatingProfit,
    rawPayload: payload,
  };
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

    const statementList = Array.from(statements.values())
      .map((statement) => normalizeOperatingCostBreakdown(statement))
      .sort((left, right) => right.fiscalYear - left.fiscalYear);

    const result = {
      statements: statementList,
      documents,
      availability: {
        available: statementList.length > 0,
        sourceSystem: "BRREG",
        message:
          statementList.length > 1
            ? "ProjectX viser regnskapstall parsret fra offisielle Brreg-PDF-kopier av arsregnskap."
            : statementList.length > 0
              ? "ProjectX viser regnskapstall parsret fra offisiell Brreg-PDF for sist tilgjengelige arsregnskap."
            : "ProjectX fant ingen regnskapstall i tilgjengelige Brreg-PDF-er for virksomheten akkurat na.",
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
