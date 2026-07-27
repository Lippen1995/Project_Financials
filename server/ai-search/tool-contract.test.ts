import { describe, expect, it } from "vitest";

import { getRetrievalToolsForAccess, retrievalTools } from "./tools";

describe("approved Njord tool contract", () => {
  it("versions and classifies every approved tool", () => {
    for (const tool of retrievalTools) {
      expect(tool.version).toMatch(/^v\d+$/);
      expect(["DOCUMENTED_FACT", "CALCULATION", "EXPLANATION"]).toContain(tool.outputKind);
      expect(tool.dataDomains?.length).toBeGreaterThan(0);
    }
  });

  it("only adds the due-diligence calculator when the entitlement allows it", () => {
    const denied = getRetrievalToolsForAccess({
      canUseDueDiligence: false,
      userQuery: "Lag proforma.",
    });
    const allowed = getRetrievalToolsForAccess({
      canUseDueDiligence: true,
      userQuery: "Lag proforma.",
    });

    expect(denied.map((tool) => tool.name)).not.toContain("build_mna_pro_forma");
    expect(allowed.find((tool) => tool.name === "build_mna_pro_forma")).toMatchObject({
      version: "v1",
      outputKind: "CALCULATION",
    });
  });
});
