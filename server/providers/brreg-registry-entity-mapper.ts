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
