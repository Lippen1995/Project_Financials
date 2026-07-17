import { describe, expect, it } from "vitest";

import {
  namesReferToSamePerson,
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
});
