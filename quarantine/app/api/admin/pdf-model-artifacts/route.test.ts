import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  requireFinancialReviewer: vi.fn(),
};

const artifacts = {
  listPersistedPdfModelArtifactSnapshots: vi.fn(),
  persistPdfModelArtifactSnapshot: vi.fn(),
};

vi.mock("@/lib/admin-auth", () => ({
  requireFinancialReviewer: auth.requireFinancialReviewer,
}));

vi.mock("@/server/services/pdf-model-artifact-snapshot-service", () => ({
  listPersistedPdfModelArtifactSnapshots: artifacts.listPersistedPdfModelArtifactSnapshots,
  persistPdfModelArtifactSnapshot: artifacts.persistPdfModelArtifactSnapshot,
}));

describe("POST /api/admin/pdf-model-artifacts", () => {
  beforeEach(() => {
    auth.requireFinancialReviewer.mockReset();
    artifacts.persistPdfModelArtifactSnapshot.mockReset();
    auth.requireFinancialReviewer.mockResolvedValue({
      user: { id: "reviewer-1" },
      error: null,
    });
  });

  it("rejects an invalid organization number before persistence", async () => {
    const { POST } = await import("@/app/api/admin/pdf-model-artifacts/route");
    const request = new NextRequest("http://localhost/api/admin/pdf-model-artifacts", {
      method: "POST",
      body: JSON.stringify({
        kind: "SHADOW_MODEL_EVALUATION",
        payload: {},
        orgNumber: "928846467",
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(artifacts.persistPdfModelArtifactSnapshot).not.toHaveBeenCalled();
  });

  it("preserves an explicit null organization number", async () => {
    artifacts.persistPdfModelArtifactSnapshot.mockResolvedValue({ id: "artifact-1" });
    const { POST } = await import("@/app/api/admin/pdf-model-artifacts/route");
    const request = new NextRequest("http://localhost/api/admin/pdf-model-artifacts", {
      method: "POST",
      body: JSON.stringify({
        kind: "SHADOW_MODEL_EVALUATION",
        payload: {},
        orgNumber: null,
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(artifacts.persistPdfModelArtifactSnapshot).toHaveBeenCalledWith({
      kind: "SHADOW_MODEL_EVALUATION",
      payload: {},
      orgNumber: null,
      createdByUserId: "reviewer-1",
    });
  });
});
