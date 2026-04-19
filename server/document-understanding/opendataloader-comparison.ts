import {
  OpenDataLoaderComparisonSummary,
  OpenDataLoaderPipelineSnapshot,
} from "@/server/document-understanding/opendataloader-types";

function mapClassificationsByPage(snapshot: OpenDataLoaderPipelineSnapshot) {
  return new Map(snapshot.classifications.map((classification) => [classification.pageNumber, classification]));
}

function mapFactsByMetric(snapshot: OpenDataLoaderPipelineSnapshot) {
  return new Map(snapshot.selectedFacts.map((fact) => [fact.metricKey, fact]));
}

export function buildOpenDataLoaderComparisonSummary(input: {
  primary: OpenDataLoaderPipelineSnapshot;
  shadow: OpenDataLoaderPipelineSnapshot;
}) {
  const primaryByPage = mapClassificationsByPage(input.primary);
  const shadowByPage = mapClassificationsByPage(input.shadow);
  const pageNumbers = Array.from(
    new Set([...primaryByPage.keys(), ...shadowByPage.keys()]),
  ).sort((left, right) => left - right);

  const classificationDifferences = pageNumbers
    .map((pageNumber) => ({
      pageNumber,
      primaryType: primaryByPage.get(pageNumber)?.type ?? null,
      shadowType: shadowByPage.get(pageNumber)?.type ?? null,
    }))
    .filter((item) => item.primaryType !== item.shadowType);

  const unitScaleDifferences = pageNumbers
    .map((pageNumber) => ({
      pageNumber,
      primaryUnitScale: primaryByPage.get(pageNumber)?.unitScale ?? null,
      shadowUnitScale: shadowByPage.get(pageNumber)?.unitScale ?? null,
    }))
    .filter((item) => item.primaryUnitScale !== item.shadowUnitScale);

  const primaryFacts = mapFactsByMetric(input.primary);
  const shadowFacts = mapFactsByMetric(input.shadow);
  const metricKeys = Array.from(
    new Set([...primaryFacts.keys(), ...shadowFacts.keys()]),
  ).sort();

  const factDifferences = metricKeys
    .map((metricKey) => ({
      metricKey,
      primaryValue: primaryFacts.get(metricKey)?.value ?? null,
      shadowValue: shadowFacts.get(metricKey)?.value ?? null,
    }))
    .filter((item) => item.primaryValue !== item.shadowValue);

  const blockingRuleDifferences = {
    onlyInPrimary: input.primary.blockingRuleCodes.filter(
      (ruleCode) => !input.shadow.blockingRuleCodes.includes(ruleCode),
    ),
    onlyInShadow: input.shadow.blockingRuleCodes.filter(
      (ruleCode) => !input.primary.blockingRuleCodes.includes(ruleCode),
    ),
  };

  const publishDecisionMismatch =
    input.primary.shouldPublish !== input.shadow.shouldPublish;
  const materialDisagreement =
    publishDecisionMismatch ||
    classificationDifferences.length > 0 ||
    unitScaleDifferences.length > 0 ||
    factDifferences.length > 0 ||
    blockingRuleDifferences.onlyInPrimary.length > 0 ||
    blockingRuleDifferences.onlyInShadow.length > 0;

  return {
    primaryEngine: input.primary.engine,
    shadowEngine: input.shadow.engine,
    primaryShouldPublish: input.primary.shouldPublish,
    shadowShouldPublish: input.shadow.shouldPublish,
    publishDecisionMismatch,
    classificationDifferences,
    unitScaleDifferences,
    factDifferences,
    blockingRuleDifferences,
    durationMs: {
      primary: input.primary.durationMs ?? null,
      shadow: input.shadow.durationMs ?? null,
    },
    materialDisagreement,
  } satisfies OpenDataLoaderComparisonSummary;
}
