import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
};

const petroleumCompanyExposureService = {
  getPetroleumCompanyExposureSnapshots: vi.fn(),
  syncPetroleumCompanyExposureSnapshots: vi.fn(),
};

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({
    user: null,
    error: authState.error,
  })),
}));

vi.mock("@/server/services/petroleum-company-exposure-service", () => ({
  getPetroleumCompanyExposureSnapshots:
    petroleumCompanyExposureService.getPetroleumCompanyExposureSnapshots,
  syncPetroleumCompanyExposureSnapshots:
    petroleumCompanyExposureService.syncPetroleumCompanyExposureSnapshots,
}));

describe("POST /api/market/oil-gas/company-exposure", () => {
  beforeEach(() => {
    authState.error = new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 },
    );
    petroleumCompanyExposureService.getPetroleumCompanyExposureSnapshots.mockReset();
    petroleumCompanyExposureService.syncPetroleumCompanyExposureSnapshots.mockReset();
  });

  it("rejects unauthenticated synchronization without touching data", async () => {
    const { POST } = await import(
      "@/app/api/market/oil-gas/company-exposure/route"
    );

    const response = await POST();

    expect(response.status).toBe(401);
    expect(
      petroleumCompanyExposureService.syncPetroleumCompanyExposureSnapshots,
    ).not.toHaveBeenCalled();
    expect(
      petroleumCompanyExposureService.getPetroleumCompanyExposureSnapshots,
    ).not.toHaveBeenCalled();
  });
});
