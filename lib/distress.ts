import {
  DistressAssetSnapshot,
  DistressFinancialTrend,
  DistressStatus,
  NormalizedDistressProfile,
  NormalizedFinancialStatement,
  NormalizedIndustryCode,
} from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function readDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function getAtPath(payload: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, payload);
}

function toNumber(value: unknown) {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/\s+/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstNumber(payload: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = toNumber(getAtPath(payload, path));
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export const DISTRESS_STATUS_LABELS: Record<DistressStatus, string> = {
  RECONSTRUCTION: "Rekonstruksjon",
  BANKRUPTCY: "Konkurs",
  LIQUIDATION: "Avvikling",
  FORCED_PROCESS: "Tvangsprosess",
  FOREIGN_INSOLVENCY: "Utenlandsk insolvens",
  OTHER_DISTRESS: "Annen distress",
};

export function getDistressStatusLabel(status: DistressStatus) {
  return DISTRESS_STATUS_LABELS[status];
}

export function getSectorCodeFromIndustryCode(code?: string | null) {
  if (!code) {
    return null;
  }

  const normalized = code.replace(/\D/g, "");
  return normalized.length >= 2 ? normalized.slice(0, 2) : null;
}

export function calculateDaysInStatus(statusStartedAt?: Date | null, now = new Date()) {
  if (!statusStartedAt) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - statusStartedAt.getTime()) / MS_PER_DAY));
}

export function deriveDistressStatus(payload: Record<string, unknown>): DistressStatus | null {
  const bankruptcyDate = readDate(payload.konkursdato);
  const liquidationDate = readDate(payload.underAvviklingDato);
  const forcedProcessDate =
    readDate(payload.tvangsavvikletPgaManglendeSlettingDato) ??
    readDate(payload.tvangsopplostPgaManglendeDagligLederDato) ??
    readDate(payload.tvangsopplostPgaManglendeRevisorDato) ??
    readDate(payload.tvangsopplostPgaManglendeRegnskapDato) ??
    readDate(payload.tvangsopplostPgaMangelfulltStyreDato);
  const reconstructionDate = readDate(payload.underRekonstruksjonsforhandlingDato);
  const foreignInsolvencyDate = readDate(payload.underUtenlandskInsolvensbehandlingDato);

  if (readBoolean(payload.konkurs) || readBoolean(payload.underKonkursbehandling) || bankruptcyDate) {
    return "BANKRUPTCY";
  }

  if (readBoolean(payload.underTvangsavviklingEllerTvangsopplosning) || forcedProcessDate) {
    return "FORCED_PROCESS";
  }

  if (readBoolean(payload.underAvvikling) || liquidationDate) {
    return "LIQUIDATION";
  }

  if (reconstructionDate) {
    return "RECONSTRUCTION";
  }

  if (foreignInsolvencyDate) {
    return "FOREIGN_INSOLVENCY";
  }

  return null;
}

export function isDistressPayload(payload: Record<string, unknown>) {
  return deriveDistressStatus(payload) !== null;
}

export function buildDistressProfileFromPayload(input: {
  payload: Record<string, unknown>;
  orgNumber: string;
  fetchedAt: Date;
  normalizedAt: Date;
  lastAnnouncementPublishedAt?: Date | null;
  lastAnnouncementTitle?: string | null;
}): NormalizedDistressProfile | null {
  const distressStatus = deriveDistressStatus(input.payload);
  if (!distressStatus) {
    return null;
  }

  const bankruptcyDate = readDate(input.payload.konkursdato);
  const liquidationDate = readDate(input.payload.underAvviklingDato);
  const forcedProcessDate =
    readDate(input.payload.tvangsavvikletPgaManglendeSlettingDato) ??
    readDate(input.payload.tvangsopplostPgaManglendeDagligLederDato) ??
    readDate(input.payload.tvangsopplostPgaManglendeRevisorDato) ??
    readDate(input.payload.tvangsopplostPgaManglendeRegnskapDato) ??
    readDate(input.payload.tvangsopplostPgaMangelfulltStyreDato);
  const reconstructionDate = readDate(input.payload.underRekonstruksjonsforhandlingDato);
  const foreignInsolvencyDate = readDate(input.payload.underUtenlandskInsolvensbehandlingDato);
  const statusObservedAt = input.fetchedAt;

  const statusStartedAt =
    (distressStatus === "BANKRUPTCY" ? bankruptcyDate : null) ??
    (distressStatus === "RECONSTRUCTION" ? reconstructionDate : null) ??
    (distressStatus === "FORCED_PROCESS" ? forcedProcessDate : null) ??
    (distressStatus === "LIQUIDATION" ? liquidationDate : null) ??
    (distressStatus === "FOREIGN_INSOLVENCY" ? foreignInsolvencyDate : null) ??
    statusObservedAt;

  return {
    distressStatus,
    statusStartedAt,
    statusObservedAt,
    daysInStatus: calculateDaysInStatus(statusStartedAt, input.fetchedAt),
    bankruptcyDate,
    liquidationDate,
    forcedProcessDate,
    reconstructionDate,
    foreignInsolvencyDate,
    lastAnnouncementPublishedAt: input.lastAnnouncementPublishedAt ?? null,
    lastAnnouncementTitle: input.lastAnnouncementTitle ?? null,
    sourceSystem: "BRREG",
    sourceEntityType: "distressProfile",
    sourceId: input.orgNumber,
    fetchedAt: input.fetchedAt,
    normalizedAt: input.normalizedAt,
    rawPayload: input.payload,
  };
}

export function extractInterestBearingDebt(payload: Record<string, unknown>) {
  return firstNumber(payload, [
    "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.gjeldTilKredittinstitusjoner",
    "egenkapitalGjeld.gjeldOversikt.langsiktigGjeld.obligasjonslaan",
  ]);
}

export function calculateEquityRatio(equity?: number | null, assets?: number | null) {
  if (
    equity === null ||
    equity === undefined ||
    assets === null ||
    assets === undefined ||
    assets === 0
  ) {
    return null;
  }

  return Number((((equity / assets) * 100) || 0).toFixed(2));
}

export function extractAssetSnapshot(statement?: NormalizedFinancialStatement | null): DistressAssetSnapshot {
  const payload =
    typeof statement?.rawPayload === "object" && statement.rawPayload
      ? (statement.rawPayload as Record<string, unknown>)
      : {};

  return {
    assets: statement?.assets ?? null,
    fixedAssets: firstNumber(payload, ["eiendeler.anleggsmidler.sumAnleggsmidler"]),
    inventory: firstNumber(payload, ["eiendeler.sumVarer", "eiendeler.omloepsmidler.varer"]),
    receivables: firstNumber(payload, ["eiendeler.sumFordringer"]),
    cash: firstNumber(payload, ["eiendeler.sumBankinnskuddOgKontanter"]),
    interestBearingDebt: extractInterestBearingDebt(payload),
    fiscalYear: statement?.fiscalYear ?? null,
  };
}

export function buildDistressFinancialTrend(statement: NormalizedFinancialStatement): DistressFinancialTrend {
  return {
    fiscalYear: statement.fiscalYear,
    revenue: statement.revenue ?? null,
    ebit: statement.operatingProfit ?? null,
    netIncome: statement.netIncome ?? null,
    equity: statement.equity ?? null,
    assets: statement.assets ?? null,
    equityRatio: calculateEquityRatio(statement.equity ?? null, statement.assets ?? null),
  };
}

export function buildSectorSummary(industryCode?: NormalizedIndustryCode | null, sectorLabel?: string | null) {
  const sectorCode = getSectorCodeFromIndustryCode(industryCode?.code);
  if (!sectorCode) {
    return null;
  }

  return {
    code: sectorCode,
    label: sectorLabel ?? null,
  };
}
