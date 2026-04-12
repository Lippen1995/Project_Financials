import { PetroleumLayerId } from "@/lib/types";

export type PetroleumLegendSymbol =
  | "fill"
  | "dashed-fill"
  | "line"
  | "point"
  | "cluster"
  | "centroid";

export type PetroleumMapLegendItem = {
  id: string;
  layerId: PetroleumLayerId;
  label: string;
  symbol: PetroleumLegendSymbol;
  color: string;
};

type Input = {
  activeLayers: Array<{ layerId: PetroleumLayerId; count: number }>;
  zoom?: number | null;
};

export function buildPetroleumMapLegendItems(input: Input): PetroleumMapLegendItem[] {
  const zoom = input.zoom ?? 0;
  const items: PetroleumMapLegendItem[] = [];

  for (const entry of input.activeLayers) {
    if (entry.count <= 0) {
      continue;
    }

    switch (entry.layerId) {
      case "fields":
        items.push({
          id: "fields-fill",
          layerId: entry.layerId,
          label: "Feltflater",
          symbol: "fill",
          color: "#165d52",
        });
        break;
      case "discoveries":
        items.push({
          id: "discoveries-fill",
          layerId: entry.layerId,
          label: "Funn",
          symbol: "fill",
          color: "#bc6c25",
        });
        break;
      case "licences":
        items.push({
          id: "licences-fill",
          layerId: entry.layerId,
          label: "Lisenser",
          symbol: "dashed-fill",
          color: "#2f5d8a",
        });
        break;
      case "tuf":
        items.push({
          id: "tuf-line",
          layerId: entry.layerId,
          label: "TUF og hovedrorledninger",
          symbol: "line",
          color: "#14213d",
        });
        break;
      case "facilities":
        items.push({
          id: "facilities-symbol",
          layerId: entry.layerId,
          label: zoom < 7 ? "Plattformer / FPSO (klynger)" : "Plattformer / FPSO",
          symbol: zoom < 7 ? "cluster" : "point",
          color: "#9b2226",
        });
        break;
      case "subsea":
        if (zoom >= 7.1) {
          items.push({
            id: "subsea-symbol",
            layerId: entry.layerId,
            label: "Subsea-installasjoner",
            symbol: "point",
            color: "#0f766e",
          });
        }
        break;
      case "terminals":
        items.push({
          id: "terminals-symbol",
          layerId: entry.layerId,
          label: zoom < 7 ? "Landanlegg / terminaler (klynger)" : "Landanlegg / terminaler",
          symbol: zoom < 7 ? "cluster" : "point",
          color: "#7c4f00",
        });
        break;
      case "wellbores":
        items.push({
          id: "wellbores-symbol",
          layerId: entry.layerId,
          label: zoom < 7 ? "Bronner (klynger)" : "Bronner",
          symbol: zoom < 7 ? "cluster" : "point",
          color: "#0369a1",
        });
        break;
      case "surveys":
        items.push({
          id: "surveys-symbol",
          layerId: entry.layerId,
          label: zoom < 5.7 ? "Survey-overblikk" : "Survey-footprints",
          symbol: zoom < 5.7 ? "centroid" : "dashed-fill",
          color: "#6b7280",
        });
        break;
      case "regulatoryEvents":
        items.push({
          id: "regulatory-events-symbol",
          layerId: entry.layerId,
          label: zoom < 7 ? "Regulatoriske hendelser (klynger)" : "Regulatoriske hendelser",
          symbol: zoom < 7 ? "cluster" : "point",
          color: "#7c3aed",
        });
        break;
      case "gasscoEvents":
        items.push({
          id: "gassco-events-symbol",
          layerId: entry.layerId,
          label: zoom < 7 ? "Gassco-hendelser (klynger)" : "Gassco-hendelser",
          symbol: zoom < 7 ? "cluster" : "point",
          color: "#2563eb",
        });
        break;
      default:
        break;
    }
  }

  return items;
}
