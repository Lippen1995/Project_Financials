import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateModel: vi.fn(),
  promoteModel: vi.fn(),
  deleteModel: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/services/admin-health-score-service", () => ({
  updateHealthScoreModel: mocks.updateModel,
  promoteHealthScoreModelToFallback: mocks.promoteModel,
  deleteHealthScoreModel: mocks.deleteModel,
}));

import { DELETE, POST, PUT } from "./route";

const invalidContext = {
  params: Promise.resolve({ modelId: "not-a-cuid" }),
};

describe("/api/admin/health-score/models/[modelId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", appRole: "ADMIN" },
      error: null,
    });
  });

  it("rejects malformed model identifiers before updating", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/admin/health-score/models/not-a-cuid", {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      invalidContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ugyldig modell-id." });
    expect(mocks.updateModel).not.toHaveBeenCalled();
  });

  it("rejects malformed model identifiers before promoting", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/health-score/models/not-a-cuid", {
        method: "POST",
        body: JSON.stringify({ action: "promote-fallback" }),
      }),
      invalidContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ugyldig modell-id." });
    expect(mocks.promoteModel).not.toHaveBeenCalled();
  });

  it("rejects malformed model identifiers before deleting", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/health-score/models/not-a-cuid", {
        method: "DELETE",
      }),
      invalidContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ugyldig modell-id." });
    expect(mocks.deleteModel).not.toHaveBeenCalled();
  });
});
