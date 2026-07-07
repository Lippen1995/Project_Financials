import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { IPRightSummary } from "@/lib/types";

const SOURCE_SYSTEM = "NVE";
const SOURCE_URL = "https://api.nve.no/doc/elsertifikater/";

function normalizeOrgNumber(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 9);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function parseNveDate(value: unknown): string | null {
  const raw = firstString(value);
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (match) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
    );
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatNumber(value: number | null, suffix: string) {
  if (value === null) return null;
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 }).format(value)} ${suffix}`;
}

function deriveIsActive(statusId: number | null, endDate: string | null): boolean | null {
  if (statusId !== 4) return statusId === null ? null : false;
  if (!endDate) return true;
  const end = new Date(endDate).getTime();
  if (Number.isNaN(end)) return true;
  return end >= Date.now();
}

function buildSourceId(record: Record<string, unknown>, companyOrgNumber: string) {
  return [
    companyOrgNumber,
    firstString(record.KraftverksNavn) ?? "ukjent-anlegg",
    firstString(record.Startdato) ?? "ukjent-start",
    firstString(record.Sluttdato) ?? "ukjent-slutt",
  ].join(":");
}

export function mapElcertApplication(item: unknown, companyOrgNumber: string): IPRightSummary | null {
  const record = asRecord(item);
  const ownerOrgNumber = normalizeOrgNumber(record.KraftverkEierOrgNr);
  if (ownerOrgNumber !== companyOrgNumber) return null;

  const sourceId = buildSourceId(record, companyOrgNumber);
  const startDate = parseNveDate(record.Startdato);
  const endDate = parseNveDate(record.Sluttdato);
  const statusDate = parseNveDate(record.StatusDato);
  const statusId = firstNumber(record.StatusID, record.StatusId);
  const capacityMw = firstNumber(record.MW);
  const expectedGwh = firstNumber(record.GWh, record.ProduksjonGWhForventetElsertifikatberettiget);
  const transitionGwh = firstNumber(record.ProduksjonGWhOvergangsordn);
  const targetGwh = firstNumber(record.ProduksjonGWhMaalet);
  const municipality = [firstString(record.Kommune), firstString(record.Fylke)].filter(Boolean).join(", ");
  const period = [startDate, endDate]
    .map((value) => (value ? new Date(value).toLocaleDateString("nb-NO") : null))
    .filter(Boolean)
    .join(" - ");

  const supportingFacts = [
    ["Anleggstype", firstString(record.TypeAnlegg)],
    ["Effekt", formatNumber(capacityMw, "MW")],
    ["Forventet produksjon", formatNumber(expectedGwh, "GWh")],
    ["Produksjon i overgangsordningen", formatNumber(transitionGwh, "GWh")],
    ["Produksjon i maalet", formatNumber(targetGwh, "GWh")],
    ["Lokasjon", municipality || null],
    ["Elspotomraade", firstString(record.Omraade)],
    ["Tildelingsperiode", period || null],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => ({ label, value }));

  const normalizedAt = new Date();

  return {
    id: `nve-elcert:${sourceId}`,
    companyOrgNumber,
    type: "elCertificate",
    applicationNumber: null,
    title: firstString(record.KraftverksNavn) ?? "Elsertifikatanlegg",
    status: firstString(record.Status),
    applicationDate: null,
    registrationOrGrantDate: startDate,
    publicationDate: null,
    expiryDate: endDate,
    caseUrl: SOURCE_URL,
    owners: [
      {
        name: firstString(record.KraftverkEierNavn) ?? "Ukjent eier",
        orgNumber: ownerOrgNumber,
      },
    ],
    lastEventDate: statusDate,
    isActive: deriveIsActive(statusId, endDate),
    supportingFacts,
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: "ELCERT_APPLICATION",
    sourceId,
    fetchedAt: normalizedAt,
    normalizedAt,
    rawPayload: record,
  };
}

function apiUrl(path: string) {
  const base = env.nveElcertBaseUrl.replace(/\/+$/, "");
  return `${base}${path}`;
}

export class NveElcertProvider {
  async getCompanyCertificates(orgNumber: string): Promise<IPRightSummary[]> {
    const normalizedOrgNumber = normalizeOrgNumber(orgNumber);
    if (normalizedOrgNumber.length !== 9) {
      return [];
    }

    const payload = await fetchJson<unknown>(apiUrl("/GetApplications"), undefined, 15000);
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((item) => mapElcertApplication(item, normalizedOrgNumber))
      .filter((item): item is IPRightSummary => Boolean(item));
  }
}

export const __testables = {
  deriveIsActive,
  mapElcertApplication,
  parseNveDate,
};
