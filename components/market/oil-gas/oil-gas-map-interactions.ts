import { getMapFeatureTypeLabel } from "@/lib/petroleum-map-layering";
import { PetroleumLayerId, PetroleumMapFeature } from "@/lib/types";

export const PETROLEUM_INTERACTION_PRIORITY: PetroleumLayerId[] = [
  "fields",
  "discoveries",
  "facilities",
  "subsea",
  "terminals",
  "tuf",
  "licences",
  "wellbores",
  "surveys",
];

const INTERACTION_PRIORITY_LOOKUP = new Map(
  PETROLEUM_INTERACTION_PRIORITY.map((layerId, index) => [layerId, index] as const),
);

export function getInteractionPriority(layerId: PetroleumLayerId) {
  return INTERACTION_PRIORITY_LOOKUP.get(layerId) ?? 999;
}

export function getFeatureKey(feature: Pick<PetroleumMapFeature, "entityType" | "entityId">) {
  return `${feature.entityType}:${feature.entityId}`;
}

export function getFeatureTypeLabel(feature: Pick<PetroleumMapFeature, "entityType" | "layerId">) {
  return getMapFeatureTypeLabel(feature);
}

export function sortInteractiveFeatures(features: PetroleumMapFeature[]) {
  return [...features].sort((left, right) => {
    const priorityDelta = getInteractionPriority(left.layerId) - getInteractionPriority(right.layerId);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (left.name !== right.name) {
      return left.name.localeCompare(right.name, "nb-NO");
    }

    return getFeatureKey(left).localeCompare(getFeatureKey(right), "nb-NO");
  });
}

export function resolveInteractiveFeatures(
  renderedFeatures: Array<{ properties?: Record<string, unknown> }> | undefined,
  allFeatures: PetroleumMapFeature[],
) {
  const featureLookup = new Map(allFeatures.map((feature) => [getFeatureKey(feature), feature] as const));
  const deduped = new Map<string, PetroleumMapFeature>();

  for (const renderedFeature of renderedFeatures ?? []) {
    const properties = renderedFeature.properties;
    const entityType = typeof properties?.entityType === "string" ? properties.entityType : null;
    const entityId = typeof properties?.entityId === "string" ? properties.entityId : null;
    if (!entityType || !entityId) {
      continue;
    }

    const key = `${entityType}:${entityId}`;
    const feature = featureLookup.get(key);
    if (!feature || deduped.has(key)) {
      continue;
    }

    deduped.set(key, feature);
  }

  return sortInteractiveFeatures([...deduped.values()]);
}
