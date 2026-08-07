export type CompanyMapViewportMode = "CLUSTERS" | "ADDRESSES";

export function getCompanyMapViewportMode(zoom: number): CompanyMapViewportMode {
  return zoom < 9 ? "CLUSTERS" : "ADDRESSES";
}

export function getCompanyMapGridCellSize(zoom: number): number {
  if (zoom < 5) return 1.5;
  if (zoom < 6) return 0.75;
  if (zoom < 7) return 0.35;
  if (zoom < 8) return 0.18;
  return 0.08;
}
