import {
  fetchGridConnectionCases,
  GridConnectionCase,
  QUEUE_REPORT,
  RESERVED_REPORT,
  STATNETT_GRID_CONNECTION_SOURCE_URL,
  StatnettReportConfig,
} from "@/integrations/statnett/statnett-powerbi";
import { GridConnectionRecord, GridConnectionStatus } from "@/lib/types";

const SOURCE_SYSTEM = "STATNETT";
const SOURCE_ENTITY_TYPE = "GRID_CONNECTION_CASE";

function epochToIso(value: number | null) {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function unique(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function caseToRecord(
  gridCase: GridConnectionCase,
  status: GridConnectionStatus,
  fetchedAt: Date,
): GridConnectionRecord | null {
  if (!gridCase.capacityMw || gridCase.capacityMw <= 0) return null;

  // "Sluttkunde" is the applicant company (e.g. Aker Nscale AS); "Statnetts kunde" is the
  // responsible grid company. A case is relevant to whichever of the two a company page matches.
  const companyName = gridCase.endCustomer ?? gridCase.gridOwner;
  const reservedAt = status === "RESERVED" ? epochToIso(gridCase.primaryDate) : null;

  return {
    id: `${SOURCE_SYSTEM}:${status}:${gridCase.saksnr ?? gridCase.tilkoSaksnr ?? companyName ?? "ukjent"}`,
    companyOrgNumber: null, // The public Statnett feed carries no organisation number.
    companyName,
    projectName: null,
    status,
    capacityMw: gridCase.capacityMw,
    area: gridCase.priceArea,
    municipality: null,
    county: gridCase.areaPlan,
    networkLevel: null,
    connectionPoint: gridCase.station,
    queuePosition: null,
    expectedConnectionDate: epochToIso(gridCase.plannedConnectionDate),
    reservedAt,
    connectedAt: null,
    specialTerms: null,
    detailUrl: null,
    sourceUrl: STATNETT_GRID_CONNECTION_SOURCE_URL,
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: SOURCE_ENTITY_TYPE,
    sourceId: gridCase.saksnr ?? gridCase.tilkoSaksnr ?? `${status}:${companyName ?? "ukjent"}`,
    fetchedAt,
    normalizedAt: fetchedAt,
    matchNames: unique([gridCase.endCustomer, gridCase.gridOwner]),
    rawPayload: gridCase,
  };
}

async function loadReport(
  config: StatnettReportConfig,
  status: GridConnectionStatus,
  fetchedAt: Date,
): Promise<GridConnectionRecord[]> {
  const cases = await fetchGridConnectionCases(config);
  return cases
    .map((gridCase) => caseToRecord(gridCase, status, fetchedAt))
    .filter((record): record is GridConnectionRecord => record !== null);
}

export class StatnettGridConnectionProvider {
  async listGridConnections(): Promise<GridConnectionRecord[]> {
    const fetchedAt = new Date();
    const [queue, reserved] = await Promise.all([
      loadReport(QUEUE_REPORT, "QUEUE", fetchedAt),
      loadReport(RESERVED_REPORT, "RESERVED", fetchedAt),
    ]);
    return [...queue, ...reserved];
  }
}
