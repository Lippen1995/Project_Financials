import { describe, expect, it, vi } from "vitest";

import { getGroupEmployeeSummaries } from "@/server/ownership/group-employee-service";

describe("getGroupEmployeeSummaries", () => {
  it("adds the parent and all controlled subsidiaries without changing the parent's own count", async () => {
    const result = await getGroupEmployeeSummaries(
      [{ orgNumber: "922493626", employeeCount: 5 }],
      {
        getLatestOwnershipYear: vi.fn().mockResolvedValue(2025),
        getSubsidiaryOrgNumbers: vi
          .fn()
          .mockResolvedValue(["993252263", "111111111"]),
        getEmployeeCounts: vi.fn().mockResolvedValue(
          new Map([
            ["993252263", 302],
            ["111111111", 10],
          ]),
        ),
      },
    );

    expect(result.get("922493626")).toEqual({
      employeeCount: 317,
      companyCount: 3,
      coveredCompanyCount: 3,
      complete: true,
      ownershipYear: 2025,
    });
  });

  it("marks the group total as incomplete when a subsidiary lacks a Brreg employee count", async () => {
    const result = await getGroupEmployeeSummaries(
      [{ orgNumber: "PARENT", employeeCount: 5 }],
      {
        getLatestOwnershipYear: vi.fn().mockResolvedValue(2025),
        getSubsidiaryOrgNumbers: vi.fn().mockResolvedValue(["KNOWN", "MISSING"]),
        getEmployeeCounts: vi.fn().mockResolvedValue(new Map([["KNOWN", 302]])),
      },
    );

    expect(result.get("PARENT")).toEqual({
      employeeCount: 307,
      companyCount: 3,
      coveredCompanyCount: 2,
      complete: false,
      ownershipYear: 2025,
    });
  });
});
