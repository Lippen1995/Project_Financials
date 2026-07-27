import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  getDashboardWorkspaceHome: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  safeAuth: mocks.safeAuth,
}));

vi.mock("@/server/services/workspace-service", () => ({
  createTeamWorkspace: vi.fn(),
  getDashboardWorkspaceHome: mocks.getDashboardWorkspaceHome,
}));

import { GET } from "./route";

describe("GET /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getDashboardWorkspaceHome.mockResolvedValue({});
  });

  it("rejects an invalid workspace query before loading the dashboard", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/workspaces?workspace=../workspace"),
    );

    expect(response.status).toBe(400);
    expect(mocks.getDashboardWorkspaceHome).not.toHaveBeenCalled();
  });
});
