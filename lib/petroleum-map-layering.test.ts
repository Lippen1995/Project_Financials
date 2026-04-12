import { describe, expect, it } from "vitest";

import { classifyFacilityMapLayer, getMapFeatureTypeLabel } from "@/lib/petroleum-map-layering";

describe("classifyFacilityMapLayer", () => {
  it("classifies subsea structures as subsea", () => {
    expect(classifyFacilityMapLayer({ facilityKind: "SUBSEA STRUCTURE", name: "TROLL PILOT" })).toBe("subsea");
  });

  it("classifies fpsos as facilities", () => {
    expect(classifyFacilityMapLayer({ facilityKind: "FPSO", name: "ALVHEIM FPSO" })).toBe("facilities");
  });

  it("classifies onshore facilities as terminals", () => {
    expect(classifyFacilityMapLayer({ facilityKind: "ONSHORE FACILITY", name: "NYHAMNA" })).toBe("terminals");
  });

  it("filters out vessel-like support units from map layers", () => {
    expect(classifyFacilityMapLayer({ facilityKind: "VESSEL", name: "ABEILLE SUPPORT" })).toBeNull();
  });
});

describe("getMapFeatureTypeLabel", () => {
  it("prefers layer-specific labels for facility-derived layers", () => {
    expect(getMapFeatureTypeLabel({ entityType: "FACILITY", layerId: "subsea" })).toBe("Subsea");
    expect(getMapFeatureTypeLabel({ entityType: "FACILITY", layerId: "terminals" })).toBe("Landanlegg");
  });
});
