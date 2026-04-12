import { PetroleumBbox, PetroleumCoordinate, PetroleumEntityType, PetroleumMapFeature } from "@/lib/types";

export type PetroleumMapFocusTarget =
  | {
      kind: "bounds";
      bounds: [[number, number], [number, number]];
      options: {
        duration: number;
        maxZoom: number;
        padding: number;
      };
    }
  | {
      kind: "center";
      center: PetroleumCoordinate;
      options: {
        duration: number;
        zoom: number;
      };
    };

const MAX_ZOOM_BY_ENTITY: Record<PetroleumEntityType, number> = {
  FIELD: 8,
  DISCOVERY: 8,
  LICENCE: 8,
  FACILITY: 9,
  TUF: 9,
  WELLBORE: 10,
  SURVEY: 10,
};

const CENTER_ZOOM_BY_ENTITY: Record<PetroleumEntityType, number> = {
  FIELD: 7.2,
  DISCOVERY: 7.2,
  LICENCE: 7.2,
  FACILITY: 8.2,
  TUF: 8.2,
  WELLBORE: 9.2,
  SURVEY: 9.2,
};

const SMALL_BBOX_THRESHOLD_BY_ENTITY: Record<PetroleumEntityType, number> = {
  FIELD: 0.18,
  DISCOVERY: 0.18,
  LICENCE: 0.18,
  FACILITY: 0.08,
  TUF: 0.08,
  WELLBORE: 0.03,
  SURVEY: 0.03,
};

function getBboxCenter(bbox: PetroleumBbox): PetroleumCoordinate {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function getFeatureFocusTarget(feature: PetroleumMapFeature): PetroleumMapFocusTarget | null {
  const maxZoom = MAX_ZOOM_BY_ENTITY[feature.entityType];
  const centerZoom = CENTER_ZOOM_BY_ENTITY[feature.entityType];

  if (!feature.bbox) {
    if (!feature.centroid) {
      return null;
    }

    return {
      kind: "center",
      center: feature.centroid,
      options: {
        duration: 650,
        zoom: centerZoom,
      },
    };
  }

  const width = Math.abs(feature.bbox[2] - feature.bbox[0]);
  const height = Math.abs(feature.bbox[3] - feature.bbox[1]);
  const threshold = SMALL_BBOX_THRESHOLD_BY_ENTITY[feature.entityType];

  if (width < threshold || height < threshold) {
    return {
      kind: "center",
      center: feature.centroid ?? getBboxCenter(feature.bbox),
      options: {
        duration: 650,
        zoom: centerZoom,
      },
    };
  }

  return {
    kind: "bounds",
    bounds: [
      [feature.bbox[0], feature.bbox[1]],
      [feature.bbox[2], feature.bbox[3]],
    ],
    options: {
      duration: 700,
      maxZoom,
      padding: 56,
    },
  };
}
