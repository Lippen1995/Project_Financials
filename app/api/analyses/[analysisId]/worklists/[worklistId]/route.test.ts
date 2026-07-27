import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  reorderWorklist: vi.fn(),
  promoteWorklistItem: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/server/analysis/analysis-service", () => ({
  analysisService: {
    reorderWorklist: mocks.reorderWorklist,
    promoteWorklistItem: mocks.promoteWorklistItem,
  },
}));

import { PATCH, POST } from "./route";

const context = {
  params: Promise.resolve({
    analysisId: "analysis-1",
    worklistId: "worklist-1",
  }),
};

describe("/api/analyses/[analysisId]/worklists/[worklistId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("reorders the complete worklist through the write seam", async () => {
    const body = { itemIds: ["item-2", "item-1"] };
    const response = await PATCH(new NextRequest("http://localhost/api", {
      method: "PATCH",
      body: JSON.stringify(body),
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.reorderWorklist).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      "worklist-1",
      body,
    );
  });

  it("promotes an item to another worklist through the same access scope", async () => {
    const body = { itemId: "item-1", targetWorklistId: "worklist-2" };
    mocks.promoteWorklistItem.mockResolvedValue({ id: "item-3" });
    const response = await POST(new NextRequest("http://localhost/api", {
      method: "POST",
      body: JSON.stringify(body),
    }), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ item: { id: "item-3" } });
    expect(mocks.promoteWorklistItem).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      "worklist-1",
      body,
    );
  });
});
