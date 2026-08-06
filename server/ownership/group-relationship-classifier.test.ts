import { describe, expect, it } from "vitest";

import { classifyGroupRelationship } from "@/server/ownership/group-relationship-classifier";

describe("classifyGroupRelationship", () => {
  it("treats a ministry's controlling stake in an ASA as a financial position", () => {
    expect(
      classifyGroupRelationship({
        issuerOrganisationForm: "ASA",
        ownerOrganisationForm: "STAT",
        ownerInstitutionalSectorCode: "6100",
        ownershipPercent: 67,
      }),
    ).toEqual({
      ownerCategory: "PUBLIC_NON_COMMERCIAL",
      relationship: "FINANCIAL_POSITION",
      reasonCode: "PUBLIC_OWNER_AS_ASA",
    });
  });

  it.each([10, 30, 100])(
    "treats a municipality's %s percent holding in an AS as a financial position",
    (ownershipPercent) => {
      expect(
        classifyGroupRelationship({
          issuerOrganisationForm: "AS",
          ownerOrganisationForm: "KOMM",
          ownerInstitutionalSectorCode: "6500",
          ownershipPercent,
        }).relationship,
      ).toBe("FINANCIAL_POSITION");
    },
  );

  it("keeps a commercial parent's controlling stake inside the business group", () => {
    expect(
      classifyGroupRelationship({
        issuerOrganisationForm: "AS",
        ownerOrganisationForm: "ASA",
        ownerInstitutionalSectorCode: "1120",
        ownershipPercent: 100,
      }),
    ).toEqual({
      ownerCategory: "OTHER_ORGANISATION",
      relationship: "GROUP_SUBSIDIARY",
      reasonCode: "OWNERSHIP_OVER_50",
    });
  });

  it("does not create a group relationship when official owner metadata is incomplete", () => {
    expect(
      classifyGroupRelationship({
        issuerOrganisationForm: "AS",
        ownerOrganisationForm: null,
        ownerInstitutionalSectorCode: null,
        ownershipPercent: 100,
      }),
    ).toEqual({
      ownerCategory: "UNKNOWN",
      relationship: "UNKNOWN",
      reasonCode: "REGISTRY_METADATA_INCOMPLETE",
    });
  });

  it("fails closed when the calculated ownership percentage exceeds 100", () => {
    expect(
      classifyGroupRelationship({
        issuerOrganisationForm: "AS",
        ownerOrganisationForm: "AS",
        ownerInstitutionalSectorCode: "2100",
        ownershipPercent: 101,
      }),
    ).toEqual({
      ownerCategory: "OTHER_ORGANISATION",
      relationship: "CONFLICT",
      reasonCode: "OWNERSHIP_PERCENT_INVALID",
    });
  });
});
