import {
  PetroleumEntityDetail,
  PetroleumMapFeature,
  PetroleumMetricView,
  PetroleumRateUnit,
} from "@/lib/types";

export type CompactInspectorRow = {
  label: string;
  value: string;
};

const RATE_UNIT_LABELS: Record<PetroleumRateUnit, string> = {
  boepd: "boepd",
  billSm3: "mrd. Sm3",
  msm3: "mill. Sm3",
  nok: "NOK",
};

const ENTITY_TYPE_LABELS = {
  FIELD: "Felt",
  DISCOVERY: "Funn",
  LICENCE: "Lisens",
  FACILITY: "Innretning",
  TUF: "Rørledning/TUF",
  SURVEY: "Survey",
  WELLBORE: "Brønn",
} as const;

function pickString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function pickNumber(...values: Array<number | null | undefined>) {
  for (const value of values) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      return value;
    }
  }

  return null;
}

function formatCompactNok(value?: number | null) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatOe(value?: number | null) {
  if (value === null || value === undefined) return null;
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} mill. oe`;
}

function formatMeters(value?: number | null) {
  if (value === null || value === undefined) return null;
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(value)} m`;
}

function formatAreaSqKm(value?: number | null) {
  if (value === null || value === undefined) return null;
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} km²`;
}

function formatRateOrVolume(value?: number | null, unit?: PetroleumRateUnit | null) {
  if (value === null || value === undefined || !unit) return null;
  return `${new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: unit === "boepd" ? 0 : 2,
  }).format(value)} ${RATE_UNIT_LABELS[unit]}`;
}

function formatOptionalDate(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRangeLabel(from?: string | Date | null, to?: string | Date | null) {
  const fromLabel = formatOptionalDate(from);
  const toLabel = formatOptionalDate(to);

  if (fromLabel && toLabel) {
    return `${fromLabel} - ${toLabel}`;
  }

  return fromLabel ?? toLabel ?? null;
}

function getDisplayEntityType(
  detail: PetroleumEntityDetail | null,
  selectedFeature: PetroleumMapFeature | null,
) {
  return detail?.entityType ?? selectedFeature?.entityType ?? null;
}

function buildRow(label: string, value: string | null): CompactInspectorRow | null {
  if (!value || value === "Ikke tilgjengelig") {
    return null;
  }

  return { label, value };
}

export function getCompactInspectorSubtitle(
  detail: PetroleumEntityDetail | null,
  selectedFeature: PetroleumMapFeature | null,
) {
  const entityType = getDisplayEntityType(detail, selectedFeature);
  const parts = [
    entityType ? ENTITY_TYPE_LABELS[entityType] : null,
    pickString(detail?.status ?? null, selectedFeature?.status ?? null),
    pickString(detail?.area ?? null, selectedFeature?.area ?? null),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function getCompactInspectorRows(
  detail: PetroleumEntityDetail | null,
  selectedFeature: PetroleumMapFeature | null,
  options: {
    selectedMetricLabel: string;
    selectedMetricUnit?: PetroleumRateUnit | null;
    selectedView: PetroleumMetricView;
  },
) {
  const entityType = getDisplayEntityType(detail, selectedFeature);
  const selectedMetricValue =
    pickNumber(
      selectedFeature?.selectedProductionValue ?? null,
      options.selectedView === "rate"
        ? detail?.timeseries.at(-1)?.selectedRate ?? null
        : detail?.timeseries.at(-1)?.selectedValue ?? detail?.timeseries.at(-1)?.oe ?? null,
    );
  const selectedMetricUnit =
    selectedFeature?.selectedProductionUnit ??
    detail?.timeseries.at(-1)?.selectedUnit ??
    options.selectedMetricUnit ??
    null;
  const areaLabel = pickString(detail?.area ?? null, selectedFeature?.area ?? null);
  const statusLabel = pickString(detail?.status ?? null, selectedFeature?.status ?? null);
  const operatorLabel = pickString(
    detail?.operator?.companyName ?? null,
    selectedFeature?.operator?.companyName ?? null,
    selectedFeature?.operatorSummary ?? null,
  );

  const rows: Array<CompactInspectorRow | null> = [];

  switch (entityType) {
    case "FIELD":
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow("Hydrokarbon", pickString(detail?.hcType ?? null, selectedFeature?.hcType ?? null)),
        buildRow("Status", statusLabel),
        buildRow("Område", areaLabel),
        buildRow(options.selectedMetricLabel, formatRateOrVolume(selectedMetricValue, selectedMetricUnit)),
        buildRow("Gjenværende", formatOe(pickNumber(detail?.reserve?.remainingOe ?? null, selectedFeature?.remainingOe ?? null))),
        buildRow(
          "Forv. investering",
          formatCompactNok(
            pickNumber(
              detail?.investment?.expectedFutureInvestmentNok ?? null,
              selectedFeature?.expectedFutureInvestmentNok ?? null,
            ),
          ),
        ),
      );
      break;
    case "DISCOVERY":
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow("Hydrokarbon", pickString(detail?.hcType ?? null, selectedFeature?.hcType ?? null)),
        buildRow("Status", statusLabel),
        buildRow("Område", areaLabel),
        buildRow(
          "Relatert felt",
          pickString(
            (typeof detail?.metadata.fieldName === "string" ? detail.metadata.fieldName : null) ??
              null,
            selectedFeature?.relatedFieldName ?? null,
          ),
        ),
      );
      break;
    case "LICENCE":
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow("Status", statusLabel),
        buildRow("Fase", pickString(detail?.phase ?? null)),
        buildRow("Område", areaLabel),
        buildRow("Areal", formatAreaSqKm(pickNumber(selectedFeature?.currentAreaSqKm ?? null))),
        buildRow(
          "Overføringer",
          (() => {
            const transferCount = pickNumber(selectedFeature?.transferCount ?? null);
            return transferCount === null ? null : new Intl.NumberFormat("nb-NO").format(transferCount);
          })(),
        ),
      );
      break;
    case "FACILITY":
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow(
          "Type",
          pickString(
            (typeof detail?.metadata.mainType === "string" ? detail.metadata.mainType : null) ?? null,
            (typeof detail?.metadata.subType === "string" ? detail.metadata.subType : null) ?? null,
            selectedFeature?.facilityKind ?? null,
          ),
        ),
        buildRow("Fase/status", pickString(detail?.phase ?? null, statusLabel)),
        buildRow("Tilhører", areaLabel),
      );
      break;
    case "TUF":
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow("Medium", pickString(detail?.hcType ?? null, selectedFeature?.hcType ?? null)),
        buildRow("Fase", pickString(detail?.phase ?? null, statusLabel)),
        buildRow("Tilhører", areaLabel),
      );
      break;
    case "SURVEY":
      rows.push(
        buildRow(
          "Rapportert av",
          pickString(
            typeof detail?.metadata.companyName === "string" ? detail.metadata.companyName : null,
            selectedFeature?.companyName ?? null,
          ),
        ),
        buildRow(
          "Kategori",
          pickString(
            typeof detail?.metadata.category === "string" ? detail.metadata.category : null,
            selectedFeature?.category ?? null,
          ),
        ),
        buildRow(
          "Subtype",
          pickString(
            typeof detail?.metadata.subType === "string" ? detail.metadata.subType : null,
            selectedFeature?.subType ?? null,
          ),
        ),
        buildRow(
          "År",
          (() => {
            const year = pickNumber(selectedFeature?.surveyYear ?? null);
            return year === null ? null : new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(year);
          })(),
        ),
        buildRow(
          "Planperiode",
          formatDateRangeLabel(
            typeof detail?.metadata.plannedFromDate === "string" ? detail.metadata.plannedFromDate : null,
            typeof detail?.metadata.plannedToDate === "string" ? detail.metadata.plannedToDate : null,
          ),
        ),
        buildRow(
          "Gjennomført",
          formatDateRangeLabel(
            typeof detail?.metadata.startedAt === "string" ? detail.metadata.startedAt : null,
            typeof detail?.metadata.finalizedAt === "string" ? detail.metadata.finalizedAt : null,
          ),
        ),
      );
      break;
    case "WELLBORE":
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow(
          "Brønntype",
          pickString(
            typeof detail?.metadata.wellType === "string" ? detail.metadata.wellType : null,
            selectedFeature?.wellType ?? null,
          ),
        ),
        buildRow(
          "Formål",
          pickString(
            typeof detail?.metadata.purpose === "string" ? detail.metadata.purpose : null,
            selectedFeature?.purpose ?? null,
          ),
        ),
        buildRow(
          "Felt",
          pickString(
            typeof detail?.metadata.fieldName === "string" ? detail.metadata.fieldName : null,
            selectedFeature?.relatedFieldName ?? null,
          ),
        ),
        buildRow(
          "Vanndyp",
          formatMeters(
            pickNumber(
              typeof detail?.metadata.waterDepth === "number" ? detail.metadata.waterDepth : null,
              selectedFeature?.waterDepth ?? null,
            ),
          ),
        ),
        buildRow(
          "Totaldybde",
          formatMeters(
            pickNumber(
              typeof detail?.metadata.totalDepth === "number" ? detail.metadata.totalDepth : null,
              selectedFeature?.totalDepth ?? null,
            ),
          ),
        ),
      );
      break;
    default:
      rows.push(
        buildRow("Operatør", operatorLabel),
        buildRow("Status", statusLabel),
        buildRow("Område", areaLabel),
      );
      break;
  }

  return rows.filter((row): row is CompactInspectorRow => Boolean(row));
}
