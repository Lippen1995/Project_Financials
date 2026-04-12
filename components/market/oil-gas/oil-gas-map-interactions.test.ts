import { describe, expect, it } from "vitest";

import {
  getFeatureTypeLabel,
  resolveInteractiveFeatures,
  sortInteractiveFeatures,
} from "@/components/market/oil-gas/oil-gas-map-interactions";
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

describe("oil and gas map interactions", () => {
  it("prioritizes fields above licences when they overlap", () => {
    const field = makeFeature({
      id: "FIELD:field-a",
      entityId: "field-a",
      name: "Field A",
      layerId: "fields",
      entityType: "FIELD",
    });
    const licence = makeFeature({
      id: "LICENCE:licence-a",
      entityId: "licence-a",
      name: "Licence A",
      layerId: "licences",
      entityType: "LICENCE",
    });

    expect(sortInteractiveFeatures([licence, field]).map((feature) => feature.id)).toEqual([
      "FIELD:field-a",
      "LICENCE:licence-a",
    ]);
  });

  it("dedupes rendered features and keeps interaction priority", () => {
    const field = makeFeature({
      id: "FIELD:field-a",
      entityId: "field-a",
      name: "Field A",
      layerId: "fields",
      entityType: "FIELD",
    });
    const licence = makeFeature({
      id: "LICENCE:licence-a",
      entityId: "licence-a",
      name: "Licence A",
      layerId: "licences",
      entityType: "LICENCE",
    });

    const result = resolveInteractiveFeatures(
      [
        {
          properties: {
            entityType: "LICENCE",
            entityId: "licence-a",
          },
        },
        {
          properties: {
            entityType: "FIELD",
            entityId: "field-a",
          },
        },
        {
          properties: {
            entityType: "FIELD",
            entityId: "field-a",
          },
        },
      ],
      [field, licence],
    );

    expect(result.map((feature) => feature.id)).toEqual(["FIELD:field-a", "LICENCE:licence-a"]);
  });

  it("maps entity type to the expected tooltip label", () => {
    expect(
      getFeatureTypeLabel(
        makeFeature({
          entityType: "TUF",
          layerId: "tuf",
        }),
      ),
    ).toBe("TUF");
  });
});
