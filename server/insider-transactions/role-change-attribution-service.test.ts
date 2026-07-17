import { describe, expect, it } from "vitest";

import {
  namesReferToSamePerson,
  selectRegisteredReportingPartyOwnership,
  selectUniqueRolePerson,
} from "@/server/insider-transactions/role-change-attribution-service";

describe("primary-insider identity matching", () => {
  it("matches Brreg and KRT names even when surname order differs", () => {
    expect(namesReferToSamePerson("Arvid Ståle Pettersen", "PETTERSEN ARVID STÅLE")).toBe(true);
  });

  it("does not match people with different name tokens", () => {
    expect(namesReferToSamePerson("Arvid Ståle Pettersen", "Arvid Ståle Andersen")).toBe(false);
  });

  it("deduplicates multiple roles held by the same identified person", () => {
    const roles = ["STYRETS_LEDER", "DAGLIG_LEDER"].map((roleType) => ({
      roleType,
      holderType: "PERSON",
      personIdentityKey: "person-1",
      holderName: "Rachid Bendriss",
    }));

    expect(selectUniqueRolePerson(roles, "BENDRISS RACHID")?.personIdentityKey).toBe(
      "person-1",
    );
  });

  it("finds the insider's ownership directly in the reporting company snapshot", () => {
    const ownership = selectRegisteredReportingPartyOwnership(
      [
        {
          shareholderName: "ARVID STÅLE PETTERSEN",
          shareholderType: "PERSON",
          shareholderBirthYear: 1957,
          numberOfShares: 30_000n,
          totalCompanyShares: 30_000n,
          ownershipPercent: "100",
        },
      ],
      "PETTERSEN ARVID STÅLE",
      1957,
    );

    expect(ownership).toEqual({ fraction: 1, shareholderName: "ARVID STÅLE PETTERSEN" });
  });

  it("does not attribute a same-name owner with a different birth year", () => {
    const ownership = selectRegisteredReportingPartyOwnership(
      [
        {
          shareholderName: "ARVID STÅLE PETTERSEN",
          shareholderType: "PERSON",
          shareholderBirthYear: 1960,
          numberOfShares: 30_000n,
          totalCompanyShares: 30_000n,
          ownershipPercent: "100",
        },
      ],
      "PETTERSEN ARVID STÅLE",
      1957,
    );

    expect(ownership).toBeNull();
  });
});
