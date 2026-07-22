import { describe, expect, it } from "vitest";

import { createRouteNjordRequestTool } from "./route-request";

describe("route_njord_request access-aware schema", () => {
  it("does not expose the M&A intent without Due Diligence access", () => {
    const tool = createRouteNjordRequestTool({ allowMnaProForma: false });
    const intent = (tool.parameters as {
      properties: { intent: { enum: string[] } };
    }).properties.intent;

    expect(intent.enum).not.toContain("MNA_PRO_FORMA");
    expect(tool.inputSchema.safeParse({
      intent: "MNA_PRO_FORMA",
      reason: "Proforma",
    }).success).toBe(false);
  });

  it("exposes the M&A intent with Due Diligence access", () => {
    const tool = createRouteNjordRequestTool({ allowMnaProForma: true });
    const intent = (tool.parameters as {
      properties: { intent: { enum: string[] } };
    }).properties.intent;

    expect(intent.enum).toContain("MNA_PRO_FORMA");
    expect(tool.inputSchema.safeParse({
      intent: "MNA_PRO_FORMA",
      reason: "Proforma",
    }).success).toBe(true);
  });
});
