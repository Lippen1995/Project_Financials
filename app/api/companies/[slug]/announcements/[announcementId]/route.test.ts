import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAnnouncementMock, getCompanyByReferenceMock } = vi.hoisted(() => ({
  getAnnouncementMock: vi.fn(),
  getCompanyByReferenceMock: vi.fn(),
}));

vi.mock("@/server/services/company-service", () => ({
  getCompanyAnnouncementDetail: getAnnouncementMock,
  getCompanyByReference: getCompanyByReferenceMock,
}));

import { GET } from "@/app/api/companies/[slug]/announcements/[announcementId]/route";

describe("GET /api/companies/[slug]/announcements/[announcementId]", () => {
  beforeEach(() => {
    getAnnouncementMock.mockReset();
    getAnnouncementMock.mockResolvedValue(null);
    getCompanyByReferenceMock.mockReset();
    getCompanyByReferenceMock.mockResolvedValue({ orgNumber: "928846466" });
  });

  it("resolves a slug containing digits instead of treating its substring as an org number", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/companies/alias-928846466/announcements/announcement-1",
      ),
      {
        params: Promise.resolve({
          slug: "alias-928846466",
          announcementId: "announcement-1",
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(getCompanyByReferenceMock).toHaveBeenCalledWith("alias-928846466");
    expect(getAnnouncementMock).toHaveBeenCalledWith(
      "928846466",
      "announcement-1",
      null,
    );
  });
});
