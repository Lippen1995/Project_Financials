import { describe, expect, it } from "vitest";

import {
  getCompanyMapGridCellSize,
  getCompanyMapViewportMode,
} from "@/server/company-map/viewport";

describe("company-map viewport", () => {
  it("uses count-only clusters until individual addresses are useful", () => {
    expect(getCompanyMapViewportMode(4)).toBe("CLUSTERS");
    expect(getCompanyMapViewportMode(8.99)).toBe("CLUSTERS");
    expect(getCompanyMapViewportMode(9)).toBe("ADDRESSES");
  });

  it("shrinks deterministic grid cells as the map zooms in", () => {
    expect(getCompanyMapGridCellSize(4)).toBe(1.5);
    expect(getCompanyMapGridCellSize(6)).toBe(0.35);
    expect(getCompanyMapGridCellSize(8)).toBe(0.08);
  });
});
