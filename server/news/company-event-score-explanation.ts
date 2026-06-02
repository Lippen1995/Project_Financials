import type { InvestorValueScoreResult } from "@/server/news/company-event-scoring";

export function buildScoreExplanation(input: {
  eventType: string;
  direction: string;
  confidenceLevel: string;
  components: InvestorValueScoreResult;
  sourceId?: string | null;
  sourceType?: string | null;
}) {
  const positiveDrivers = [
    ["Selskapstreff", input.components.entityConfidence],
    ["Materialitet", input.components.materialityScore],
    ["Kildekvalitet", input.components.sourceCredibilityScore],
    ["Finansiell effekt", input.components.financialImpactScore],
    ["Strategisk effekt", input.components.strategicImpactScore],
    ["Risiko", input.components.riskImpactScore],
    ["Nyhetsverdi", input.components.noveltyScore],
    ["Tidsnærhet", input.components.timelinessScore],
    ["Evidensstyrke", input.components.evidenceStrengthScore],
  ]
    .filter(([, value]) => typeof value === "number")
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4)
    .map(([label, value]) => `${label}: ${Math.round((value as number) * 100)}`);

  const penalties = [
    input.components.lowSignalPenalty ? `Lavsignal-straff: ${Math.round(input.components.lowSignalPenalty * 100)}` : null,
    input.components.duplicatePenalty ? `Duplikat-straff: ${Math.round(input.components.duplicatePenalty * 100)}` : null,
  ].filter(Boolean);

  return {
    eventType: input.eventType,
    direction: input.direction,
    confidenceLevel: input.confidenceLevel,
    sourceId: input.sourceId ?? null,
    sourceType: input.sourceType ?? null,
    investorValueScore: input.components.investorValueScore,
    topDrivers: positiveDrivers,
    penalties,
    formulaVersion: "investor-value-v1",
  };
}
