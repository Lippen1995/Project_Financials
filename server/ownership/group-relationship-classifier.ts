import {
  ASSOCIATED_THRESHOLD_PERCENT,
  CONTROL_THRESHOLD_PERCENT,
} from "@/server/ownership/ownership-thresholds";

export const SSB_INSTITUTIONAL_SECTOR_STANDARD_VERSION = "2012";
export const SSB_INSTITUTIONAL_SECTOR_STANDARD_REFERENCE =
  "https://www.ssb.no/klass/klassifikasjoner/39";
export const GROUP_RELATIONSHIP_RULE_VERSION = "public-owner-boundary-v2-ssb2012";

export type GroupOwnerCategory =
  | "PUBLIC_NON_COMMERCIAL"
  | "OTHER_ORGANISATION"
  | "UNKNOWN";

export type GroupRelationshipKind =
  | "GROUP_SUBSIDIARY"
  | "GROUP_ASSOCIATE"
  | "FINANCIAL_POSITION"
  | "MINORITY_POSITION"
  | "UNKNOWN"
  | "CONFLICT";

export type GroupRelationshipReasonCode =
  | "PUBLIC_OWNER_AS_ASA"
  | "OWNERSHIP_OVER_50"
  | "OWNERSHIP_20_TO_50"
  | "OWNERSHIP_BELOW_20"
  | "REGISTRY_METADATA_INCOMPLETE"
  | "OWNERSHIP_PERCENT_MISSING"
  | "OWNERSHIP_PERCENT_INVALID";

export type GroupRelationshipClassification = {
  ownerCategory: GroupOwnerCategory;
  relationship: GroupRelationshipKind;
  reasonCode: GroupRelationshipReasonCode;
};

type GroupRelationshipInput = {
  issuerOrganisationForm: string | null;
  ownerOrganisationForm: string | null;
  ownerInstitutionalSectorCode: string | null;
  ownershipPercent: number | null;
};

// SSB Standard for Institutional Sector Classification 2012: public administration.
export const PUBLIC_ADMINISTRATION_SECTOR_CODES = ["6100", "6500"] as const;
// Official Brreg organisation forms provide a defensive fallback if a sector code is absent.
export const PUBLIC_ADMINISTRATION_ORGANISATION_FORMS = ["STAT", "KOMM", "FYLK"] as const;
export const LIMITED_COMPANY_FORMS = ["AS", "ASA"] as const;
const publicSectorCodes = new Set<string>(PUBLIC_ADMINISTRATION_SECTOR_CODES);
const publicOrganisationForms = new Set<string>(PUBLIC_ADMINISTRATION_ORGANISATION_FORMS);
const limitedCompanyForms = new Set<string>(LIMITED_COMPANY_FORMS);

export function classifyGroupRelationship(
  input: GroupRelationshipInput,
): GroupRelationshipClassification {
  const ownerSector = input.ownerInstitutionalSectorCode?.trim().toUpperCase() ?? null;
  const ownerForm = input.ownerOrganisationForm?.trim().toUpperCase() ?? null;
  const issuerForm = input.issuerOrganisationForm?.trim().toUpperCase() ?? null;
  const publicNonCommercial =
    (ownerSector !== null && publicSectorCodes.has(ownerSector)) ||
    (ownerForm !== null && publicOrganisationForms.has(ownerForm));
  const ownerCategory: GroupOwnerCategory = publicNonCommercial
    ? "PUBLIC_NON_COMMERCIAL"
    : ownerSector !== null || ownerForm !== null
      ? "OTHER_ORGANISATION"
      : "UNKNOWN";

  if (publicNonCommercial && issuerForm !== null && limitedCompanyForms.has(issuerForm)) {
    return {
      ownerCategory,
      relationship: "FINANCIAL_POSITION",
      reasonCode: "PUBLIC_OWNER_AS_ASA",
    };
  }

  if (ownerCategory === "UNKNOWN" || issuerForm === null) {
    return {
      ownerCategory,
      relationship: "UNKNOWN",
      reasonCode: "REGISTRY_METADATA_INCOMPLETE",
    };
  }

  if (input.ownershipPercent === null) {
    return {
      ownerCategory,
      relationship: "UNKNOWN",
      reasonCode: "OWNERSHIP_PERCENT_MISSING",
    };
  }
  if (input.ownershipPercent < 0 || input.ownershipPercent > 100) {
    return {
      ownerCategory,
      relationship: "CONFLICT",
      reasonCode: "OWNERSHIP_PERCENT_INVALID",
    };
  }
  if (input.ownershipPercent > CONTROL_THRESHOLD_PERCENT) {
    return {
      ownerCategory,
      relationship: "GROUP_SUBSIDIARY",
      reasonCode: "OWNERSHIP_OVER_50",
    };
  }
  if (input.ownershipPercent >= ASSOCIATED_THRESHOLD_PERCENT) {
    return {
      ownerCategory,
      relationship: "GROUP_ASSOCIATE",
      reasonCode: "OWNERSHIP_20_TO_50",
    };
  }
  return {
    ownerCategory,
    relationship: "MINORITY_POSITION",
    reasonCode: "OWNERSHIP_BELOW_20",
  };
}
