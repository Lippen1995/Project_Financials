import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  handoffFindingToWorkspaceWatch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  safeAuth: mocks.safeAuth,
}));

vi.mock("@/server/services/dd-investment-service", () => ({
  handoffFindingToWorkspaceWatch: mocks.handoffFindingToWorkspaceWatch,
}));

import { POST } from "./route";

describe("POST /api/dd-findings/[findingId]/handoff-watch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("rejects an invalid finding identifier before the handoff", async () => {
    const response = await POST(new Request("http://localhost") as never, {
      params: Promise.resolve({ findingId: "../finding" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.handoffFindingToWorkspaceWatch).not.toHaveBeenCalled();
  });
});
