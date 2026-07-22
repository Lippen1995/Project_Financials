import { describe, expect, it } from "vitest";

import { getRetrievalToolsForAccess } from "./index";

describe("access-aware Njord tool registry", () => {
  it("omits both the M&A tool and routing intent without Due Diligence access", () => {
    const tools = getRetrievalToolsForAccess({
      canUseDueDiligence: false,
      userQuery: "Lag proforma.",
    });

    expect(tools.map((tool) => tool.name)).not.toContain("build_mna_pro_forma");
    const router = tools.find((tool) => tool.name === "route_njord_request");
    expect(router?.inputSchema.safeParse({
      intent: "MNA_PRO_FORMA",
      reason: "Proforma",
    }).success).toBe(false);
  });

  it("includes the user-query-bound M&A tool with Due Diligence access", () => {
    const tools = getRetrievalToolsForAccess({
      canUseDueDiligence: true,
      userQuery: "Kjøpesum 100.",
    });

    expect(tools.map((tool) => tool.name)).toContain("build_mna_pro_forma");
    const router = tools.find((tool) => tool.name === "route_njord_request");
    expect(router?.inputSchema.safeParse({
      intent: "MNA_PRO_FORMA",
      reason: "Proforma",
    }).success).toBe(true);
  });
});
