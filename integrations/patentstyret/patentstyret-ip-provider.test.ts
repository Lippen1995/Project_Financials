import { describe, expect, it } from "vitest";

import { __testables } from "@/integrations/patentstyret/patentstyret-ip-provider";

describe("patentstyret-ip-provider normalization", () => {
  it("maps a patent portfolio bag item to the internal summary model", () => {
    const item = {
      patentNumber: null,
      inventionTitle: "Vekstregulerende substanser.",
      applicationNumber: "19891035",
      currentStatusNo: "Endelig henlagt",
      currentStatusEn: "Finally shelved",
      currentStatusDate: "1991-02-08",
      applicantBag: [{ name: "Norsk Hydro ASA", companyNumber: "914778271" }],
      ownerBag: [{ name: "Norsk Hydro ASA", companyNumber: "914778271" }],
      caseUrl: "https://services.patentstyret.no/search-details/patent/19891035",
      expiryDate: "2009-03-10",
    };

    const normalized = __testables.mapBagItem(item, "patent", "914778271");
    expect(normalized?.type).toBe("patent");
    expect(normalized?.title).toBe("Vekstregulerende substanser.");
    expect(normalized?.applicationNumber).toBe("19891035");
    expect(normalized?.owners[0]?.name).toBe("Norsk Hydro ASA");
    expect(normalized?.owners[0]?.orgNumber).toBe("914778271");
    expect(normalized?.status).toBe("Endelig henlagt");
    expect(normalized?.isActive).toBe(false);
    expect(normalized?.expiryDate).toBe("2009-03-10T00:00:00.000Z");
  });

  it("splits the portfolio response into typed bags", () => {
    const payload = {
      partyIdentifier: "123456789",
      patentBagCount: 1,
      trademarkBagCount: 1,
      designBagCount: 0,
      patentBag: [{ inventionTitle: "Widget", applicationNumber: "202500001", currentStatusEn: "Granted" }],
      trademarkBag: [
        {
          markVerbalElementText: "PROJECTX",
          applicationNumber: "201903742",
          currentStatusNo: "Registrert",
          currentStatusEn: "Registered",
          ownerBag: [{ name: "Fjord Insight AS", companyNumber: "123456789" }],
        },
      ],
      designBag: [],
    };

    const rows = __testables.mapPortfolio(payload, "123456789");
    expect(rows).toHaveLength(2);

    const trademark = rows.find((row) => row.type === "trademark");
    expect(trademark?.title).toBe("PROJECTX");
    expect(trademark?.isActive).toBe(true);

    const patent = rows.find((row) => row.type === "patent");
    expect(patent?.isActive).toBe(true);
  });

  it("drops items without any identifier", () => {
    expect(__testables.mapBagItem({ inventionTitle: "no id" }, "patent", "123456789")).toBeNull();
  });

  it("derives the active flag from Norwegian and English status labels", () => {
    expect(__testables.deriveIsActive("Registered")).toBe(true);
    expect(__testables.deriveIsActive("Granted and Active")).toBe(true);
    expect(__testables.deriveIsActive("Withdrawn")).toBe(false);
    expect(__testables.deriveIsActive(null, "Endelig henlagt")).toBe(false);
    expect(__testables.deriveIsActive("Pending")).toBeNull();
  });
});
