import { describe, expect, it } from "vitest";

import { buildPetroleumMapLegendItems } from "@/components/market/oil-gas/oil-gas-map-legend";

describe("buildPetroleumMapLegendItems", () => {
  it("uses full geometry legend for tuf and licences", () => {
    const items = buildPetroleumMapLegendItems({
      activeLayers: [
        { layerId: "licences", count: 12 },
        { layerId: "tuf", count: 5 },
      ],
      zoom: 4,
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layerId: "licences", symbol: "dashed-fill" }),
        expect.objectContaining({ layerId: "tuf", symbol: "line" }),
      ]),
    );
  });

  it("changes representation for clustered layers by zoom", () => {
    const lowZoomItems = buildPetroleumMapLegendItems({
      activeLayers: [{ layerId: "facilities", count: 24 }],
      zoom: 5,
    });
    const highZoomItems = buildPetroleumMapLegendItems({
      activeLayers: [{ layerId: "facilities", count: 24 }],
      zoom: 8,
    });

    expect(lowZoomItems[0]?.symbol).toBe("cluster");
    expect(highZoomItems[0]?.symbol).toBe("point");
  });

  it("only shows subsea in legend once zoom is high enough", () => {
    expect(
      buildPetroleumMapLegendItems({
        activeLayers: [{ layerId: "subsea", count: 80 }],
        zoom: 6,
      }),
    ).toHaveLength(0);

    expect(
      buildPetroleumMapLegendItems({
        activeLayers: [{ layerId: "subsea", count: 80 }],
        zoom: 8,
      })[0],
    ).toEqual(expect.objectContaining({ layerId: "subsea", symbol: "point" }));
  });
});
