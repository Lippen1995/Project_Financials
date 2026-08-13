import { CompanyStatus } from "@prisma/client";

import { buildExactAddressKey } from "@/server/company-map/address-resolution";

export type BrregAddress = {
  adresse?: (string | null)[];
  postnummer?: string;
  poststed?: string;
  kommune?: string;
  kommunenummer?: string;
  landkode?: string;
};

export type BrregHistoricName = {
  navn?: string;
  fraDato?: string;
  tilDato?: string;
};

export type BrregRegistryEntity = {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { kode?: string };
  institusjonellSektorkode?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  antallAnsatte?: number;
  registreringsdatoEnhetsregisteret?: string;
  oppdateringsdato?: string;
  hjemmeside?: string;
  forretningsadresse?: BrregAddress;
  postadresse?: BrregAddress;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
  slettedato?: string;
  historiskeNavn?: BrregHistoricName[];
  stiftelsesdato?: string;
  vedtektsdato?: string;
  vedtektsfestetFormaal?: string[];
  aktivitet?: string[];
  maalform?: string;
  registrertIMvaregisteret?: boolean;
  registrertIForetaksregisteret?: boolean;
  registreringsdatoForetaksregisteret?: string;
  sisteInnsendteAarsregnskap?: string | number;
  kapital?: {
    belop?: number | string;
    antallAksjer?: number | string;
    type?: string;
    valuta?: string;
    innfortDato?: string;
  };
};

/** A single historic company name with the period Brreg registered it for. */
export type RegistryPreviousName = {
  name: string;
  fromDate: string | null;
  toDate: string | null;
};

function deriveStatus(entity: BrregRegistryEntity): CompanyStatus {
  if (entity.konkurs) return CompanyStatus.BANKRUPT;
  if (
    entity.slettedato ||
    entity.underAvvikling ||
    entity.underTvangsavviklingEllerTvangsopplosning
  ) {
    return CompanyStatus.DISSOLVED;
  }
  return CompanyStatus.ACTIVE;
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value?: number | string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBigInt(value?: number | string | null): bigint | null {
  const parsed = toNumber(value);
  return parsed === null ? null : BigInt(Math.round(parsed));
}

/**
 * Brreg wraps free text at ~70 characters and ships one array element per line, so the
 * elements have to be re-joined to read as the sentence the articles of association state.
 */
function joinTextLines(lines?: string[]): string | null {
  if (!Array.isArray(lines)) return null;
  const joined = lines
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return joined === "" ? null : joined;
}

/** Brreg stamps historic names as "1996-01-22 21:03:00"; normalize to a parseable ISO shape. */
function toTimestampText(value?: string): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim().replace(" ", "T");
}

/** One row per name the entity has carried, for the flattened name index. */
export type RegistryNameRow = {
  orgNumber: string;
  name: string;
  normalizedName: string;
  isCurrent: boolean;
  fromDate: Date | null;
  toDate: Date | null;
};

export function normalizeEntityName(value: string) {
  return value.trim().toUpperCase();
}

/**
 * Flattens the entity's current and historic names. Adjacent duplicates are kept here — the
 * index answers "who carried this name", and collapsing periods is a presentation concern.
 */
export function mapBrregEntityNames(entity: BrregRegistryEntity): RegistryNameRow[] {
  const orgNumber = entity.organisasjonsnummer;
  if (!orgNumber) {
    return [];
  }

  const rows: RegistryNameRow[] = [];
  const currentName = entity.navn?.trim();
  const previousNames = mapBrregPreviousNames(entity) ?? [];

  if (currentName) {
    rows.push({
      orgNumber,
      name: currentName,
      normalizedName: normalizeEntityName(currentName),
      isCurrent: true,
      fromDate: toDate(previousNames.at(-1)?.toDate ?? undefined),
      toDate: null,
    });
  }

  for (const previous of previousNames) {
    rows.push({
      orgNumber,
      name: previous.name,
      normalizedName: normalizeEntityName(previous.name),
      isCurrent: false,
      fromDate: toDate(previous.fromDate ?? undefined),
      toDate: toDate(previous.toDate ?? undefined),
    });
  }

  return rows;
}

export function mapBrregPreviousNames(entity: BrregRegistryEntity): RegistryPreviousName[] | null {
  if (!Array.isArray(entity.historiskeNavn) || entity.historiskeNavn.length === 0) {
    return null;
  }

  const names = entity.historiskeNavn
    .filter((entry): entry is BrregHistoricName => Boolean(entry) && typeof entry.navn === "string")
    .map((entry) => ({
      name: entry.navn!.trim(),
      fromDate: toTimestampText(entry.fraDato),
      toDate: toTimestampText(entry.tilDato),
    }))
    .filter((entry) => entry.name !== "");

  return names.length > 0 ? names : null;
}

export function mapBrregRegistryEntity(entity: BrregRegistryEntity) {
  const businessAddress = entity.forretningsadresse ?? {};
  const displayAddress = entity.forretningsadresse ?? entity.postadresse ?? {};
  const businessAddressStreet = Array.isArray(businessAddress.adresse)
    ? businessAddress.adresse.filter(Boolean).join(", ") || null
    : null;
  const addressStreet = Array.isArray(displayAddress.adresse)
    ? displayAddress.adresse.filter(Boolean).join(", ") || null
    : null;
  const exactAddressKey = buildExactAddressKey({
    addressStreet: businessAddressStreet,
    municipalityNumber: businessAddress.kommunenummer ?? null,
  });

  return {
    orgNumber: entity.organisasjonsnummer!,
    name: entity.navn ?? "",
    organisationForm: entity.organisasjonsform?.kode ?? null,
    institutionalSectorCode: entity.institusjonellSektorkode?.kode ?? null,
    institutionalSectorDescription: entity.institusjonellSektorkode?.beskrivelse ?? null,
    naceCode: entity.naeringskode1?.kode ?? null,
    naceDescription: entity.naeringskode1?.beskrivelse ?? null,
    status: deriveStatus(entity),
    employeeCount: typeof entity.antallAnsatte === "number" ? entity.antallAnsatte : null,
    registeredAt: toDate(entity.registreringsdatoEnhetsregisteret),
    foundedAt: toDate(entity.stiftelsesdato),
    statutesDate: toDate(entity.vedtektsdato),
    statutoryPurpose: joinTextLines(entity.vedtektsfestetFormaal),
    activityDescription: joinTextLines(entity.aktivitet),
    languageForm: entity.maalform ?? null,
    vatRegistered: typeof entity.registrertIMvaregisteret === "boolean" ? entity.registrertIMvaregisteret : null,
    registeredInBusinessRegister:
      typeof entity.registrertIForetaksregisteret === "boolean" ? entity.registrertIForetaksregisteret : null,
    businessRegisterRegisteredAt: toDate(entity.registreringsdatoForetaksregisteret),
    lastSubmittedAnnualReportYear: toNumber(entity.sisteInnsendteAarsregnskap),
    capitalType: entity.kapital?.type ?? null,
    shareCapital: toNumber(entity.kapital?.belop),
    shareCapitalCurrency: entity.kapital?.valuta ?? null,
    shareCount: toBigInt(entity.kapital?.antallAksjer),
    shareCapitalRegisteredAt: toDate(entity.kapital?.innfortDato),
    previousNames: mapBrregPreviousNames(entity),
    website: entity.hjemmeside ?? null,
    addressStreet,
    postalCode: displayAddress.postnummer ?? null,
    postalPlace: displayAddress.poststed ?? null,
    municipality: displayAddress.kommune ?? null,
    municipalityNumber: displayAddress.kommunenummer ?? null,
    countryCode: displayAddress.landkode ?? null,
    businessAddressStreet,
    businessAddressPostalCode: businessAddress.postnummer ?? null,
    businessAddressPostalPlace: businessAddress.poststed ?? null,
    businessAddressMunicipality: businessAddress.kommune ?? null,
    businessAddressMunicipalityNumber: businessAddress.kommunenummer ?? null,
    businessAddressCountryCode: businessAddress.landkode ?? null,
    businessAddressNormalizedName: exactAddressKey?.normalizedAddressName ?? null,
    businessAddressHouseNumber: exactAddressKey?.houseNumber ?? null,
    businessAddressHouseLetter: exactAddressKey?.houseLetter ?? null,
    businessAddressUnitNumber: exactAddressKey?.unitNumber ?? null,
    registerUpdatedAt: toDate(entity.oppdateringsdato),
  };
}
