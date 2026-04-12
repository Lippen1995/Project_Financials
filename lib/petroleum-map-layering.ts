import { PetroleumLayerId, PetroleumMapFeature } from "@/lib/types";

const SURFACE_FACILITY_EXCLUSIONS = [
  "subsea structure",
  "multi well template",
  "single well template",
  "onshore facility",
  "landfall",
  "vessel",
  "dive support vessel",
  "offshore wind turbine",
];

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function classifyFacilityMapLayer(input: {
  facilityKind?: string | null;
  name?: string | null;
  area?: string | null;
}): PetroleumLayerId | null {
  const kind = normalize(input.facilityKind);
  const name = normalize(input.name);
  const area = normalize(input.area);

  if (!kind && !name && !area) {
    return "facilities";
  }

  if (
    kind === "subsea structure" ||
    kind === "multi well template" ||
    kind === "single well template"
  ) {
    return "subsea";
  }

  if (kind === "onshore facility" || kind === "landfall") {
    return "terminals";
  }

  if (kind.includes("vessel") || kind.includes("offshore wind")) {
    return null;
  }

  if (SURFACE_FACILITY_EXCLUSIONS.some((entry) => kind.includes(entry))) {
    return null;
  }

  if (name.includes("terminal") || area.includes("terminal") || name.includes("landanlegg")) {
    return "terminals";
  }

  return "facilities";
}

export function getMapFeatureTypeLabel(feature: Pick<PetroleumMapFeature, "entityType" | "layerId">) {
  switch (feature.layerId) {
    case "facilities":
      return "Innretning";
    case "subsea":
      return "Subsea";
    case "terminals":
      return "Landanlegg";
    case "fields":
      return "Felt";
    case "discoveries":
      return "Funn";
    case "licences":
      return "Lisens";
    case "tuf":
      return "TUF";
    case "wellbores":
      return "Brønn";
    case "surveys":
      return "Survey";
    case "regulatoryEvents":
      return "Hendelse";
    case "gasscoEvents":
      return "Gassco";
    default:
      return feature.entityType;
  }
}

export function isClusteredPointLayer(layerId: PetroleumLayerId) {
  return layerId === "facilities" || layerId === "subsea" || layerId === "terminals" || layerId === "wellbores";
}
