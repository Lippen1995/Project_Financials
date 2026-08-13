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
const NORWAY_BOUNDS: [[number, number], [number, number]] = [
  [3, 57.6],
  [31, 71.4],
];

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

function StatusPill({
  children,
  tone = "neutral",
  role,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "error";
  role?: "status" | "alert";
}) {
  const toneClass = {
    neutral:
      "border-[var(--px-border)] bg-[var(--px-surface-strong)] text-[var(--px-muted)]",
    warning:
      "border-[var(--px-warning-border)] bg-[var(--px-warning-soft)] text-[var(--px-warning)]",
    error:
      "border-[var(--px-error-border)] bg-[var(--px-error-soft)] text-[var(--px-error)]",
  }[tone];
  return (
    <p
      role={role}
      className={`pointer-events-auto absolute bottom-[130px] left-4 z-[6] max-w-[min(420px,calc(100%-2rem))] rounded-xl border px-3 py-2.5 text-[12.5px] shadow-sm ${toneClass}`}
    >
      {children}
    </p>
  );
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
    let resizeObserver: ResizeObserver | null = null;

    async function boot() {
      if (!containerRef.current || mapRef.current) return;

      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const rootStyle = getComputedStyle(document.documentElement);
        const accent =
          rootStyle.getPropertyValue("--px-accent").trim() || "#00668a";
        const selected =
          rootStyle.getPropertyValue("--px-text").trim() || "#111827";
        const map = new maplibre.Map({
          container: containerRef.current,
          center: [13, 65.2],
          zoom: 4.1,
          minZoom: 3.4,
          maxZoom: 18,
          attributionControl: false,
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
        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "top-right",
        );
        map.addControl(
          new maplibre.AttributionControl({ compact: true }),
          "bottom-left",
        );

        map.on("error", () => {
          if (!map.isStyleLoaded()) setMapStatus("ERROR");
        });

        // "load" waits for the first tiles to arrive, so a slow or unreachable tile host would
        // leave the map permanently in its loading state and never publish a viewport. The style
        // is inline, so everything this map needs is ready as soon as the style is parsed.
        const applyLayers = () => {
          if (cancelled || map.getSource(MAP_SOURCE_ID)) return;
          setMapStatus("READY");
          map.resize();
          map.fitBounds(NORWAY_BOUNDS, { padding: 36, duration: 0 });
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
              "circle-color": accent,
              "circle-opacity": 0.82,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "companyCount"],
                1,
                7,
                10,
                12,
                100,
                20,
                1_000,
                30,
              ],
              "circle-stroke-color": [
                "case",
                ["boolean", ["get", "selected"], false],
                selected,
                "rgba(255,255,255,0.95)",
              ],
              "circle-stroke-width": [
                "case",
                ["boolean", ["get", "selected"], false],
                3,
                1.5,
              ],
            },
          });
          onViewportChangeRef.current(readViewport(map));
        };
        map.on("style.load", applyLayers);
        if (map.isStyleLoaded()) applyLayers();

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

        try {
          resizeObserver = new ResizeObserver(() => {
            if (mapRef.current === map) map.resize();
          });
          resizeObserver.observe(containerRef.current);
        } catch {
          // A browser without ResizeObserver still gets the initial layout.
        }
      } catch {
        if (!cancelled) setMapStatus("ERROR");
      }
    }

    void boot();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      resizeObserver = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        role="region"
        aria-label="Interaktivt kart over registrerte selskaper"
        aria-describedby="company-map-instructions"
        className="company-map-shell absolute inset-0"
      />
      {mapStatus !== "ERROR" &&
      dataState !== "ERROR" &&
      dataState !== "UNPUBLISHED" &&
      (mapStatus === "LOADING" || dataState === "LOADING") ? (
        <StatusPill role="status">Laster adresser i utsnittet …</StatusPill>
      ) : null}
      {mapStatus === "READY" &&
      dataState === "READY" &&
      features.length === 0 ? (
        <StatusPill>
          Ingen kartfestede adresser matcher dette utsnittet og filteret.
        </StatusPill>
      ) : null}
      {mapStatus !== "ERROR" && dataState === "UNPUBLISHED" ? (
        <StatusPill tone="warning">
          Kartpunkter vises når det komplette datasettet er publisert.
        </StatusPill>
      ) : null}
      {dataState === "ERROR" && mapStatus !== "ERROR" ? (
        <StatusPill tone="error" role="alert">
          Kartpunktene kunne ikke lastes. Bruk resultatlisten under kartet, eller
          prøv igjen senere.
        </StatusPill>
      ) : null}
      {mapStatus === "ERROR" ? (
        <StatusPill tone="error" role="alert">
          Kartet kunne ikke lastes. Den komplette selskapslisten er fortsatt
          tilgjengelig under kartet.
        </StatusPill>
      ) : null}
    </>
  );
}
