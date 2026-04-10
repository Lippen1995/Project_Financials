"use client";

import * as React from "react";

import { PETROLEUM_LAYER_LABELS } from "@/lib/petroleum-market";
import { PetroleumBbox, PetroleumLayerId, PetroleumMapFeature } from "@/lib/types";

const LAYER_COLORS: Record<PetroleumLayerId, string> = {
  fields: "#165d52",
  discoveries: "#bc6c25",
  licences: "#2f5d8a",
  facilities: "#9b2226",
  tuf: "#14213d",
  wellbores: "#0f766e",
  surveys: "#6b7280",
  regulatoryEvents: "#7c3aed",
  gasscoEvents: "#2563eb",
};

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
} as const;

const DEFAULT_CENTER: [number, number] = [8.5, 63.5];
const DEFAULT_ZOOM = 4;
const RENDERED_LAYERS: PetroleumLayerId[] = [
  "fields",
  "discoveries",
  "licences",
  "facilities",
  "tuf",
  "wellbores",
  "surveys",
];

type FeatureProperties = {
  id: string;
  layerId: PetroleumLayerId;
  entityId: string;
  entityType: string;
  name: string;
  status?: string | null;
  area?: string | null;
  hcType?: string | null;
  operatorName?: string | null;
  companyName?: string | null;
  relatedFieldName?: string | null;
  latestProductionOe?: number | null;
  selectedProductionValue?: number | null;
  selectedProductionUnit?: string | null;
  selectedProductionLabel?: string | null;
  remainingOe?: number | null;
  expectedFutureInvestmentNok?: number | null;
  currentAreaSqKm?: number | null;
  transferCount?: number | null;
  facilityKind?: string | null;
  category?: string | null;
  subType?: string | null;
  surveyYear?: number | null;
  wellType?: string | null;
  purpose?: string | null;
  waterDepth?: number | null;
  totalDepth?: number | null;
};

type HoverEvent = import("maplibre-gl").MapMouseEvent & {
  features?: Array<{ properties?: Record<string, unknown> }>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeBbox(bbox: PetroleumBbox): PetroleumBbox {
  return bbox.map((value) => Number(value.toFixed(3))) as PetroleumBbox;
}

function sameBbox(left?: PetroleumBbox | null, right?: PetroleumBbox | null) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.every((value, index) => Math.abs(value - right[index]) < 0.001);
}

function formatTooltipOe(value?: number | null) {
  if (typeof value !== "number") {
    return "";
  }

  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} mill. oe`;
}

function formatTooltipNok(value?: number | null) {
  if (typeof value !== "number" || value <= 0) {
    return "";
  }

  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTooltipMetric(value?: number | null, unit?: string | null) {
  if (typeof value !== "number" || !unit) {
    return "";
  }

  return `${new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: unit === "boepd" ? 0 : 2,
  }).format(value)} ${unit}`;
}

function toGeoJsonFeature(feature: PetroleumMapFeature) {
  return {
    type: "Feature",
    id: feature.id,
    geometry: feature.geometry,
    properties: {
      id: feature.id,
      layerId: feature.layerId,
      entityId: feature.entityId,
      entityType: feature.entityType,
      name: feature.name,
      status: feature.status,
      area: feature.area,
      hcType: feature.hcType,
      operatorName: feature.operator?.companyName ?? null,
      companyName: feature.companyName ?? null,
      relatedFieldName: feature.relatedFieldName,
      latestProductionOe: feature.latestProductionOe ?? null,
      selectedProductionValue: feature.selectedProductionValue ?? null,
      selectedProductionUnit: feature.selectedProductionUnit ?? null,
      selectedProductionLabel: feature.selectedProductionLabel ?? null,
      remainingOe: feature.remainingOe ?? null,
      expectedFutureInvestmentNok: feature.expectedFutureInvestmentNok ?? null,
      currentAreaSqKm: feature.currentAreaSqKm ?? null,
      transferCount: feature.transferCount ?? null,
      facilityKind: feature.facilityKind ?? null,
      category: feature.category ?? null,
      subType: feature.subType ?? null,
      surveyYear: feature.surveyYear ?? null,
      wellType: feature.wellType ?? null,
      purpose: feature.purpose ?? null,
      waterDepth: feature.waterDepth ?? null,
      totalDepth: feature.totalDepth ?? null,
    } satisfies FeatureProperties,
  };
}

function toSurveyCentroidFeature(feature: PetroleumMapFeature) {
  const coordinates = feature.centroid ?? null;
  if (!coordinates) {
    return null;
  }

  return {
    type: "Feature",
    id: `${feature.id}-centroid`,
    geometry: {
      type: "Point",
      coordinates,
    },
    properties: {
      id: feature.id,
      layerId: feature.layerId,
      entityId: feature.entityId,
      entityType: feature.entityType,
      name: feature.name,
      status: feature.status,
      area: feature.area,
      hcType: feature.hcType,
      operatorName: feature.operator?.companyName ?? null,
      companyName: feature.companyName ?? null,
      relatedFieldName: feature.relatedFieldName,
      latestProductionOe: feature.latestProductionOe ?? null,
      selectedProductionValue: feature.selectedProductionValue ?? null,
      selectedProductionUnit: feature.selectedProductionUnit ?? null,
      selectedProductionLabel: feature.selectedProductionLabel ?? null,
      remainingOe: feature.remainingOe ?? null,
      expectedFutureInvestmentNok: feature.expectedFutureInvestmentNok ?? null,
      currentAreaSqKm: feature.currentAreaSqKm ?? null,
      transferCount: feature.transferCount ?? null,
      facilityKind: feature.facilityKind ?? null,
      category: feature.category ?? null,
      subType: feature.subType ?? null,
      surveyYear: feature.surveyYear ?? null,
      wellType: feature.wellType ?? null,
      purpose: feature.purpose ?? null,
      waterDepth: feature.waterDepth ?? null,
      totalDepth: feature.totalDepth ?? null,
    } satisfies FeatureProperties,
  };
}

function toFeatureCollection(features: PetroleumMapFeature[]) {
  return {
    type: "FeatureCollection",
    features: features.map(toGeoJsonFeature),
  };
}

function syncLayerSources(map: import("maplibre-gl").Map, features: PetroleumMapFeature[]) {
  const featuresByLayer = new Map<PetroleumLayerId, PetroleumMapFeature[]>();
  for (const feature of features) {
    const existing = featuresByLayer.get(feature.layerId);
    if (existing) {
      existing.push(feature);
    } else {
      featuresByLayer.set(feature.layerId, [feature]);
    }
  }

  for (const layerId of RENDERED_LAYERS) {
    const source = map.getSource(`petroleum-${layerId}`) as import("maplibre-gl").GeoJSONSource | undefined;
    if (!source) {
      continue;
    }

    source.setData(toFeatureCollection(featuresByLayer.get(layerId) ?? []) as never);
  }

  const surveyCentroidSource = map.getSource("petroleum-surveys-centroids") as
    | import("maplibre-gl").GeoJSONSource
    | undefined;
  if (surveyCentroidSource) {
    surveyCentroidSource.setData(
      {
        type: "FeatureCollection",
        features: (featuresByLayer.get("surveys") ?? [])
          .map(toSurveyCentroidFeature)
          .filter(Boolean),
      } as never,
    );
  }
}

function syncSelectionSource(map: import("maplibre-gl").Map, selectedFeature: PetroleumMapFeature | null) {
  const source = map.getSource("petroleum-selection") as import("maplibre-gl").GeoJSONSource | undefined;
  if (!source) {
    return;
  }

  source.setData(toFeatureCollection(selectedFeature ? [selectedFeature] : []) as never);
}

function renderTooltipHtml(properties: Partial<FeatureProperties> & { cluster?: boolean; point_count?: number }) {
  if (properties.cluster) {
    return `
      <div class="petroleum-map-tooltip">
        <div class="petroleum-map-tooltip__eyebrow">Kartklynge</div>
        <div class="petroleum-map-tooltip__title">${properties.point_count ?? 0} objekter</div>
        <div class="petroleum-map-tooltip__meta">Zoom inn for å se enkeltnoder.</div>
      </div>
    `;
  }

  const rows = [
    properties.status ? `<div><strong>Status:</strong> ${escapeHtml(properties.status)}</div>` : "",
    properties.area ? `<div><strong>Område:</strong> ${escapeHtml(properties.area)}</div>` : "",
    properties.operatorName ? `<div><strong>Operatør:</strong> ${escapeHtml(properties.operatorName)}</div>` : "",
    properties.companyName && !properties.operatorName
      ? `<div><strong>Selskap:</strong> ${escapeHtml(properties.companyName)}</div>`
      : "",
    properties.hcType ? `<div><strong>Hydrokarbon:</strong> ${escapeHtml(properties.hcType)}</div>` : "",
    properties.category ? `<div><strong>Kategori:</strong> ${escapeHtml(properties.category)}</div>` : "",
    properties.subType ? `<div><strong>Subtype:</strong> ${escapeHtml(properties.subType)}</div>` : "",
    typeof properties.surveyYear === "number"
      ? `<div><strong>År:</strong> ${properties.surveyYear}</div>`
      : "",
    formatTooltipMetric(properties.selectedProductionValue, properties.selectedProductionUnit)
      ? `<div><strong>${escapeHtml(properties.selectedProductionLabel ?? "Produksjon")}:</strong> ${formatTooltipMetric(properties.selectedProductionValue, properties.selectedProductionUnit)}</div>`
      : "",
    formatTooltipOe(properties.latestProductionOe)
      ? `<div><strong>Produksjon:</strong> ${formatTooltipOe(properties.latestProductionOe)}</div>`
      : "",
    formatTooltipOe(properties.remainingOe)
      ? `<div><strong>Gjenværende:</strong> ${formatTooltipOe(properties.remainingOe)}</div>`
      : "",
    formatTooltipNok(properties.expectedFutureInvestmentNok)
      ? `<div><strong>Forv. investering:</strong> ${formatTooltipNok(properties.expectedFutureInvestmentNok)}</div>`
      : "",
    typeof properties.currentAreaSqKm === "number"
      ? `<div><strong>Areal:</strong> ${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(properties.currentAreaSqKm)} km²</div>`
      : "",
    typeof properties.transferCount === "number"
      ? `<div><strong>Overføringer:</strong> ${properties.transferCount}</div>`
      : "",
    properties.facilityKind ? `<div><strong>Type:</strong> ${escapeHtml(properties.facilityKind)}</div>` : "",
    properties.wellType ? `<div><strong>Brønntype:</strong> ${escapeHtml(properties.wellType)}</div>` : "",
    properties.purpose ? `<div><strong>Formål:</strong> ${escapeHtml(properties.purpose)}</div>` : "",
    typeof properties.waterDepth === "number"
      ? `<div><strong>Vanndyp:</strong> ${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(properties.waterDepth)} m</div>`
      : "",
    typeof properties.totalDepth === "number"
      ? `<div><strong>Totaldybde:</strong> ${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(properties.totalDepth)} m</div>`
      : "",
    properties.relatedFieldName ? `<div><strong>Relatert felt:</strong> ${escapeHtml(properties.relatedFieldName)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="petroleum-map-tooltip">
      <div class="petroleum-map-tooltip__eyebrow">${escapeHtml(
        PETROLEUM_LAYER_LABELS[(properties.layerId as PetroleumLayerId) ?? "fields"],
      )}</div>
      <div class="petroleum-map-tooltip__title">${escapeHtml(properties.name ?? "Ukjent objekt")}</div>
      <div class="petroleum-map-tooltip__meta">${rows || "<div>Ingen ekstra metadata tilgjengelig.</div>"}</div>
    </div>
  `;
}

export function OilGasMap({
  features,
  selectedEntityKey,
  onSelectEntity,
  onViewportChange,
  targetBbox,
  resetViewNonce,
  className,
}: {
  features: PetroleumMapFeature[];
  selectedEntityKey?: string | null;
  onSelectEntity: (entityType: string, entityId: string) => void;
  onViewportChange?: (bbox: PetroleumBbox) => void;
  targetBbox?: PetroleumBbox | null;
  resetViewNonce?: number;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<import("maplibre-gl").Map | null>(null);
  const onSelectEntityRef = React.useRef(onSelectEntity);
  const onViewportChangeRef = React.useRef(onViewportChange);
  const selectedEntityKeyRef = React.useRef(selectedEntityKey);
  const featuresRef = React.useRef(features);
  const lastViewportRef = React.useRef<PetroleumBbox | null>(null);
  const [mapReady, setMapReady] = React.useState(false);

  React.useEffect(() => {
    onSelectEntityRef.current = onSelectEntity;
  }, [onSelectEntity]);

  React.useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  React.useEffect(() => {
    selectedEntityKeyRef.current = selectedEntityKey;
  }, [selectedEntityKey]);

  React.useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  React.useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      const maplibre = await import("maplibre-gl");
      if (cancelled || !containerRef.current) {
        return;
      }

      const map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE as never,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });

      const popup = new maplibre.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: "320px",
        offset: 16,
      });

      const emitViewportChange = () => {
        const bounds = map.getBounds();
        const nextBbox = normalizeBbox([
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ]);

        if (sameBbox(lastViewportRef.current, nextBbox)) {
          return;
        }

        lastViewportRef.current = nextBbox;
        onViewportChangeRef.current?.(nextBbox);
      };

      const hidePopup = () => {
        popup.remove();
        map.getCanvas().style.cursor = "";
      };

      const showPopup = (event: HoverEvent) => {
        const properties = event.features?.[0]?.properties as
          | (Partial<FeatureProperties> & { cluster?: boolean; point_count?: number })
          | undefined;
        if (!properties) {
          popup.remove();
          return;
        }

        popup.setLngLat(event.lngLat).setHTML(renderTooltipHtml(properties)).addTo(map);
        map.getCanvas().style.cursor = "pointer";
      };

      map.addControl(new maplibre.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        for (const layerId of RENDERED_LAYERS) {
          const sourceId = `petroleum-${layerId}`;

          if (layerId === "facilities" || layerId === "wellbores") {
            map.addSource(sourceId, {
              type: "geojson",
              data: toFeatureCollection([]) as never,
              cluster: true,
              clusterRadius: 42,
              clusterMaxZoom: 7,
            });

            map.addLayer({
              id: `${sourceId}-clusters`,
              type: "circle",
              source: sourceId,
              filter: ["has", "point_count"] as never,
              paint: {
                "circle-color": "#7f1d1d",
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
                "circle-opacity": 0.9,
                "circle-radius": [
                  "step",
                  ["get", "point_count"],
                  14,
                  20,
                  18,
                  60,
                  22,
                  120,
                  28,
                ] as never,
              },
            });

            map.addLayer({
              id: `${sourceId}-cluster-count`,
              type: "symbol",
              source: sourceId,
              filter: ["has", "point_count"] as never,
              layout: {
                "text-field": ["get", "point_count_abbreviated"] as never,
                "text-size": 12,
                "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] as never,
              },
              paint: {
                "text-color": "#ffffff",
              },
            });

            map.addLayer({
              id: `${sourceId}-circle`,
              type: "circle",
              source: sourceId,
              filter: ["!", ["has", "point_count"]] as never,
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  4,
                  6,
                  5.5,
                  8,
                  7.5,
                ] as never,
                "circle-color": LAYER_COLORS[layerId],
                "circle-opacity": 0.88,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.8,
              },
            });
          } else if (layerId === "tuf") {
            map.addSource(sourceId, {
              type: "geojson",
              data: toFeatureCollection([]) as never,
            });

            map.addLayer({
              id: `${sourceId}-line`,
              type: "line",
              source: sourceId,
              paint: {
                "line-width": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  1.8,
                  7,
                  2.5,
                  9,
                  3.2,
                ] as never,
                "line-color": LAYER_COLORS[layerId],
                "line-opacity": 0.8,
              },
            });
          } else {
            map.addSource(sourceId, {
              type: "geojson",
              data: toFeatureCollection([]) as never,
            });

            map.addLayer({
              id: `${sourceId}-fill`,
              type: "fill",
              source: sourceId,
              minzoom: layerId === "surveys" ? 5.7 : undefined,
              paint: {
                "fill-color": LAYER_COLORS[layerId],
                "fill-opacity":
                  layerId === "licences"
                    ? 0.12
                    : layerId === "discoveries"
                      ? 0.2
                      : layerId === "surveys"
                        ? 0.035
                        : 0.17,
              },
            });

            map.addLayer({
              id: `${sourceId}-outline`,
              type: "line",
              source: sourceId,
              minzoom: layerId === "surveys" ? 5.7 : undefined,
              paint: {
                "line-width":
                  layerId === "licences" ? 1.5 : layerId === "discoveries" ? 1.25 : layerId === "surveys" ? 0.9 : 1.1,
                "line-color": LAYER_COLORS[layerId],
                "line-opacity": layerId === "surveys" ? 0.22 : 0.85,
                ...(layerId === "licences" || layerId === "surveys"
                  ? {
                      "line-dasharray": [2, 2],
                    }
                  : {}),
              },
            });
          }
        }

        map.addSource("petroleum-surveys-centroids", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          } as never,
        });

        map.addLayer({
          id: "petroleum-surveys-centroids-circle",
          type: "circle",
          source: "petroleum-surveys-centroids",
          maxzoom: 5.7,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3,
              3.2,
              4.5,
              4.8,
              5.7,
              6.2,
            ] as never,
            "circle-color": "#334155",
            "circle-opacity": 0.72,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.3,
          },
        });

        map.addSource("petroleum-selection", {
          type: "geojson",
          data: toFeatureCollection([]) as never,
        });

        map.addLayer({
          id: "petroleum-selection-fill",
          type: "fill",
          source: "petroleum-selection",
          paint: {
            "fill-color": "#0f172a",
            "fill-opacity": 0.08,
          },
        });

        map.addLayer({
          id: "petroleum-selection-line",
          type: "line",
          source: "petroleum-selection",
          paint: {
            "line-color": "#0f172a",
            "line-width": 3,
          },
        });

        map.addLayer({
          id: "petroleum-selection-circle",
          type: "circle",
          source: "petroleum-selection",
          paint: {
            "circle-radius": 9,
            "circle-color": "#f97316",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5,
          },
        });

        for (const layerId of RENDERED_LAYERS) {
          const sourceId = `petroleum-${layerId}`;

          if (layerId === "facilities" || layerId === "wellbores") {
            map.on("click", `${sourceId}-clusters`, (event) => {
              const clusterFeature = event.features?.[0];
              const clusterId = clusterFeature?.properties?.cluster_id;
              const source = map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource & {
                getClusterExpansionZoom: (
                  clusterId: number,
                  callback: (error: Error | null, zoom: number) => void,
                ) => void;
              };

              if (!source || typeof clusterId !== "number" || !clusterFeature) {
                return;
              }

              source.getClusterExpansionZoom(clusterId, (error, zoom) => {
                if (error) {
                  return;
                }

                const coordinates = (clusterFeature.geometry as { coordinates?: [number, number] }).coordinates;
                if (!coordinates) {
                  return;
                }

                map.easeTo({
                  center: coordinates,
                  zoom,
                  duration: 500,
                });
              });
            });

            map.on("mousemove", `${sourceId}-clusters`, showPopup as never);
            map.on("mouseleave", `${sourceId}-clusters`, hidePopup);

            map.on("click", `${sourceId}-circle`, (event) => {
              const properties = event.features?.[0]?.properties as Partial<FeatureProperties> | undefined;
              if (properties?.entityId && properties?.entityType) {
                onSelectEntityRef.current(properties.entityType, properties.entityId);
              }
            });
            map.on("mousemove", `${sourceId}-circle`, showPopup as never);
            map.on("mouseleave", `${sourceId}-circle`, hidePopup);
            continue;
          }

          if (layerId === "surveys") {
            map.on("click", "petroleum-surveys-centroids-circle", (event) => {
              const properties = event.features?.[0]?.properties as Partial<FeatureProperties> | undefined;
              if (properties?.entityId && properties?.entityType) {
                onSelectEntityRef.current(properties.entityType, properties.entityId);
              }
            });
            map.on("mousemove", "petroleum-surveys-centroids-circle", showPopup as never);
            map.on("mouseleave", "petroleum-surveys-centroids-circle", hidePopup);
          }

          for (const interactiveLayer of [`${sourceId}-fill`, `${sourceId}-outline`, `${sourceId}-line`]) {
            if (!map.getLayer(interactiveLayer)) {
              continue;
            }

            map.on("click", interactiveLayer, (event) => {
              const properties = event.features?.[0]?.properties as Partial<FeatureProperties> | undefined;
              if (properties?.entityId && properties?.entityType) {
                onSelectEntityRef.current(properties.entityType, properties.entityId);
              }
            });

            map.on("mousemove", interactiveLayer, showPopup as never);
            map.on("mouseleave", interactiveLayer, hidePopup);
          }
        }

        map.on("dragend", emitViewportChange);
        map.on("zoomend", emitViewportChange);

        syncLayerSources(map, featuresRef.current);
        syncSelectionSource(
          map,
          featuresRef.current.find(
            (item) => `${item.entityType}:${item.entityId}` === selectedEntityKeyRef.current,
          ) ?? null,
        );
        emitViewportChange();
        setMapReady(true);
      });
    }

    void boot();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    syncLayerSources(map, features);
  }, [features, mapReady]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const selectedFeature =
      features.find((item) => `${item.entityType}:${item.entityId}` === selectedEntityKey) ?? null;
    syncSelectionSource(map, selectedFeature);

    if (!selectedFeature?.bbox) {
      return;
    }

    map.once("moveend", () => {
      const bounds = map.getBounds();
      const nextBbox = normalizeBbox([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
      if (!sameBbox(lastViewportRef.current, nextBbox)) {
        lastViewportRef.current = nextBbox;
        onViewportChangeRef.current?.(nextBbox);
      }
    });

    map.fitBounds(
      [
        [selectedFeature.bbox[0], selectedFeature.bbox[1]],
        [selectedFeature.bbox[2], selectedFeature.bbox[3]],
      ],
      { padding: 56, duration: 700 },
    );
  }, [features, mapReady, selectedEntityKey]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !targetBbox || selectedEntityKey) {
      return;
    }

    const currentBbox = normalizeBbox([
      map.getBounds().getWest(),
      map.getBounds().getSouth(),
      map.getBounds().getEast(),
      map.getBounds().getNorth(),
    ]);

    if (sameBbox(currentBbox, targetBbox)) {
      return;
    }

    map.fitBounds(
      [
        [targetBbox[0], targetBbox[1]],
        [targetBbox[2], targetBbox[3]],
      ],
      { padding: 56, duration: 0 },
    );
  }, [mapReady, selectedEntityKey, targetBbox]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !resetViewNonce) {
      return;
    }

    map.once("moveend", () => {
      const bounds = map.getBounds();
      const nextBbox = normalizeBbox([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
      if (!sameBbox(lastViewportRef.current, nextBbox)) {
        lastViewportRef.current = nextBbox;
      }
      onViewportChangeRef.current?.(nextBbox);
    });

    map.easeTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      duration: 700,
    });
  }, [mapReady, resetViewNonce]);

  return <div ref={containerRef} className={className ?? "h-[34rem] w-full bg-[#E8EEF2]"} />;
}
