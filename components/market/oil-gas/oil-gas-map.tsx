"use client";

import * as React from "react";

import { getFeatureFocusTarget } from "@/components/market/oil-gas/oil-gas-map-focus";
import {
  getFeatureKey,
  getFeatureTypeLabel,
  resolveInteractiveFeatures,
} from "@/components/market/oil-gas/oil-gas-map-interactions";
import { getMapFeatureTypeLabel, isClusteredPointLayer } from "@/lib/petroleum-map-layering";
import { PETROLEUM_LAYER_LABELS } from "@/lib/petroleum-market";
import {
  PetroleumBbox,
  PetroleumEventRow,
  PetroleumLayerId,
  PetroleumMapDetailMode,
  PetroleumMapFeature,
  PetroleumMapMode,
} from "@/lib/types";

const LAYER_COLORS: Record<PetroleumLayerId, string> = {
  fields: "#165d52",
  discoveries: "#bc6c25",
  licences: "#2f5d8a",
  facilities: "#9b2226",
  subsea: "#0f766e",
  terminals: "#7c4f00",
  tuf: "#14213d",
  wellbores: "#0369a1",
  surveys: "#6b7280",
  regulatoryEvents: "#7c3aed",
  gasscoEvents: "#2563eb",
};

const MAP_STYLE = {
  version: 8,
  sources: {
    ocean: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, GEBCO, Garmin, HERE, NOAA, National Geographic, and the GIS User Community",
    },
    seamark: {
      type: "raster",
      tiles: ["https://t1.openseamap.org/seamark/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenSeaMap contributors",
    },
  },
  layers: [
    {
      id: "ocean",
      type: "raster",
      source: "ocean",
    },
    {
      id: "seamark",
      type: "raster",
      source: "seamark",
      paint: {
        "raster-opacity": 0.38,
      },
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
  "subsea",
  "terminals",
  "tuf",
  "wellbores",
  "surveys",
];
const EVENT_LAYERS: PetroleumLayerId[] = ["regulatoryEvents", "gasscoEvents"];

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
  geometryMode?: string | null;
  source?: string | null;
  summary?: string | null;
};

type HoverEvent = import("maplibre-gl").MapMouseEvent & {
  features?: Array<{ properties?: Record<string, unknown> }>;
};

type HoverCardState = {
  x: number;
  y: number;
  properties: Partial<FeatureProperties> & { cluster?: boolean; point_count?: number };
  candidates: PetroleumMapFeature[];
  activeFeatureKey?: string | null;
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

function focusSelectedFeature(
  map: import("maplibre-gl").Map,
  feature: PetroleumMapFeature,
) {
  const focusTarget = getFeatureFocusTarget(feature);
  if (!focusTarget) {
    return;
  }

  if (focusTarget.kind === "bounds") {
    map.fitBounds(focusTarget.bounds, focusTarget.options);
    return;
  }

  map.easeTo({
    center: focusTarget.center,
    duration: focusTarget.options.duration,
    zoom: focusTarget.options.zoom,
  });
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

function getTooltipTypeLabel(properties: Partial<FeatureProperties>) {
  if (typeof properties.layerId === "string" && typeof properties.entityType === "string") {
    return getMapFeatureTypeLabel({
      layerId: properties.layerId as PetroleumLayerId,
      entityType: properties.entityType as PetroleumMapFeature["entityType"],
    });
  }

  const entityType = typeof properties.entityType === "string" ? properties.entityType : null;
  if (entityType === "FIELD") return "Felt";
  if (entityType === "DISCOVERY") return "Funn";
  if (entityType === "LICENCE") return "Lisens";
  if (entityType === "FACILITY") return "Innretning";
  if (entityType === "TUF") return "TUF";
  if (entityType === "WELLBORE") return "Brønn";
  if (entityType === "SURVEY") return "Survey";

  return PETROLEUM_LAYER_LABELS[(properties.layerId as PetroleumLayerId) ?? "fields"];
}

function getFeatureProperties(feature: PetroleumMapFeature): Partial<FeatureProperties> {
  return {
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
    relatedFieldName: feature.relatedFieldName ?? null,
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
    geometryMode: feature.geometryMode ?? null,
  };
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
      geometryMode: feature.geometryMode ?? null,
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
      geometryMode: feature.geometryMode ?? null,
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

function toEventGeoJsonFeature(event: PetroleumEventRow) {
  const geometry =
    event.geometry ??
    (event.centroid
      ? {
          type: "Point" as const,
          coordinates: event.centroid,
        }
      : null);

  if (!geometry) {
    return null;
  }

  return {
    type: "Feature",
    id: event.id,
    geometry,
    properties: {
      id: event.id,
      layerId: event.source === "GASSCO" ? "gasscoEvents" : "regulatoryEvents",
      entityId: event.entityId ?? undefined,
      entityType: event.entityType ?? undefined,
      name: event.title,
      status: event.eventType,
      source: event.source,
      summary: event.summary ?? null,
    } satisfies Partial<FeatureProperties>,
  };
}

function toEventFeatureCollection(events: PetroleumEventRow[]) {
  return {
    type: "FeatureCollection",
    features: events.map(toEventGeoJsonFeature).filter(Boolean),
  };
}

function createSourceSignature(items: Array<{ id: string; geometry: { type: string } | null | undefined; geometryMode?: string | null }>) {
  return items.map((item) => `${item.id}:${item.geometry?.type ?? "none"}:${item.geometryMode ?? "full"}`).join("|");
}

function syncGeoJsonSource(
  map: import("maplibre-gl").Map,
  sourceId: string,
  payload: Record<string, unknown>,
  signature: string,
  sourceSignatureRef: React.MutableRefObject<Map<string, string>>,
) {
  const source = map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource | undefined;
  if (!source) {
    return;
  }

  if (sourceSignatureRef.current.get(sourceId) === signature) {
    return;
  }

  source.setData(payload as never);
  sourceSignatureRef.current.set(sourceId, signature);
}

function syncLayerSources(
  map: import("maplibre-gl").Map,
  features: PetroleumMapFeature[],
  events: PetroleumEventRow[],
  relatedFeatures: PetroleumMapFeature[],
  sourceSignatureRef: React.MutableRefObject<Map<string, string>>,
) {
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
    const layerFeatures = featuresByLayer.get(layerId) ?? [];
    syncGeoJsonSource(
      map,
      `petroleum-${layerId}`,
      toFeatureCollection(layerFeatures),
      createSourceSignature(layerFeatures),
      sourceSignatureRef,
    );
  }

  const surveyCentroids = (featuresByLayer.get("surveys") ?? []).map(toSurveyCentroidFeature).filter(Boolean);
  syncGeoJsonSource(
    map,
    "petroleum-surveys-centroids",
    {
      type: "FeatureCollection",
      features: surveyCentroids,
    },
    surveyCentroids.map((feature) => String(feature?.id ?? "")).join("|"),
    sourceSignatureRef,
  );

  for (const layerId of EVENT_LAYERS) {
    const layerEvents = events.filter((event) =>
      layerId === "gasscoEvents" ? event.source === "GASSCO" : event.source !== "GASSCO",
    );
    syncGeoJsonSource(
      map,
      `petroleum-${layerId}`,
      toEventFeatureCollection(layerEvents),
      layerEvents.map((event) => event.id).join("|"),
      sourceSignatureRef,
    );
  }

  syncGeoJsonSource(
    map,
    "petroleum-related-selection",
    toFeatureCollection(relatedFeatures),
    createSourceSignature(relatedFeatures),
    sourceSignatureRef,
  );
}

function syncSelectionSource(
  map: import("maplibre-gl").Map,
  selectedFeature: PetroleumMapFeature | null,
  sourceSignatureRef: React.MutableRefObject<Map<string, string>>,
) {
  const selectionFeatures = selectedFeature ? [selectedFeature] : [];
  syncGeoJsonSource(
    map,
    "petroleum-selection",
    toFeatureCollection(selectionFeatures),
    createSourceSignature(selectionFeatures),
    sourceSignatureRef,
  );
}

function renderTooltipHtml(
  properties: Partial<FeatureProperties> & { cluster?: boolean; point_count?: number },
  options?: {
    overlapCount?: number;
    activeTypeLabel?: string;
  },
) {
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
    properties.source ? `<div><strong>Kilde:</strong> ${escapeHtml(properties.source)}</div>` : "",
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
    properties.geometryMode === "centroid" ? `<div><strong>Kartvisning:</strong> Overview-node</div>` : "",
    properties.summary ? `<div>${escapeHtml(properties.summary)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="petroleum-map-tooltip">
      <div class="petroleum-map-tooltip__eyebrow">${escapeHtml(
        options?.activeTypeLabel ?? getTooltipTypeLabel(properties),
      )}</div>
      <div class="petroleum-map-tooltip__title">${escapeHtml(properties.name ?? "Ukjent objekt")}</div>
      ${
        options?.overlapCount && options.overlapCount > 1
          ? `<div class="petroleum-map-tooltip__meta"><div><strong>Overlapp:</strong> ${options.overlapCount} treff under markøren. Bytt objekt i lagvelgeren.</div></div>`
          : ""
      }
      <div class="petroleum-map-tooltip__meta">${rows || "<div>Ingen ekstra metadata tilgjengelig.</div>"}</div>
    </div>
  `;
}

export function OilGasMap({
  features,
  events,
  relatedFeatures,
  mapMode,
  mapDetailMode,
  currentZoom,
  selectedEntityKey,
  onSelectEntity,
  onViewportChange,
  targetBbox,
  resetViewNonce,
  className,
}: {
  features: PetroleumMapFeature[];
  events: PetroleumEventRow[];
  relatedFeatures?: PetroleumMapFeature[];
  mapMode: PetroleumMapMode;
  mapDetailMode: PetroleumMapDetailMode;
  currentZoom?: number | null;
  selectedEntityKey?: string | null;
  onSelectEntity: (entityType: string, entityId: string, candidateKeys?: string[]) => void;
  onViewportChange?: (viewport: { bbox: PetroleumBbox; zoom: number }) => void;
  targetBbox?: PetroleumBbox | null;
  resetViewNonce?: number;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<import("maplibre-gl").Map | null>(null);
  const onSelectEntityRef = React.useRef(onSelectEntity);
  const onViewportChangeRef = React.useRef(onViewportChange);
  const selectedEntityKeyRef = React.useRef(selectedEntityKey);
  const featuresRef = React.useRef(features);
  const eventsRef = React.useRef(events);
  const relatedFeaturesRef = React.useRef(relatedFeatures ?? []);
  const lastViewportRef = React.useRef<PetroleumBbox | null>(null);
  const sourceSignatureRef = React.useRef(new Map<string, string>());
  const [mapReady, setMapReady] = React.useState(false);
  const [hoverState, setHoverState] = React.useState<HoverCardState | null>(null);
  const hoverStateRef = React.useRef<HoverCardState | null>(null);

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
    eventsRef.current = events;
  }, [events]);

  React.useEffect(() => {
    relatedFeaturesRef.current = relatedFeatures ?? [];
  }, [relatedFeatures]);

  React.useEffect(() => {
    hoverStateRef.current = hoverState;
  }, [hoverState]);

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
        onViewportChangeRef.current?.({
          bbox: nextBbox,
          zoom: Number(map.getZoom().toFixed(2)),
        });
      };

      map.addControl(new maplibre.NavigationControl(), "top-right");
      mapRef.current = map;

      const clearHoverState = () => {
        setHoverState(null);
        map.getCanvas().style.cursor = "";
      };

      const getEntityInteractiveLayerIds = () =>
        [
          "petroleum-fields-fill",
          "petroleum-fields-outline",
          "petroleum-fields-circle",
          "petroleum-discoveries-fill",
          "petroleum-discoveries-outline",
          "petroleum-discoveries-circle",
          "petroleum-facilities-circle",
          "petroleum-subsea-circle",
          "petroleum-terminals-circle",
          "petroleum-tuf-line",
          "petroleum-licences-fill",
          "petroleum-licences-outline",
          "petroleum-licences-circle",
          "petroleum-wellbores-circle",
          "petroleum-surveys-fill",
          "petroleum-surveys-outline",
          "petroleum-surveys-circle",
          "petroleum-surveys-centroids-circle",
        ].filter((layerId) => map.getLayer(layerId));

      const getClusterInteractiveLayerIds = () =>
        [
          "petroleum-facilities-clusters",
          "petroleum-subsea-clusters",
          "petroleum-terminals-clusters",
          "petroleum-wellbores-clusters",
          "petroleum-regulatoryEvents-clusters",
          "petroleum-gasscoEvents-clusters",
          "petroleum-regulatoryEvents-circle",
          "petroleum-gasscoEvents-circle",
        ].filter((layerId) => map.getLayer(layerId));

      const updateFeatureHoverState = (
        point: { x: number; y: number },
        candidates: PetroleumMapFeature[],
        requestedActiveKey?: string | null,
      ) => {
        if (candidates.length === 0) {
          clearHoverState();
          return;
        }

        const activeFeature =
          candidates.find((feature) => getFeatureKey(feature) === requestedActiveKey) ?? candidates[0];

        setHoverState({
          x: point.x,
          y: point.y,
          properties: getFeatureProperties(activeFeature),
          candidates,
          activeFeatureKey: getFeatureKey(activeFeature),
        });
        map.getCanvas().style.cursor = "pointer";
      };

      const updateClusterHoverState = (
        point: { x: number; y: number },
        properties?: Partial<FeatureProperties> & { cluster?: boolean; point_count?: number },
      ) => {
        if (!properties) {
          clearHoverState();
          return;
        }

        setHoverState({
          x: point.x,
          y: point.y,
          properties,
          candidates: [],
          activeFeatureKey: null,
        });
        map.getCanvas().style.cursor = "pointer";
      };

      const resolveCandidatesAtPoint = (point: { x: number; y: number }) =>
        resolveInteractiveFeatures(
          map.queryRenderedFeatures([point.x, point.y], {
            layers: getEntityInteractiveLayerIds(),
          }),
          featuresRef.current,
        );

      const handleGenericPointerMove = (event: HoverEvent) => {
        const candidates = resolveCandidatesAtPoint(event.point);
        if (candidates.length > 0) {
          const currentActiveKey = hoverStateRef.current?.activeFeatureKey ?? null;
          updateFeatureHoverState(event.point, candidates, currentActiveKey);
          return;
        }

        const clusterFeature = map.queryRenderedFeatures([event.point.x, event.point.y], {
          layers: getClusterInteractiveLayerIds(),
        })[0];

        if (clusterFeature?.properties) {
          updateClusterHoverState(
            event.point,
            clusterFeature.properties as Partial<FeatureProperties> & {
              cluster?: boolean;
              point_count?: number;
            },
          );
          return;
        }

        clearHoverState();
      };

      const handleGenericClick = (event: HoverEvent) => {
        const clusterHit = map.queryRenderedFeatures([event.point.x, event.point.y], {
          layers: [
            "petroleum-facilities-clusters",
            "petroleum-subsea-clusters",
            "petroleum-terminals-clusters",
            "petroleum-wellbores-clusters",
          ],
        })[0];
        if (clusterHit) {
          return;
        }

        const candidates = resolveCandidatesAtPoint(event.point);
        if (candidates.length === 0) {
          return;
        }

        const selected = candidates[0];
        onSelectEntityRef.current(
          selected.entityType,
          selected.entityId,
          candidates.map((feature) => getFeatureKey(feature)),
        );
        updateFeatureHoverState(event.point, candidates, getFeatureKey(selected));
      };

      map.on("load", () => {
        for (const layerId of RENDERED_LAYERS) {
          const sourceId = `petroleum-${layerId}`;

          if (isClusteredPointLayer(layerId)) {
            map.addSource(sourceId, {
              type: "geojson",
              data: toFeatureCollection([]) as never,
              cluster: true,
              clusterRadius: 42,
              clusterMaxZoom: layerId === "subsea" ? 8 : 7,
            });

            map.addLayer({
              id: `${sourceId}-clusters`,
              type: "circle",
              source: sourceId,
              filter: ["has", "point_count"] as never,
              paint: {
                "circle-color": LAYER_COLORS[layerId],
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
                  layerId === "subsea" ? 3 : layerId === "terminals" ? 4.5 : 4,
                  6,
                  layerId === "subsea" ? 4 : layerId === "terminals" ? 6 : 5.5,
                  8,
                  layerId === "subsea" ? 5.5 : layerId === "terminals" ? 7.5 : 7.5,
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
              id: `${sourceId}-circle`,
              type: "circle",
              source: sourceId,
              filter: ["==", ["geometry-type"], "Point"] as never,
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  layerId === "fields" ? 4.5 : 4,
                  6,
                  layerId === "fields" ? 7 : 6,
                  8,
                  layerId === "fields" ? 10 : 8,
                ] as never,
                "circle-color": LAYER_COLORS[layerId],
                "circle-opacity": layerId === "surveys" ? 0.62 : 0.85,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.8,
              },
            });

            map.addLayer({
              id: `${sourceId}-fill`,
              type: "fill",
              source: sourceId,
              filter: [
                "any",
                ["==", ["geometry-type"], "Polygon"],
                ["==", ["geometry-type"], "MultiPolygon"],
              ] as never,
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
              filter: [
                "any",
                ["==", ["geometry-type"], "Polygon"],
                ["==", ["geometry-type"], "MultiPolygon"],
              ] as never,
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

        for (const layerId of EVENT_LAYERS) {
          const sourceId = `petroleum-${layerId}`;
          map.addSource(sourceId, {
            type: "geojson",
            data: toEventFeatureCollection([]) as never,
            cluster: true,
            clusterRadius: 36,
            clusterMaxZoom: 7,
          });

          map.addLayer({
            id: `${sourceId}-clusters`,
            type: "circle",
            source: sourceId,
            filter: ["has", "point_count"] as never,
            paint: {
              "circle-color": LAYER_COLORS[layerId],
              "circle-opacity": 0.88,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-radius": [
                "step",
                ["get", "point_count"],
                12,
                15,
                16,
                40,
                20,
                100,
                24,
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
              "text-size": 11,
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
                7,
                5.5,
                9,
                7,
              ] as never,
              "circle-color": LAYER_COLORS[layerId],
              "circle-opacity": 0.86,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.8,
            },
          });
        }

        map.addSource("petroleum-related-selection", {
          type: "geojson",
          data: toFeatureCollection([]) as never,
        });

        map.addLayer({
          id: "petroleum-related-selection-line",
          type: "line",
          source: "petroleum-related-selection",
          paint: {
            "line-color": "#f97316",
            "line-width": 2,
            "line-opacity": 0.55,
          },
        });

        map.addLayer({
          id: "petroleum-related-selection-circle",
          type: "circle",
          source: "petroleum-related-selection",
          filter: ["==", ["geometry-type"], "Point"] as never,
          paint: {
            "circle-radius": 6,
            "circle-color": "#f97316",
            "circle-opacity": 0.72,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
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

        for (const layerId of ["facilities", "subsea", "terminals", "wellbores"] as const) {
          const sourceId = `petroleum-${layerId}`;
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
        }

        map.on("mousemove", handleGenericPointerMove as never);
        map.on("click", handleGenericClick as never);
        map.getCanvasContainer().addEventListener("mouseleave", clearHoverState);
        map.on("dragend", emitViewportChange);
        map.on("zoomend", emitViewportChange);

        syncLayerSources(
          map,
          featuresRef.current,
          eventsRef.current,
          relatedFeaturesRef.current,
          sourceSignatureRef,
        );
        syncSelectionSource(
          map,
          featuresRef.current.find(
            (item) => `${item.entityType}:${item.entityId}` === selectedEntityKeyRef.current,
          ) ?? null,
          sourceSignatureRef,
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

    syncLayerSources(map, features, events, relatedFeatures ?? [], sourceSignatureRef);
  }, [events, features, mapReady, relatedFeatures]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const activeFeatureLayers = new Set(features.map((feature) => feature.layerId));
    const activeEventLayers = new Set(
      events.map((event) => (event.source === "GASSCO" ? "gasscoEvents" : "regulatoryEvents")),
    );
    const zoom = currentZoom ?? map.getZoom();
    const visibilityByLayer = new Map<PetroleumLayerId, boolean>([
      ["fields", activeFeatureLayers.has("fields")],
      ["discoveries", activeFeatureLayers.has("discoveries")],
      ["licences", activeFeatureLayers.has("licences")],
      ["facilities", activeFeatureLayers.has("facilities")],
      ["subsea", activeFeatureLayers.has("subsea") && zoom >= 7.1],
      ["terminals", activeFeatureLayers.has("terminals")],
      ["tuf", activeFeatureLayers.has("tuf")],
      ["wellbores", activeFeatureLayers.has("wellbores")],
      ["surveys", activeFeatureLayers.has("surveys")],
      ["regulatoryEvents", activeEventLayers.has("regulatoryEvents")],
      ["gasscoEvents", activeEventLayers.has("gasscoEvents")],
    ]);

    const allLayerIds = [
      ...RENDERED_LAYERS.flatMap((layerId) => [
        `petroleum-${layerId}-clusters`,
        `petroleum-${layerId}-cluster-count`,
        `petroleum-${layerId}-circle`,
        `petroleum-${layerId}-fill`,
        `petroleum-${layerId}-outline`,
        `petroleum-${layerId}-line`,
      ]),
      ...EVENT_LAYERS.flatMap((layerId) => [
        `petroleum-${layerId}-clusters`,
        `petroleum-${layerId}-cluster-count`,
        `petroleum-${layerId}-circle`,
      ]),
      "petroleum-surveys-centroids-circle",
    ];

    for (const layerId of allLayerIds) {
      if (!map.getLayer(layerId)) {
        continue;
      }

      let logicalLayer: PetroleumLayerId | null = null;
      for (const candidate of [...RENDERED_LAYERS, ...EVENT_LAYERS]) {
        if (layerId.startsWith(`petroleum-${candidate}`) || (candidate === "surveys" && layerId === "petroleum-surveys-centroids-circle")) {
          logicalLayer = candidate;
          break;
        }
      }

      if (!logicalLayer) {
        continue;
      }

      map.setLayoutProperty(
        layerId,
        "visibility",
        visibilityByLayer.get(logicalLayer) ? "visible" : "none",
      );
    }
  }, [currentZoom, events, features, mapDetailMode, mapMode, mapReady]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const selectedFeature =
      features.find((item) => `${item.entityType}:${item.entityId}` === selectedEntityKey) ?? null;
    syncSelectionSource(map, selectedFeature, sourceSignatureRef);

    if (!selectedFeature) {
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
        onViewportChangeRef.current?.({
          bbox: nextBbox,
          zoom: Number(map.getZoom().toFixed(2)),
        });
      }
    });

    focusSelectedFeature(map, selectedFeature);
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
      onViewportChangeRef.current?.({
        bbox: nextBbox,
        zoom: Number(map.getZoom().toFixed(2)),
      });
    });

    map.easeTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      duration: 700,
    });
  }, [mapReady, resetViewNonce]);

  const activeHoverFeature =
    hoverState?.candidates.find((feature) => getFeatureKey(feature) === hoverState.activeFeatureKey) ?? null;
  const hoverCardStyle = React.useMemo(() => {
    if (!hoverState || !wrapperRef.current) {
      return null;
    }

    const bounds = wrapperRef.current.getBoundingClientRect();
    const cardWidth = hoverState.candidates.length > 1 ? 320 : 300;
    const left = Math.min(Math.max(hoverState.x + 16, 12), Math.max(bounds.width - cardWidth - 12, 12));
    const top = Math.min(Math.max(hoverState.y + 16, 12), Math.max(bounds.height - 220, 12));

    return {
      left,
      top,
      width: cardWidth,
    };
  }, [hoverState]);

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden ${className ?? "h-[34rem] w-full bg-[#E8EEF2]"}`}>
      <div ref={containerRef} className="h-full w-full bg-[#E8EEF2]" />
      {hoverState && hoverCardStyle ? (
        <div
          className="pointer-events-auto absolute z-[3] rounded-[1rem] border border-white/80 bg-white/95 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur"
          style={hoverCardStyle}
        >
          <div
            dangerouslySetInnerHTML={{
              __html: renderTooltipHtml(hoverState.properties, {
                overlapCount: hoverState.candidates.length,
                activeTypeLabel: activeHoverFeature ? getFeatureTypeLabel(activeHoverFeature) : undefined,
              }),
            }}
          />
          {hoverState.candidates.length > 1 ? (
            <div className="mt-3 border-t border-[rgba(15,23,42,0.08)] pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Treff under markøren
              </div>
              <div className="flex flex-wrap gap-2">
                {hoverState.candidates.slice(0, 6).map((feature) => {
                  const featureKey = getFeatureKey(feature);
                  const isActive = featureKey === hoverState.activeFeatureKey;
                  return (
                    <button
                      key={featureKey}
                      type="button"
                      onClick={() =>
                        setHoverState((current) =>
                          current
                            ? {
                                ...current,
                                activeFeatureKey: featureKey,
                                properties: getFeatureProperties(feature),
                              }
                            : current,
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-[rgba(15,23,42,0.12)] bg-white text-slate-700"
                      }`}
                    >
                      <span>{getFeatureTypeLabel(feature)}</span>
                      <span className={isActive ? "text-white/80" : "text-slate-500"}>·</span>
                      <span>{feature.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
