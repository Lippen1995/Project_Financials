import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeAuthMock, recordCompanySearchMock } = vi.hoisted(() => ({
  safeAuthMock: vi.fn(),
  recordCompanySearchMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ safeAuth: safeAuthMock }));
vi.mock("@/server/services/search-history-service", () => ({
  recordCompanySearch: recordCompanySearchMock,
}));

import { POST } from "@/app/api/search-history/route";

describe("POST /api/search-history", () => {
  beforeEach(() => {
    safeAuthMock.mockReset();
    recordCompanySearchMock.mockReset();
    safeAuthMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("records an explicit company selection once for the authenticated user", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/search-history", {
        method: "POST",
        body: JSON.stringify({
          eventKey: "e9f2f719-600d-4b65-95b1-aaf17a9da131",
          query: "fjordkraft",
          resultCount: 6,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordCompanySearchMock).toHaveBeenCalledWith({
      userId: "user-1",
      eventKey: "e9f2f719-600d-4b65-95b1-aaf17a9da131",
      query: "fjordkraft",
      scope: "companies",
      resultCount: 6,
      succeeded: true,
    });
  });

  it("rejects anonymous history writes", async () => {
    safeAuthMock.mockResolvedValue(null);
    const response = await POST(
      new NextRequest("http://localhost/api/search-history", {
        method: "POST",
        body: JSON.stringify({
          eventKey: "e9f2f719-600d-4b65-95b1-aaf17a9da131",
          query: "fjordkraft",
          resultCount: 6,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(recordCompanySearchMock).not.toHaveBeenCalled();
  });
});
