"use client";

import * as React from "react";

export type CompanyMapFeature = {
  kind: "CLUSTER" | "ADDRESS";
  id: string;
  officialAddressId?: string;
  latitude: number;
  longitude: number;
  companyCount: number;
  addressCount?: number;
};

export type CompanyMapViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

const MAP_SOURCE_ID = "company-map-features";
const MAP_CIRCLE_LAYER_ID = "company-map-circles";

function asGeoJson(
  features: CompanyMapFeature[],
  selectedAddressId: string | null,
) {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [feature.longitude, feature.latitude],
      },
      properties: {
        ...feature,
        selected:
          feature.kind === "ADDRESS" &&
          feature.officialAddressId === selectedAddressId,
      },
    })),
  };
}

function readViewport(map: import("maplibre-gl").Map): CompanyMapViewport {
  const bounds = map.getBounds();
  return {
    west: Number(bounds.getWest().toFixed(4)),
    south: Number(bounds.getSouth().toFixed(4)),
    east: Number(bounds.getEast().toFixed(4)),
    north: Number(bounds.getNorth().toFixed(4)),
    zoom: Number(map.getZoom().toFixed(2)),
  };
}

export function CompanyMapMap({
  features,
  selectedAddressId,
  dataState,
  onSelectAddress,
  onViewportChange,
}: {
  features: CompanyMapFeature[];
  selectedAddressId: string | null;
  dataState: "LOADING" | "READY" | "UNPUBLISHED" | "ERROR";
  onSelectAddress: (officialAddressId: string) => void;
  onViewportChange: (viewport: CompanyMapViewport) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<import("maplibre-gl").Map | null>(null);
  const featuresRef = React.useRef(features);
  const selectedAddressIdRef = React.useRef(selectedAddressId);
  const onSelectAddressRef = React.useRef(onSelectAddress);
  const onViewportChangeRef = React.useRef(onViewportChange);
  const [mapStatus, setMapStatus] = React.useState<
    "LOADING" | "READY" | "ERROR"
  >("LOADING");

  React.useEffect(() => {
    featuresRef.current = features;
    selectedAddressIdRef.current = selectedAddressId;
    const source = mapRef.current?.getSource(
      MAP_SOURCE_ID,
    ) as import("maplibre-gl").GeoJSONSource | undefined;
    source?.setData(asGeoJson(features, selectedAddressId) as never);
  }, [features, selectedAddressId]);

  React.useEffect(() => {
    onSelectAddressRef.current = onSelectAddress;
  }, [onSelectAddress]);

  React.useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  React.useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!containerRef.current || mapRef.current) return;

      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const accent =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--px-accent")
            .trim() || "#192536";
        const map = new maplibre.Map({
          container: containerRef.current,
          center: [10, 64.2],
          zoom: 4,
          minZoom: 3,
          maxZoom: 18,
          style: {
            version: 8,
            sources: {
              kartverket: {
                type: "raster",
                tiles: [
                  "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
                ],
                tileSize: 256,
                attribution: "© Kartverket",
              },
            },
            layers: [
              { id: "kartverket", type: "raster", source: "kartverket" },
            ],
          },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl(), "top-right");

        map.on("error", () => {
          if (!map.isStyleLoaded()) setMapStatus("ERROR");
        });

        map.on("load", () => {
          setMapStatus("READY");
          map.addSource(MAP_SOURCE_ID, {
            type: "geojson",
            data: asGeoJson(
              featuresRef.current,
              selectedAddressIdRef.current,
            ) as never,
          });
          map.addLayer({
            id: MAP_CIRCLE_LAYER_ID,
            type: "circle",
            source: MAP_SOURCE_ID,
            paint: {
              "circle-color": [
                "case",
                ["boolean", ["get", "selected"], false],
                "#111827",
                accent,
              ],
              "circle-opacity": 0.9,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "companyCount"],
                1,
                12,
                100,
                20,
                1_000,
                30,
              ],
              "circle-stroke-color": "rgba(255,255,255,0.9)",
              "circle-stroke-width": 2,
            },
          });
          onViewportChangeRef.current(readViewport(map));
        });

        map.on("moveend", () => {
          onViewportChangeRef.current(readViewport(map));
        });
        map.on("mouseenter", MAP_CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", MAP_CIRCLE_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", MAP_CIRCLE_LAYER_ID, (event) => {
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          const coordinates = event.features?.[0]?.geometry;
          if (properties.kind === "CLUSTER" && coordinates?.type === "Point") {
            map.easeTo({
              center: coordinates.coordinates as [number, number],
              zoom: Math.min(9, map.getZoom() + 2),
            });
            return;
          }
          if (
            properties.kind === "ADDRESS" &&
            typeof properties.officialAddressId === "string"
          ) {
            onSelectAddressRef.current(properties.officialAddressId);
          }
        });
      } catch {
        if (!cancelled) setMapStatus("ERROR");
      }
    }

    void boot();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="company-map-shell relative h-[520px] overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-subtle)]">
      <div
        ref={containerRef}
        role="region"
        aria-label="Interactive map of registered companies"
        aria-describedby="company-map-instructions"
        className="h-full w-full"
      />
      {mapStatus !== "ERROR" &&
      dataState !== "ERROR" &&
      dataState !== "UNPUBLISHED" &&
      (mapStatus === "LOADING" || dataState === "LOADING") ? (
        <p
          role="status"
          className="absolute bottom-4 left-4 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] p-3 text-sm text-[var(--px-muted)]"
        >
          Loading addresses in this view…
        </p>
      ) : null}
      {mapStatus === "READY" && dataState === "READY" && features.length === 0 ? (
        <p className="absolute bottom-4 left-4 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] p-3 text-sm text-[var(--px-muted)]">
          No mapped addresses match this view and filter.
        </p>
      ) : null}
      {mapStatus !== "ERROR" && dataState === "UNPUBLISHED" ? (
        <p className="absolute bottom-4 left-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Company points will appear after the complete snapshot is published.
        </p>
      ) : null}
      {dataState === "ERROR" && mapStatus !== "ERROR" ? (
        <p role="alert" className="absolute bottom-4 left-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          Company points could not be loaded. Use the ranked list or try again
          later.
        </p>
      ) : null}
      {mapStatus === "ERROR" ? (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-4 rounded-xl border border-rose-200 bg-[var(--px-surface)] p-4 text-sm text-rose-800"
        >
          The map could not be loaded. The complete company list remains
          available beside the map.
        </p>
      ) : null}
    </div>
  );
}
