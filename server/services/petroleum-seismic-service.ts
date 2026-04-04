import { PetroleumSurvey, PetroleumWellbore } from "@prisma/client";

import {
  getPetroleumCoreDataset,
  getPetroleumMarketFeatures,
  getPetroleumEntityDetailById,
} from "@/server/services/petroleum-market-service";
import {
  getPetroleumSyncState,
} from "@/server/persistence/petroleum-market-repository";
import {
  PetroleumFilterOption,
  PetroleumLayerId,
  PetroleumMarketFilters,
  PetroleumMapFeature,
  PetroleumSeismicHighlight,
  PetroleumSeismicSummaryResponse,
  PetroleumSeismicTableResponse,
  PetroleumSourceStatus,
} from "@/lib/types";

const SODIR_SYNC_KEY = "petroleum-core";

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function parseBbox(value: unknown): [number, number, number, number] | null {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === "number")
    ? [value[0], value[1], value[2], value[3]]
    : null;
}

function bboxIntersects(
  candidate: [number, number, number, number] | null,
  target: [number, number, number, number] | null | undefined,
) {
  if (!candidate || !target) {
    return true;
  }

  return !(
    candidate[2] < target[0] ||
    candidate[0] > target[2] ||
    candidate[3] < target[1] ||
    candidate[1] > target[3]
  );
}

function getSurveyReferenceYear(item: PetroleumSurvey) {
  return (
    item.finalizedAt?.getUTCFullYear() ??
    item.startedAt?.getUTCFullYear() ??
    item.plannedFromDate?.getUTCFullYear() ??
    item.plannedToDate?.getUTCFullYear() ??
    null
  );
}

function matchesQuery(name: string, query?: string) {
  if (!query) {
    return true;
  }

  return normalizeText(name).includes(normalizeText(query));
}

function matchesArray(values: Array<string | null | undefined>, selected?: string[]) {
  if (!selected?.length) {
    return true;
  }

  const normalizedSelected = selected.map((entry) => normalizeText(entry));
  return values.some((value) => normalizedSelected.includes(normalizeText(value)));
}

function matchesOperator(operatorId: number | null | undefined, selected?: string[]) {
  if (!selected?.length) {
    return true;
  }

  return operatorId !== null && operatorId !== undefined && selected.includes(String(operatorId));
}

function filterSurveys(surveys: PetroleumSurvey[], filters: PetroleumMarketFilters) {
  return surveys.filter((item) => {
    if (!matchesQuery(item.name, filters.query)) return false;
    if (!bboxIntersects(parseBbox(item.bbox), filters.bbox)) return false;
    if (!matchesArray([item.geographicalArea], filters.areas)) return false;
    if (!matchesOperator(item.companyNpdId, filters.operatorIds)) return false;
    if (!matchesArray([item.status], filters.surveyStatuses?.length ? filters.surveyStatuses : filters.status)) return false;
    if (!matchesArray([item.category, item.mainType, item.subType], filters.surveyCategories)) return false;

    const surveyYear = getSurveyReferenceYear(item);
    if (filters.surveyYearFrom && (!surveyYear || surveyYear < filters.surveyYearFrom)) return false;
    if (filters.surveyYearTo && (!surveyYear || surveyYear > filters.surveyYearTo)) return false;

    return true;
  });
}

function filterWellbores(wellbores: PetroleumWellbore[], filters: PetroleumMarketFilters) {
  return wellbores.filter((item) => {
    if (!matchesQuery(item.name, filters.query)) return false;
    if (!bboxIntersects(parseBbox(item.bbox), filters.bbox)) return false;
    if (!matchesArray([item.mainArea], filters.areas)) return false;
    if (!matchesOperator(item.drillingOperatorNpdCompanyId, filters.operatorIds)) return false;
    if (!matchesArray([item.status, item.purpose], filters.status)) return false;
    return true;
  });
}

function toOptions(map: Map<string, number>): PetroleumFilterOption[] {
  return [...map.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nb-NO"));
}

async function getSeismicSourceStatus(): Promise<PetroleumSourceStatus[]> {
  const state = await getPetroleumSyncState(SODIR_SYNC_KEY);
  return [
    {
      source: "SODIR",
      available: Boolean(state?.lastSuccessAt),
      message:
        state?.status === "ERROR"
          ? state.errorMessage ?? "Siste synk feilet."
          : "Survey- og wellbore-data hentes fra SODIRs åpne data og FactPages.",
      lastSuccessAt: state?.lastSuccessAt ?? null,
    },
  ];
}

export async function getPetroleumSeismicFeatures(
  filters: PetroleumMarketFilters,
): Promise<PetroleumMapFeature[]> {
  const layers = [...new Set([...(filters.layers ?? []), "surveys", "wellbores"])] as PetroleumLayerId[];
  return getPetroleumMarketFeatures({ ...filters, layers });
}

export async function getPetroleumSeismicSummary(
  filters: PetroleumMarketFilters,
): Promise<PetroleumSeismicSummaryResponse> {
  const [core, sourceStatus] = await Promise.all([
    getPetroleumCoreDataset(),
    getSeismicSourceStatus(),
  ]);
  const surveys = core.surveys;
  const wellbores = core.wellbores;

  const filteredSurveys = filterSurveys(surveys, filters);
  const filteredWellbores = filterWellbores(wellbores, filters);

  const categoryCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  const operatorCounts = new Map<string, { label: string; count: number }>();
  const yearCounts = new Map<string, number>();

  for (const survey of filteredSurveys) {
    for (const value of [survey.category, survey.mainType, survey.subType]) {
      if (value?.trim()) {
        categoryCounts.set(value, (categoryCounts.get(value) ?? 0) + 1);
      }
    }

    if (survey.status?.trim()) {
      statusCounts.set(survey.status, (statusCounts.get(survey.status) ?? 0) + 1);
    }
    if (survey.geographicalArea?.trim()) {
      areaCounts.set(survey.geographicalArea, (areaCounts.get(survey.geographicalArea) ?? 0) + 1);
    }
    if (survey.companyNpdId && survey.companyName) {
      const key = String(survey.companyNpdId);
      operatorCounts.set(key, {
        label: survey.companyName,
        count: (operatorCounts.get(key)?.count ?? 0) + 1,
      });
    }

    const year = getSurveyReferenceYear(survey);
    if (year) {
      const key = String(year);
      yearCounts.set(key, (yearCounts.get(key) ?? 0) + 1);
    }
  }

  for (const wellbore of filteredWellbores) {
    if (wellbore.mainArea?.trim()) {
      areaCounts.set(wellbore.mainArea, (areaCounts.get(wellbore.mainArea) ?? 0) + 1);
    }
    if (wellbore.drillingOperatorNpdCompanyId && wellbore.drillingOperatorName) {
      const key = String(wellbore.drillingOperatorNpdCompanyId);
      operatorCounts.set(key, {
        label: wellbore.drillingOperatorName,
        count: (operatorCounts.get(key)?.count ?? 0) + 1,
      });
    }
  }

  const recentItems: PetroleumSeismicHighlight[] = [
    ...filteredSurveys.map((survey) => ({
      entityType: "SURVEY" as const,
      entityId: survey.slug,
      npdId: survey.npdId,
      name: survey.name,
      status: survey.status,
      category: survey.mainType ?? survey.category,
      area: survey.geographicalArea,
      operatorName: survey.companyName,
      year: getSurveyReferenceYear(survey),
    })),
    ...filteredWellbores.map((wellbore) => ({
      entityType: "WELLBORE" as const,
      entityId: wellbore.slug,
      npdId: wellbore.npdId,
      name: wellbore.name,
      status: wellbore.status ?? wellbore.purpose,
      category: wellbore.wellType ?? wellbore.purpose,
      area: wellbore.mainArea,
      operatorName: wellbore.drillingOperatorName,
      year: wellbore.entryDate?.getUTCFullYear() ?? wellbore.completionDate?.getUTCFullYear() ?? null,
    })),
  ]
    .sort((left, right) => (right.year ?? 0) - (left.year ?? 0) || left.name.localeCompare(right.name, "nb-NO"))
    .slice(0, 8);

  return {
    kpis: {
      surveyCount: filteredSurveys.length,
      plannedSurveyCount: filteredSurveys.filter((item) => normalizeText(item.status).includes("planned")).length,
      ongoingSurveyCount: filteredSurveys.filter((item) => normalizeText(item.status).includes("ongoing")).length,
      completedSurveyCount: filteredSurveys.filter((item) => normalizeText(item.status).includes("completed")).length,
      wellboreCount: filteredWellbores.length,
      explorationWellCount: filteredWellbores.filter((item) => {
        const wellType = normalizeText(item.wellType);
        const purpose = normalizeText(item.purpose);
        return (
          wellType.includes("exploration") ||
          purpose.includes("wildcat") ||
          purpose.includes("appraisal")
        );
      }).length,
      latestSurveyYear:
        filteredSurveys.reduce((latest, item) => Math.max(latest, getSurveyReferenceYear(item) ?? 0), 0) || null,
    },
    filterOptions: {
      categories: toOptions(categoryCounts),
      statuses: toOptions(statusCounts),
      areas: toOptions(areaCounts),
      operators: [...operatorCounts.entries()]
        .map(([value, item]) => ({ value, label: item.label, count: item.count }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nb-NO")),
      years: toOptions(yearCounts).sort((left, right) => Number(right.value) - Number(left.value)),
    },
    sourceStatus,
    recentItems,
  };
}

export async function getPetroleumSeismicTable(
  filters: PetroleumMarketFilters,
): Promise<PetroleumSeismicTableResponse> {
  const core = await getPetroleumCoreDataset();
  const surveys = core.surveys;
  const wellbores = core.wellbores;
  const filteredSurveys = filterSurveys(surveys, filters);
  const filteredWellbores = filterWellbores(wellbores, filters);
  const page = filters.page ?? 0;
  const size = filters.size ?? 25;

  const items = [
    ...filteredSurveys.map((survey) => ({
      entityType: "SURVEY" as const,
      entityId: survey.slug,
      npdId: survey.npdId,
      name: survey.name,
      status: survey.status,
      category: survey.mainType ?? survey.category ?? survey.subType,
      area: survey.geographicalArea,
      operatorName: survey.companyName,
      year: getSurveyReferenceYear(survey),
      relatedFieldName: null,
      waterDepth: null,
      totalDepth: null,
      factPageUrl: survey.factPageUrl,
    })),
    ...filteredWellbores.map((wellbore) => ({
      entityType: "WELLBORE" as const,
      entityId: wellbore.slug,
      npdId: wellbore.npdId,
      name: wellbore.name,
      status: wellbore.status ?? wellbore.purpose,
      category: wellbore.wellType ?? wellbore.purpose,
      area: wellbore.mainArea,
      operatorName: wellbore.drillingOperatorName,
      year: wellbore.entryDate?.getUTCFullYear() ?? wellbore.completionDate?.getUTCFullYear() ?? null,
      relatedFieldName: wellbore.fieldName ?? wellbore.discoveryName,
      waterDepth: wellbore.waterDepth,
      totalDepth: wellbore.totalDepth,
      factPageUrl: wellbore.factPageUrl,
    })),
  ].sort((left, right) => (right.year ?? 0) - (left.year ?? 0) || left.name.localeCompare(right.name, "nb-NO"));

  return {
    items: items.slice(page * size, page * size + size),
    total: items.length,
    page,
    size,
  };
}

export async function getPetroleumSeismicEntityDetailById(entityType: string, id: string) {
  const detail = await getPetroleumEntityDetailById(entityType, id);
  if (!detail) {
    return null;
  }

  return detail.entityType === "SURVEY" || detail.entityType === "WELLBORE" ? detail : null;
}
