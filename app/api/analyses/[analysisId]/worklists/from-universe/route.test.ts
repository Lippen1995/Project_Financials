import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  createWorklistFromUniverse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: mocks.safeAuth }));
vi.mock("@/server/analysis/analysis-service", () => ({
  analysisService: {
    createWorklistFromUniverse: mocks.createWorklistFromUniverse,
  },
}));

import { POST } from "./route";

describe("POST /api/analyses/[analysisId]/worklists/from-universe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.createWorklistFromUniverse.mockResolvedValue({ id: "worklist-1" });
  });

  it("runs and stores the analysis universe through the access-controlled service", async () => {
    const body = {
      expectedAnalysisVersion: 2,
      type: "LONGLIST",
      name: "Rangert longlist",
      purpose: "Dokumentert første utvalg.",
    };
    const response = await POST(
      new NextRequest(
        "http://localhost/api/analyses/analysis-1/worklists/from-universe",
        { method: "POST", body: JSON.stringify(body) },
      ),
      { params: Promise.resolve({ analysisId: "analysis-1" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.createWorklistFromUniverse).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      body,
    );
  });

  it("rejects unsigned requests before running the universe", async () => {
    mocks.safeAuth.mockResolvedValue(null);
    const response = await POST(
      new NextRequest(
        "http://localhost/api/analyses/analysis-1/worklists/from-universe",
        { method: "POST", body: "{}" },
      ),
      { params: Promise.resolve({ analysisId: "analysis-1" }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.createWorklistFromUniverse).not.toHaveBeenCalled();
  });
});
