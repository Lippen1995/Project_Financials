import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, listCompaniesMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  listCompaniesMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  safeAuth: authMock,
}));

vi.mock("@/server/services/distress-analysis-service", () => ({
  listDistressCompaniesForWorkspace: listCompaniesMock,
}));

import { GET } from "@/app/api/workspaces/[workspaceId]/distress/companies/route";

describe("GET /api/workspaces/[workspaceId]/distress/companies", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    listCompaniesMock.mockReset();
  });

  it("rejects unsupported statuses and invalid pagination before lookup", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/workspaces/workspace-1/distress/companies?status=UNKNOWN&page=-1&size=1.5",
      ),
      { params: Promise.resolve({ workspaceId: "workspace-1" }) },
    );

    expect(response.status).toBe(400);
    expect(listCompaniesMock).not.toHaveBeenCalled();
  });
});
