export const COMPANY_EXPOSURE_GRAPH_VERSION = "company-exposure-graph-v1";

export type CompanyExposureGraphNodeType =
  | "company"
  | "industry_code"
  | "sector"
  | "commodity"
  | "geography"
  | "regulatory_domain"
  | "value_chain";

export type CompanyExposureGraphEdgeInput = {
  nodeType: CompanyExposureGraphNodeType;
  nodeKey: string;
  nodeLabel: string;
  relationType: string;
  weight: number;
  confidenceScore: number;
  rationale: string;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  metadata?: Record<string, unknown>;
};

export type CompanyExposureGraphCompanyInput = {
  industryCode?: {
    code: string;
    title: string;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
  } | null;
  petroleumExposure?: {
    npdCompanyId?: number | null;
    operatorFieldCount: number;
    licenceCount: number;
    operatedProductionOe?: number | null;
    attributableProductionOe?: number | null;
    remainingReservesOe?: number | null;
    mainAreas?: string[];
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
  } | null;
  petroleumOperator?: {
    mainAreas: string[];
    mainHydrocarbonTypes: string[];
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    computedAt: Date;
  } | null;
  controlledSubsidiaries?: Array<{
    orgNumber: string;
    name: string;
    ownershipPercent: number;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: Date;
    exposure: Omit<CompanyExposureGraphCompanyInput, "controlledSubsidiaries">;
  }>;
};

export type PersistedCompanyExposureGraphEdge = {
  relationType: string;
  weight: number;
  confidenceScore: number;
  rationale?: string | null;
  node: {
    nodeType: string;
    key: string;
    label: string;
  };
};

export type CompanyExposureGraphEventInput = {
  eventType: string;
  title: string;
  summary?: string | null;
  sourceId?: string | null;
  sourceCompanyIndustryCode?: string | null;
  sourceCompanyOrgNumber?: string | null;
};

export type CompanyExposureGraphMatch = {
  exposureType: "ownership" | "sector" | "petroleum" | "commodity" | "geography" | "regulatory" | "value_chain";
  exposureLevel: "group" | "asset" | "commercial" | "commodity" | "regulatory" | "geography" | "peer" | "sector";
  feedPolicy: "standard" | "context_only" | "hidden";
  exposureScore: number;
  confidenceScore: number;
  rationale: string;
  reasons: string[];
  matchedSignals: string[];
};

type SectorDefinition = {
  prefixes: string[];
  key: string;
  label: string;
};

const SECTOR_DEFINITIONS: SectorDefinition[] = [
  { prefixes: ["05", "06", "09", "19"], key: "petroleum", label: "Petroleum" },
  { prefixes: ["35"], key: "power_utilities", label: "Kraft og forsyning" },
  { prefixes: ["64", "65", "66"], key: "financial_services", label: "Finansielle tjenester" },
  { prefixes: ["58", "61", "62", "63"], key: "technology_media_telecom", label: "Teknologi, media og telekom" },
  { prefixes: ["03"], key: "seafood_aquaculture", label: "Sjømat og havbruk" },
  { prefixes: ["21", "26", "32", "86"], key: "health_life_sciences", label: "Helse og livsvitenskap" },
  { prefixes: ["30", "50", "52"], key: "maritime_logistics", label: "Maritim og logistikk" },
  { prefixes: ["41", "42", "43", "68"], key: "construction_real_estate", label: "Bygg og eiendom" },
];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeKey(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function industryPrefix(code: string) {
  return code.replace(/\D/g, "").slice(0, 2);
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function uniqueEdges(edges: CompanyExposureGraphEdgeInput[]) {
  const byKey = new Map<string, CompanyExposureGraphEdgeInput>();
  for (const edge of edges) {
    const key = `${edge.nodeType}:${edge.nodeKey}:${edge.relationType}`;
    const existing = byKey.get(key);
    if (!existing || edge.weight > existing.weight) {
      byKey.set(key, edge);
    }
  }
  return [...byKey.values()];
}

export function buildCompanyExposureGraphEdges(
  input: CompanyExposureGraphCompanyInput,
): CompanyExposureGraphEdgeInput[] {
  const edges: CompanyExposureGraphEdgeInput[] = [];
  const industry = input.industryCode;

  if (industry) {
    edges.push({
      nodeType: "industry_code",
      nodeKey: industry.code,
      nodeLabel: `${industry.code} ${industry.title}`,
      relationType: "registered_industry",
      weight: 0.98,
      confidenceScore: 0.99,
      rationale: "Virksomhetens registrerte næringskode fra BRREG, forklart med SSBs kodeverk.",
      sourceSystem: industry.sourceSystem,
      sourceEntityType: industry.sourceEntityType,
      sourceId: industry.sourceId,
      fetchedAt: industry.fetchedAt,
      metadata: { graphVersion: COMPANY_EXPOSURE_GRAPH_VERSION },
    });

    const prefix = industryPrefix(industry.code);
    for (const sector of SECTOR_DEFINITIONS.filter((item) => item.prefixes.includes(prefix))) {
      edges.push({
        nodeType: "sector",
        nodeKey: sector.key,
        nodeLabel: sector.label,
        relationType: "operates_in_sector",
        weight: 0.82,
        confidenceScore: 0.94,
        rationale: `Sektor avledet fra registrert næringskode ${industry.code}.`,
        sourceSystem: "PROJECTX",
        sourceEntityType: "DERIVED_FROM_SSB_INDUSTRY_CODE",
        sourceId: `${industry.sourceId}:sector:${sector.key}`,
        fetchedAt: industry.fetchedAt,
        metadata: {
          graphVersion: COMPANY_EXPOSURE_GRAPH_VERSION,
          upstreamSourceSystem: industry.sourceSystem,
          upstreamSourceId: industry.sourceId,
          industryCode: industry.code,
        },
      });
    }
  }

  const petroleum = input.petroleumExposure;
  if (petroleum) {
    const activityWeight =
      petroleum.operatorFieldCount > 0 || (petroleum.operatedProductionOe ?? 0) > 0
        ? 0.96
        : petroleum.licenceCount > 0
          ? 0.9
          : 0.82;
    const base = {
      sourceSystem: petroleum.sourceSystem,
      sourceEntityType: petroleum.sourceEntityType,
      sourceId: petroleum.sourceId,
      fetchedAt: petroleum.fetchedAt,
      metadata: {
        graphVersion: COMPANY_EXPOSURE_GRAPH_VERSION,
        npdCompanyId: petroleum.npdCompanyId ?? null,
        operatorFieldCount: petroleum.operatorFieldCount,
        licenceCount: petroleum.licenceCount,
      },
    };

    edges.push(
      {
        nodeType: "sector",
        nodeKey: "petroleum",
        nodeLabel: "Petroleum",
        relationType: "verified_sector_exposure",
        weight: activityWeight,
        confidenceScore: 0.98,
        rationale: "Verifisert petroleumseksponering fra Sokkeldirektoratets selskaps- og aktivitetsdata.",
        ...base,
      },
      {
        nodeType: "value_chain",
        nodeKey: "upstream_oil_gas",
        nodeLabel: "Oppstrøms olje og gass",
        relationType: "participates_in_value_chain",
        weight: activityWeight,
        confidenceScore: 0.96,
        rationale: "Operatør-, felt- eller lisensaktivitet på norsk sokkel.",
        ...base,
      },
      {
        nodeType: "regulatory_domain",
        nodeKey: "norwegian_continental_shelf",
        nodeLabel: "Norsk sokkel",
        relationType: "subject_to_regulatory_domain",
        weight: 0.92,
        confidenceScore: 0.98,
        rationale: "Selskapet har registrert felt- eller lisensaktivitet på norsk sokkel.",
        ...base,
      },
    );

    for (const area of petroleum.mainAreas ?? []) {
      if (!area.trim()) continue;
      edges.push({
        nodeType: "geography",
        nodeKey: normalizeKey(area),
        nodeLabel: area,
        relationType: "operates_in_area",
        weight: 0.9,
        confidenceScore: 0.97,
        rationale: `Registrert petroleumsaktivitet i ${area}.`,
        ...base,
        sourceId: `${petroleum.sourceId}:area:${normalizeKey(area)}`,
      });
    }
  }

  const operator = input.petroleumOperator;
  if (operator) {
    for (const hydrocarbonType of operator.mainHydrocarbonTypes) {
      const normalized = normalizeText(hydrocarbonType);
      const commodity =
        includesAny(normalized, ["gas", "gass"])
          ? { key: "natural_gas", label: "Naturgass" }
          : includesAny(normalized, ["oil", "olje", "liquid"])
            ? { key: "crude_oil", label: "Råolje og væsker" }
            : null;
      if (!commodity) continue;

      edges.push({
        nodeType: "commodity",
        nodeKey: commodity.key,
        nodeLabel: commodity.label,
        relationType: "produces_commodity",
        weight: 0.9,
        confidenceScore: 0.95,
        rationale: `Hydrokarbontype registrert av Sokkeldirektoratet: ${hydrocarbonType}.`,
        sourceSystem: operator.sourceSystem,
        sourceEntityType: operator.sourceEntityType,
        sourceId: `${operator.sourceId}:commodity:${commodity.key}`,
        fetchedAt: operator.computedAt,
        metadata: {
          graphVersion: COMPANY_EXPOSURE_GRAPH_VERSION,
          hydrocarbonType,
        },
      });
    }
  }

  for (const subsidiary of input.controlledSubsidiaries ?? []) {
    const ownershipFactor = clamp01(subsidiary.ownershipPercent / 100);
    edges.push({
      nodeType: "company",
      nodeKey: `controlled_company:${subsidiary.orgNumber}`,
      nodeLabel: subsidiary.name,
      relationType: "controls_company",
      weight: ownershipFactor,
      confidenceScore: 0.99,
      rationale: `${subsidiary.ownershipPercent.toFixed(2)} % direkte eierskap i ${subsidiary.name}.`,
      sourceSystem: subsidiary.sourceSystem,
      sourceEntityType: subsidiary.sourceEntityType,
      sourceId: subsidiary.sourceId,
      fetchedAt: subsidiary.fetchedAt,
      metadata: {
        graphVersion: COMPANY_EXPOSURE_GRAPH_VERSION,
        subsidiaryOrgNumber: subsidiary.orgNumber,
        ownershipPercent: subsidiary.ownershipPercent,
      },
    });

    const inheritedEdges = buildCompanyExposureGraphEdges(subsidiary.exposure).filter(
      (edge) => !["industry_code"].includes(edge.nodeType),
    );
    for (const inherited of inheritedEdges) {
      edges.push({
        ...inherited,
        relationType: "inherits_exposure_from_controlled_subsidiary",
        weight: clamp01(inherited.weight * (0.72 + ownershipFactor * 0.23)),
        confidenceScore: clamp01(inherited.confidenceScore * ownershipFactor * 0.98),
        rationale: `${inherited.rationale} Arvet via ${subsidiary.ownershipPercent.toFixed(2)} % eierskap i ${subsidiary.name}.`,
        sourceSystem: "PROJECTX",
        sourceEntityType: "DERIVED_FROM_OWNERSHIP_AND_OFFICIAL_EXPOSURE",
        sourceId: `${subsidiary.sourceId}:${inherited.sourceId}`,
        fetchedAt:
          subsidiary.fetchedAt > inherited.fetchedAt
            ? subsidiary.fetchedAt
            : inherited.fetchedAt,
        metadata: {
          ...(inherited.metadata ?? {}),
          graphVersion: COMPANY_EXPOSURE_GRAPH_VERSION,
          ownershipSourceSystem: subsidiary.sourceSystem,
          ownershipSourceId: subsidiary.sourceId,
          operatingExposureSourceSystem: inherited.sourceSystem,
          operatingExposureSourceId: inherited.sourceId,
          subsidiaryOrgNumber: subsidiary.orgNumber,
          ownershipPercent: subsidiary.ownershipPercent,
        },
      });
    }
  }

  return uniqueEdges(edges);
}

type EventConcept = {
  nodeType: CompanyExposureGraphNodeType;
  nodeKey: string;
  strength: number;
  exposureType: CompanyExposureGraphMatch["exposureType"];
  reason: string;
};

export function extractCompanyExposureGraphEventConcepts(
  event: CompanyExposureGraphEventInput,
): EventConcept[] {
  const text = normalizeText(`${event.title} ${event.summary ?? ""}`);
  const sourceId = event.sourceId ?? "";
  const concepts: EventConcept[] = [];
  const hasPetroleumContext =
    sourceId.startsWith("sodir-") ||
    sourceId.startsWith("eia-") ||
    sourceId === "iea-news" ||
    ["05", "06", "09", "19"].includes(
      (event.sourceCompanyIndustryCode ?? "").replace(/\D/g, "").slice(0, 2),
    ) ||
    includesAny(text, [
      "petroleum",
      "oil",
      "crude",
      "brent",
      "wti",
      "natural gas",
      "lng",
      "offshore",
      "norsk sokkel",
      "north sea",
      "nordsjoen",
      "nordsjøen",
      "barents sea",
      "barentshavet",
      "norwegian sea",
      "norskehavet",
    ]);
  const add = (concept: EventConcept) => {
    const existing = concepts.find(
      (item) => item.nodeType === concept.nodeType && item.nodeKey === concept.nodeKey,
    );
    if (!existing || concept.strength > existing.strength) {
      if (existing) concepts.splice(concepts.indexOf(existing), 1);
      concepts.push(concept);
    }
  };

  if (event.sourceCompanyOrgNumber) {
    add({
      nodeType: "company",
      nodeKey: `controlled_company:${event.sourceCompanyOrgNumber}`,
      strength: 0.99,
      exposureType: "ownership",
      reason: "controlled_company_event",
    });
  }

  if (sourceId.startsWith("sodir-")) {
    add({ nodeType: "sector", nodeKey: "petroleum", strength: 0.98, exposureType: "petroleum", reason: "sodir_source" });
    add({
      nodeType: "regulatory_domain",
      nodeKey: "norwegian_continental_shelf",
      strength: 0.94,
      exposureType: "regulatory",
      reason: "sodir_regulatory_domain",
    });
  }

  if (sourceId.startsWith("eia-") || sourceId === "iea-news") {
    add({ nodeType: "sector", nodeKey: "petroleum", strength: 0.88, exposureType: "petroleum", reason: "official_energy_source" });
  }

  if (includesAny(text, ["oil", "crude", "brent", "wti", "olje"])) {
    add({ nodeType: "commodity", nodeKey: "crude_oil", strength: 0.94, exposureType: "commodity", reason: "oil_market_topic" });
  }
  if (includesAny(text, ["natural gas", "lng", "gas price", "gass", "gas market"])) {
    add({ nodeType: "commodity", nodeKey: "natural_gas", strength: 0.94, exposureType: "commodity", reason: "gas_market_topic" });
  }
  if (includesAny(text, ["north sea", "nordsjoen", "nordsjøen"])) {
    add({ nodeType: "geography", nodeKey: "north_sea", strength: 0.92, exposureType: "geography", reason: "north_sea_mention" });
  }
  if (includesAny(text, ["barents sea", "barentshavet"])) {
    add({ nodeType: "geography", nodeKey: "barents_sea", strength: 0.92, exposureType: "geography", reason: "barents_sea_mention" });
  }
  if (includesAny(text, ["norwegian sea", "norskehavet"])) {
    add({ nodeType: "geography", nodeKey: "norwegian_sea", strength: 0.92, exposureType: "geography", reason: "norwegian_sea_mention" });
  }
  if (
    hasPetroleumContext &&
    (
      ["production_update", "procurement_tender", "project_delay", "cost_overrun"].includes(event.eventType) ||
      includesAny(text, ["drilling", "boreloyve", "boreløyve", "well", "field development", "offshore"])
    )
  ) {
    add({
      nodeType: "value_chain",
      nodeKey: "upstream_oil_gas",
      strength: 0.84,
      exposureType: "value_chain",
      reason: "upstream_activity_topic",
    });
  }
  if (
    ["license_award", "license_loss", "regulatory_change"].includes(event.eventType) &&
    includesAny(text, ["sokkel", "offshore", "petroleum", "oil", "gas", "lisens", "licence", "license"])
  ) {
    add({
      nodeType: "regulatory_domain",
      nodeKey: "norwegian_continental_shelf",
      strength: 0.88,
      exposureType: "regulatory",
      reason: "ncs_regulatory_topic",
    });
  }

  return concepts;
}

export function scoreCompanyExposureGraph(
  event: CompanyExposureGraphEventInput,
  edges: PersistedCompanyExposureGraphEdge[],
  threshold = 0.58,
): CompanyExposureGraphMatch[] {
  const concepts = extractCompanyExposureGraphEventConcepts(event);
  const matches: CompanyExposureGraphMatch[] = [];
  const contextualEvent = [
    "macro_news",
    "sector_news",
    "commodity_price_exposure",
    "interest_rate_exposure",
    "regulatory_change",
  ].includes(event.eventType);

  for (const edge of edges) {
    const concept = concepts.find(
      (item) => item.nodeType === edge.node.nodeType && item.nodeKey === edge.node.key,
    );
    if (!concept) continue;
    if (concept.nodeType !== "company" && !contextualEvent) continue;

    const exposureScore = clamp01(0.28 + edge.weight * 0.42 + concept.strength * 0.3);
    if (exposureScore < threshold) continue;

    const policy =
      concept.nodeType === "company"
        ? { exposureLevel: "group" as const, feedPolicy: "standard" as const }
        : concept.nodeType === "commodity"
          ? { exposureLevel: "commodity" as const, feedPolicy: "standard" as const }
          : concept.nodeType === "regulatory_domain"
            ? { exposureLevel: "regulatory" as const, feedPolicy: "standard" as const }
            : concept.nodeType === "geography"
              ? { exposureLevel: "geography" as const, feedPolicy: "context_only" as const }
              : concept.nodeType === "sector"
                ? { exposureLevel: "sector" as const, feedPolicy: "context_only" as const }
                : { exposureLevel: "peer" as const, feedPolicy: "context_only" as const };

    matches.push({
      exposureType: concept.exposureType,
      ...policy,
      exposureScore,
      confidenceScore: clamp01(edge.confidenceScore * 0.7 + concept.strength * 0.3),
      rationale: `Eksponeringsgraf: ${edge.node.label} via ${edge.relationType}. ${edge.rationale ?? ""}`.trim(),
      reasons: ["exposure_graph_match", concept.reason],
      matchedSignals: [edge.node.key, edge.node.label, edge.relationType],
    });
  }

  const bestByType = new Map<CompanyExposureGraphMatch["exposureType"], CompanyExposureGraphMatch>();
  for (const match of matches) {
    const existing = bestByType.get(match.exposureType);
    if (!existing || match.exposureScore > existing.exposureScore) {
      bestByType.set(match.exposureType, match);
    }
  }
  const specificity: Record<CompanyExposureGraphMatch["exposureType"], number> = {
    ownership: 7,
    commodity: 6,
    geography: 5,
    regulatory: 4,
    value_chain: 3,
    petroleum: 2,
    sector: 1,
  };
  return [...bestByType.values()].sort((a, b) => {
    const scoreDelta = b.exposureScore - a.exposureScore;
    if (Math.abs(scoreDelta) > 0.03) return scoreDelta;
    return specificity[b.exposureType] - specificity[a.exposureType];
  });
}
