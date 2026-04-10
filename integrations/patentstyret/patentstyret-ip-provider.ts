import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { IPRightDetail, IPRightSummary, IPRightType } from "@/lib/types";

const SOURCE_SYSTEM = "PATENTSTYRET";

function normalizeOrgNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => firstString(item)).filter((item): item is string => Boolean(item));
}

function asIsoDate(value: unknown): string | null {
  const raw = firstString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function deriveType(item: Record<string, unknown>): IPRightType | null {
  const rawType = firstString(item.caseType, item.iprType, item.rightType, item.type, item.domain, item.caseCategory);
  if (!rawType) {
    const caseUrl = firstString(item.caseUrl)?.toLowerCase();
    if (caseUrl?.includes("/trademark/")) return "trademark";
    if (caseUrl?.includes("/patent/")) return "patent";
    if (caseUrl?.includes("/design/")) return "design";
    return null;
  }

  const normalized = rawType.toLowerCase();
  if (normalized.includes("patent")) return "patent";
  if (normalized.includes("trade") || normalized.includes("vare")) return "trademark";
  if (normalized.includes("design")) return "design";
  return null;
}

function deriveIsActive(status: string | null) {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (["active", "registered", "granted", "in force", "gyldig"].some((token) => normalized.includes(token))) {
    return true;
  }
  if (["expired", "withdrawn", "revoked", "ceased", "lapsed", "opphørt"].some((token) => normalized.includes(token))) {
    return false;
  }
  return null;
}

function mapOwner(owner: unknown) {
  const record = asRecord(owner);
  return {
    name: firstString(record.name, record.partyName, record.ownerName, record.applicantName) ?? "Ukjent part",
    orgNumber: firstString(record.orgNumber, record.organizationNumber, record.organisationNumber, record.idNumber),
  };
}

function mapSummaryFromRecord(record: Record<string, unknown>, companyOrgNumber: string): IPRightSummary | null {
  const type = deriveType(record);
  if (!type) {
    return null;
  }

  const applicationNumber = firstString(record.applicationNumber, record.applicationId, record.caseNumber);
  const caseUrl = firstString(record.caseUrl, record.detailUrl);
  const id = firstString(record.id, record.caseId, applicationNumber, caseUrl);
  if (!id) {
    return null;
  }

  const status = firstString(record.status, record.caseStatus, record.statusLabel);
  const owners = Array.isArray(record.owners)
    ? record.owners.map(mapOwner)
    : Array.isArray(record.parties)
      ? record.parties.map(mapOwner)
      : [];

  const events = Array.isArray(record.events) ? record.events.map((item) => asRecord(item)) : [];
  const eventDates = events
    .map((event) => asIsoDate(event.date ?? event.eventDate ?? event.publishedAt ?? event.updatedAt))
    .filter((value): value is string => Boolean(value));

  return {
    id,
    companyOrgNumber,
    type,
    applicationNumber,
    title: firstString(
      record.title,
      record.inventionTitle,
      record.trademarkName,
      record.markName,
      record.designTitle,
      record.designName,
      record.label,
    ),
    status,
    applicationDate: asIsoDate(record.applicationDate ?? record.filingDate),
    registrationOrGrantDate: asIsoDate(record.registrationDate ?? record.grantDate),
    publicationDate: asIsoDate(record.publicationDate),
    caseUrl,
    owners,
    lastEventDate:
      eventDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
      asIsoDate(record.lastEventDate ?? record.lastUpdatedDate ?? record.updatedAt),
    isActive: deriveIsActive(status),
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: "IP_CASE",
    sourceId: id,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: record,
  };
}

function mapDetail(summary: IPRightSummary, payload: Record<string, unknown>): IPRightDetail {
  const detail = mapSummaryFromRecord(payload, summary.companyOrgNumber);
  const eventsRaw = Array.isArray(payload.events) ? payload.events : [];

  return {
    ...(detail ?? summary),
    events: eventsRaw
      .map((event) => asRecord(event))
      .map((event) => ({
        date: asIsoDate(event.date ?? event.eventDate ?? event.publishedAt),
        label: firstString(event.label, event.eventLabel, event.type) ?? "Hendelse",
        description: firstString(event.description, event.text, event.summary),
      })),
    classifications: asStringArray(payload.classifications ?? payload.ipcClasses ?? payload.locarnoClasses),
    inventors: asStringArray(payload.inventors),
    representatives: asStringArray(payload.representatives ?? payload.agents),
    trademarkClasses: asStringArray(payload.trademarkClasses ?? payload.niceClasses),
    trademarkKind: firstString(payload.trademarkKind, payload.markKind),
    designCount:
      typeof payload.designCount === "number"
        ? payload.designCount
        : typeof payload.numberOfDesigns === "number"
          ? payload.numberOfDesigns
          : null,
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: "IP_CASE_DETAIL",
    sourceId: summary.id,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: payload,
  };
}

function getHeaders() {
  const key = env.patentstyretSubscriptionKey;
  return key ? { "Ocp-Apim-Subscription-Key": key } : undefined;
}

export class PatentstyretIpProvider {
  async getCompanyPortfolio(orgNumber: string): Promise<IPRightSummary[]> {
    const normalizedOrgNumber = normalizeOrgNumber(orgNumber);
    if (normalizedOrgNumber.length !== 9) {
      return [];
    }

    const url = new URL("/register/v1/IprCasesByCompany", env.patentstyretBaseUrl);
    url.searchParams.set(env.patentstyretOrgNumberParam, normalizedOrgNumber);

    const payload = await fetchJson<unknown>(url.toString(), { headers: getHeaders() });
    const records = Array.isArray(payload)
      ? payload
      : Array.isArray(asRecord(payload).cases)
        ? (asRecord(payload).cases as unknown[])
        : Array.isArray(asRecord(payload).items)
          ? (asRecord(payload).items as unknown[])
          : [];

    return records
      .map((item) => mapSummaryFromRecord(asRecord(item), normalizedOrgNumber))
      .filter((item): item is IPRightSummary => Boolean(item));
  }

  async getCaseDetail(type: IPRightType, applicationNumber: string, summary?: IPRightSummary): Promise<IPRightDetail | null> {
    const appNo = applicationNumber.trim();
    if (!appNo) {
      return null;
    }

    const segment = type === "trademark" ? "Trademark" : type === "patent" ? "Patent" : "Design";
    const url = new URL(`/register/${segment}/v1/${encodeURIComponent(appNo)}`, env.patentstyretBaseUrl);
    const payload = await fetchJson<unknown>(url.toString(), { headers: getHeaders() });
    const record = asRecord(payload);

    const baseSummary: IPRightSummary =
      summary ??
      ({
        id: appNo,
        companyOrgNumber: "",
        type,
        applicationNumber: appNo,
        title: null,
        status: null,
        applicationDate: null,
        registrationOrGrantDate: null,
        publicationDate: null,
        caseUrl: null,
        owners: [],
        lastEventDate: null,
        isActive: null,
        sourceSystem: SOURCE_SYSTEM,
        sourceEntityType: "IP_CASE",
        sourceId: appNo,
        fetchedAt: new Date(),
        normalizedAt: new Date(),
      } as IPRightSummary);

    return mapDetail(baseSummary, record);
  }
}

export const __testables = {
  deriveType,
  deriveIsActive,
  mapSummaryFromRecord,
};
