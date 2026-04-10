import { describe, expect, it } from "vitest";

import { __testables } from "@/integrations/patentstyret/patentstyret-ip-provider";

describe("patentstyret-ip-provider normalization", () => {
  it("maps portfolio rows to internal summary model", () => {
    const row = {
      caseType: "Trademark",
      applicationNumber: "201903742",
      markName: "PROJECTX",
      status: "Registered",
      caseUrl: "https://services.patentstyret.no/search-details/Trademark/201903742",
      owners: [{ name: "ProjectX AS", orgNumber: "123456789" }],
      applicationDate: "2019-03-10",
      registrationDate: "2020-01-12",
      events: [{ date: "2024-06-01", label: "Renewed" }],
    };

    const normalized = __testables.mapSummaryFromRecord(row, "123456789");
    expect(normalized?.type).toBe("trademark");
    expect(normalized?.title).toBe("PROJECTX");
    expect(normalized?.owners[0]?.name).toBe("ProjectX AS");
    expect(normalized?.isActive).toBe(true);
  });

  it("handles missing optional fields", () => {
    const row = {
      caseType: "Patent",
      applicationNumber: "NO20250001",
    };

    const normalized = __testables.mapSummaryFromRecord(row, "123456789");
    expect(normalized?.type).toBe("patent");
    expect(normalized?.title).toBeNull();
    expect(normalized?.owners).toEqual([]);
    expect(normalized?.status).toBeNull();
  });

  it("derives active flag from status labels", () => {
    expect(__testables.deriveIsActive("Granted and Active")).toBe(true);
    expect(__testables.deriveIsActive("Revoked")).toBe(false);
    expect(__testables.deriveIsActive("Unknown flow")).toBeNull();
  });
});
