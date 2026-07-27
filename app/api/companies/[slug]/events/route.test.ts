import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findCompanyMock, getCompanyByReferenceMock, getTimelineMock } = vi.hoisted(() => ({
  findCompanyMock: vi.fn(),
  getCompanyByReferenceMock: vi.fn(),
  getTimelineMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique: findCompanyMock,
    },
  },
}));

vi.mock("@/server/services/company-service", () => ({
  getCompanyByReference: getCompanyByReferenceMock,
}));

vi.mock("@/server/news/company-event-timeline-service", () => ({
  getCompanyEventTimeline: getTimelineMock,
}));

import { GET } from "@/app/api/companies/[slug]/events/route";

describe("GET /api/companies/[slug]/events", () => {
  beforeEach(() => {
    findCompanyMock.mockReset();
    getCompanyByReferenceMock.mockReset();
    getTimelineMock.mockReset();
  });

  it("rejects a fractional limit before company or database lookup", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/companies/928846466/events?limit=1.5"),
      { params: Promise.resolve({ slug: "928846466" }) },
    );

    expect(response.status).toBe(400);
    expect(getCompanyByReferenceMock).not.toHaveBeenCalled();
    expect(findCompanyMock).not.toHaveBeenCalled();
    expect(getTimelineMock).not.toHaveBeenCalled();
  });
});
