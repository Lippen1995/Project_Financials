type JsonObject = Record<string, unknown>;

export type CompanyEventShadowFeatureVector = {
  heuristicScore: number;
  exposureScore: number;
  exposureConfidence: number;
  eventConfidence: number;
  entityConfidence: number;
  materialityScore: number;
  sourceCredibilityScore: number;
  strategicImpactScore: number;
  financialImpactScore: number;
  riskImpactScore: number;
  noveltyScore: number;
  timelinessScore: number;
  evidenceStrengthScore: number;
  duplicatePenalty: number;
  lowSignalPenalty: number;
  evidenceCount: number;
  isDirectExposure: number;
};

export type CompanyEventShadowWeights = {
  bias: number;
  heuristicScore: number;
  exposureScore: number;
  exposureConfidence: number;
  eventConfidence: number;
  entityConfidence: number;
  materialityScore: number;
  sourceCredibilityScore: number;
  strategicImpactScore: number;
  financialImpactScore: number;
  riskImpactScore: number;
  noveltyScore: number;
  timelinessScore: number;
  evidenceStrengthScore: number;
  duplicatePenalty: number;
  lowSignalPenalty: number;
  evidenceCount: number;
  isDirectExposure: number;
};

export const DEFAULT_COMPANY_EVENT_SHADOW_WEIGHTS: CompanyEventShadowWeights = {
  bias: -0.22,
  heuristicScore: 0.32,
  exposureScore: 0.16,
  exposureConfidence: 0.12,
  eventConfidence: 0.12,
  entityConfidence: 0.1,
  materialityScore: 0.08,
  sourceCredibilityScore: 0.06,
  strategicImpactScore: 0.06,
  financialImpactScore: 0.05,
  riskImpactScore: 0.05,
  noveltyScore: 0.03,
  timelinessScore: 0.02,
  evidenceStrengthScore: 0.03,
  duplicatePenalty: -0.08,
  lowSignalPenalty: -0.12,
  evidenceCount: 0.02,
  isDirectExposure: 0.05,
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function nestedNumber(value: unknown, path: string[]) {
  let cursor: unknown = value;
  for (const part of path) {
    cursor = asObject(cursor)[part];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : 0;
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

export function buildCompanyEventShadowFeatureVector(input: {
  investorValueScore: number;
  confidenceScore: number;
  noveltyScore: number;
  metadata?: unknown;
  evidenceCount: number;
  exposureType: string;
  exposureScore: number;
  exposureConfidence: number;
}) {
  const components = asObject(asObject(input.metadata).scoreComponents);

  return {
    heuristicScore: input.investorValueScore / 100,
    exposureScore: input.exposureScore,
    exposureConfidence: input.exposureConfidence,
    eventConfidence: input.confidenceScore,
    entityConfidence: nestedNumber(components, ["entityConfidence"]),
    materialityScore: nestedNumber(components, ["materialityScore"]),
    sourceCredibilityScore: nestedNumber(components, ["sourceCredibilityScore"]),
    strategicImpactScore: nestedNumber(components, ["strategicImpactScore"]),
    financialImpactScore: nestedNumber(components, ["financialImpactScore"]),
    riskImpactScore: nestedNumber(components, ["riskImpactScore"]),
    noveltyScore: input.noveltyScore,
    timelinessScore: nestedNumber(components, ["timelinessScore"]),
    evidenceStrengthScore: nestedNumber(components, ["evidenceStrengthScore"]),
    duplicatePenalty: nestedNumber(components, ["duplicatePenalty"]),
    lowSignalPenalty: nestedNumber(components, ["lowSignalPenalty"]),
    evidenceCount: Math.min(1, input.evidenceCount / 4),
    isDirectExposure: input.exposureType === "direct" ? 1 : 0,
  } satisfies CompanyEventShadowFeatureVector;
}

export function scoreCompanyEventShadowModel(
  vector: CompanyEventShadowFeatureVector,
  weights: CompanyEventShadowWeights = DEFAULT_COMPANY_EVENT_SHADOW_WEIGHTS,
) {
  const linear =
    weights.bias +
    vector.heuristicScore * weights.heuristicScore +
    vector.exposureScore * weights.exposureScore +
    vector.exposureConfidence * weights.exposureConfidence +
    vector.eventConfidence * weights.eventConfidence +
    vector.entityConfidence * weights.entityConfidence +
    vector.materialityScore * weights.materialityScore +
    vector.sourceCredibilityScore * weights.sourceCredibilityScore +
    vector.strategicImpactScore * weights.strategicImpactScore +
    vector.financialImpactScore * weights.financialImpactScore +
    vector.riskImpactScore * weights.riskImpactScore +
    vector.noveltyScore * weights.noveltyScore +
    vector.timelinessScore * weights.timelinessScore +
    vector.evidenceStrengthScore * weights.evidenceStrengthScore +
    vector.duplicatePenalty * weights.duplicatePenalty +
    vector.lowSignalPenalty * weights.lowSignalPenalty +
    vector.evidenceCount * weights.evidenceCount +
    vector.isDirectExposure * weights.isDirectExposure;

  const probability = sigmoid(linear);
  return {
    linearScore: Math.round(linear * 1000) / 1000,
    probability: Math.round(probability * 1000) / 1000,
    bucket:
      probability >= 0.72 ? "high" : probability >= 0.48 ? "medium" : "low",
  };
}
