import env from "@/lib/env";
import { fetchJson } from "@/integrations/http";
import { IPRightDetail, IPRightOwner, IPRightSummary, IPRightType } from "@/lib/types";

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

function asIsoDate(value: unknown): string | null {
  const raw = firstString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Status labels are returned in both Norwegian (currentStatusNo) and English
// (currentStatusEn). Observed English values: Registered, Pending, Granted,
// Refused, Withdrawn, Finally shelved, Ceased, In force.
const ACTIVE_STATUS_TOKENS = ["registered", "granted", "in force", "i kraft", "meddelt", "gyldig"];
const INACTIVE_STATUS_TOKENS = [
  "shelved",
  "henlagt",
  "withdrawn",
  "trukket",
  "refused",
  "avslå",
  "nektet",
  "ceased",
  "opphør",
  "lapsed",
  "expired",
  "bortfal",
  "revoked",
  "rejected",
];

function deriveIsActive(...statuses: Array<string | null | undefined>): boolean | null {
  const normalized = statuses.filter(Boolean).join(" ").toLowerCase();
  if (!normalized) return null;
  if (ACTIVE_STATUS_TOKENS.some((token) => normalized.includes(token))) return true;
  if (INACTIVE_STATUS_TOKENS.some((token) => normalized.includes(token))) return false;
  return null;
}

function mapParty(value: unknown): IPRightOwner {
  const record = asRecord(value);
  return {
    name: firstString(record.name, record.ownerName, record.applicantName) ?? "Ukjent part",
    orgNumber: firstString(record.companyNumber, record.orgNumber, record.organizationNumber),
  };
}

// The IprCasesByCompany portfolio endpoint returns one object with three typed
// arrays (patentBag / trademarkBag / designBag). Each item carries the case's
// summary fields directly — filing/registration dates are NOT included here and
// only appear in the per-case detail (ST.96) endpoint.
function mapBagItem(item: unknown, type: IPRightType, companyOrgNumber: string): IPRightSummary | null {
  const record = asRecord(item);

  const applicationNumber = firstString(record.applicationNumber);
  const caseUrl = firstString(record.caseUrl);
  const grantOrRegNumber = firstString(record.patentNumber, record.registrationNumber, record.designNumber);
  const id = firstString(applicationNumber, caseUrl, grantOrRegNumber);
  if (!id) {
    return null;
  }

  const statusNo = firstString(record.currentStatusNo);
  const statusEn = firstString(record.currentStatusEn);
  const owners = Array.isArray(record.ownerBag) ? record.ownerBag.map(mapParty) : [];
  const applicants = Array.isArray(record.applicantBag) ? record.applicantBag.map(mapParty) : [];
  const isActive = deriveIsActive(statusEn, statusNo);
  const statusDate = asIsoDate(record.currentStatusDate);

  return {
    id,
    companyOrgNumber,
    type,
    applicationNumber,
    title: firstString(record.inventionTitle, record.markVerbalElementText, record.designTitle, record.title),
    status: statusNo ?? statusEn,
    applicationDate: null,
    // The bulk portfolio endpoint carries no registration/grant date. For a right
    // whose current status IS registered/granted, the current-status date is that
    // registration/grant date; otherwise we have no reliable registration date.
    registrationOrGrantDate: isActive === true ? statusDate : null,
    publicationDate: null,
    expiryDate: asIsoDate(record.expiryDate),
    caseUrl,
    owners: owners.length > 0 ? owners : applicants,
    lastEventDate: statusDate,
    isActive,
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: "IP_CASE",
    sourceId: id,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: record,
  };
}

function mapPortfolio(payload: unknown, companyOrgNumber: string): IPRightSummary[] {
  const record = asRecord(payload);
  const bags: Array<[unknown, IPRightType]> = [
    [record.patentBag, "patent"],
    [record.trademarkBag, "trademark"],
    [record.designBag, "design"],
  ];

  const results: IPRightSummary[] = [];
  for (const [bag, type] of bags) {
    if (!Array.isArray(bag)) continue;
    for (const item of bag) {
      const mapped = mapBagItem(item, type, companyOrgNumber);
      if (mapped) results.push(mapped);
    }
  }

  return results;
}

// --- ST.96 detail helpers -------------------------------------------------
// The per-case endpoints return a nested WIPO ST.96 document under
// `bibliographicData`. Values are wrapped as { "$": "text" } and collections as
// singular-keyed bags. These helpers read that shape defensively.

function st96Value(node: unknown): string | null {
  if (typeof node === "string") return node.trim() || null;
  const record = asRecord(node);
  return firstString(record.$);
}

function asBagArray(node: unknown, key: string): unknown[] {
  const inner = asRecord(node)[key];
  if (Array.isArray(inner)) return inner;
  if (inner && typeof inner === "object") return [inner];
  return [];
}

function st96PartyName(party: unknown): string | null {
  const contact = asRecord(asRecord(party).contact);
  const sequence = asRecord(contact.contactTypeChoiceSequence);
  const name = asRecord(sequence.name);
  const entity = asRecord(name.entityName);
  const transliteration = entity.transliterationName;
  if (Array.isArray(transliteration)) {
    const found = transliteration.map(st96Value).find(Boolean);
    if (found) return found;
  }
  return st96Value(transliteration) ?? st96Value(name.freeFormatName);
}

function mapDetail(summary: IPRightSummary, payload: unknown): IPRightDetail {
  const bib = asRecord(asRecord(payload).bibliographicData);
  const applicationIdentification = asRecord(bib.applicationIdentification);

  const titles = asBagArray(bib.inventionTitleBag, "inventionTitle")
    .map((title) => st96Value(asRecord(title).phraseType))
    .filter((value): value is string => Boolean(value));

  const classifications = asBagArray(
    asRecord(bib.patentClassificationBag).ipcrClassificationBag,
    "ipcrClassification",
  )
    .map((entry) => firstString(asRecord(entry).patentClassificationText))
    .filter((value): value is string => Boolean(value));

  const partyBag = asRecord(bib.partyBag);
  const inventors = asBagArray(partyBag.inventorBag, "inventor")
    .map(st96PartyName)
    .filter((value): value is string => Boolean(value));
  const applicants = asBagArray(partyBag.applicantBag, "applicant")
    .map(st96PartyName)
    .filter((value): value is string => Boolean(value));
  const representatives = asBagArray(partyBag.representativeBag, "representative")
    .map(st96PartyName)
    .filter((value): value is string => Boolean(value));

  return {
    ...summary,
    title: titles[0] ?? summary.title,
    applicationNumber:
      firstString(asRecord(applicationIdentification.applicationNumber).applicationNumberText) ??
      summary.applicationNumber,
    applicationDate: asIsoDate(applicationIdentification.filingDate) ?? summary.applicationDate,
    owners: summary.owners.length > 0 ? summary.owners : applicants.map((name) => ({ name, orgNumber: null })),
    events: [],
    classifications,
    inventors,
    representatives,
    trademarkClasses: [],
    trademarkKind: null,
    designCount: null,
    sourceSystem: SOURCE_SYSTEM,
    sourceEntityType: "IP_CASE_DETAIL",
    sourceId: summary.id,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: asRecord(payload),
  };
}

function getHeaders() {
  const key = env.patentstyretSubscriptionKey;
  return key ? { "Ocp-Apim-Subscription-Key": key } : undefined;
}

function apiUrl(path: string) {
  const base = env.patentstyretBaseUrl.replace(/\/+$/, "");
  return new URL(`${base}${path}`);
}

export class PatentstyretIpProvider {
  async getCompanyPortfolio(orgNumber: string): Promise<IPRightSummary[]> {
    const normalizedOrgNumber = normalizeOrgNumber(orgNumber);
    if (normalizedOrgNumber.length !== 9) {
      return [];
    }

    const url = apiUrl("/register/v1/IprCasesByCompany");
    url.searchParams.set(env.patentstyretOrgNumberParam, normalizedOrgNumber);

    const payload = await fetchJson<unknown>(url.toString(), { headers: getHeaders() });
    return mapPortfolio(payload, normalizedOrgNumber);
  }

  async getCaseDetail(type: IPRightType, applicationNumber: string, summary?: IPRightSummary): Promise<IPRightDetail | null> {
    const appNo = applicationNumber.trim();
    if (!appNo) {
      return null;
    }

    const segment = type === "trademark" ? "Trademark" : type === "patent" ? "Patent" : "Design";
    const url = apiUrl(`/register/${segment}/v1/${encodeURIComponent(appNo)}`);
    const payload = await fetchJson<unknown>(url.toString(), { headers: getHeaders() });

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
        expiryDate: null,
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

    return mapDetail(baseSummary, payload);
  }
}

export const __testables = {
  deriveIsActive,
  mapBagItem,
  mapPortfolio,
};
