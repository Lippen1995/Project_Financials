import { describe, expect, it } from "vitest";

import { getFeatureFocusTarget } from "@/components/market/oil-gas/oil-gas-map-focus";
import { PetroleumMapFeature } from "@/lib/types";

function makeFeature(overrides: Partial<PetroleumMapFeature>): PetroleumMapFeature {
  return {
    id: "FIELD:test-field",
    layerId: "fields",
    entityType: "FIELD",
    entityId: "test-field",
    name: "Test field",
    geometry: { type: "Point", coordinates: [2, 60] },
    sourceSystem: "SODIR",
    sourceEntityType: "FIELD",
    sourceId: "123",
    fetchedAt: new Date("2026-04-12T00:00:00.000Z"),
    normalizedAt: new Date("2026-04-12T00:00:00.000Z"),
    ...overrides,
  };
}

describe("getFeatureFocusTarget", () => {
  it("uses fitBounds for larger field extents with capped zoom", () => {
    const result = getFeatureFocusTarget(
      makeFeature({
        bbox: [1, 59, 3, 61],
      }),
    );

    expect(result).toEqual({
      kind: "bounds",
      bounds: [
        [1, 59],
        [3, 61],
      ],
      options: {
        duration: 700,
        maxZoom: 8,
        padding: 56,
      },
    });
  });

  it("uses centroid centering for very small field extents", () => {
    const result = getFeatureFocusTarget(
      makeFeature({
        bbox: [1.1, 59.9, 1.14, 59.93],
        centroid: [1.12, 59.915],
      }),
    );

    expect(result).toEqual({
      kind: "center",
      center: [1.12, 59.915],
      options: {
        duration: 650,
        zoom: 7.2,
      },
    });
  });

  it("lets wellbores zoom tighter than fields", () => {
    const result = getFeatureFocusTarget(
      makeFeature({
        id: "WELLBORE:test-well",
        layerId: "wellbores",
        entityType: "WELLBORE",
        entityId: "test-well",
        bbox: [1.1, 59.9, 1.105, 59.905],
        centroid: [1.102, 59.902],
      }),
    );

    expect(result).toEqual({
      kind: "center",
      center: [1.102, 59.902],
      options: {
        duration: 650,
        zoom: 9.2,
      },
    });
  });
});
