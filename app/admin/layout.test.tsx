import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
  getFinancialReviewerOrNull: vi.fn(),
}));

const redirectMock = vi.fn((target: string) => {
  throw new Error(`redirect:${target}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  safeAuth: authMocks.safeAuth,
}));

vi.mock("@/lib/admin-auth", () => ({
  getFinancialReviewerOrNull: authMocks.getFinancialReviewerOrNull,
}));

describe("app/admin/layout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("redirects unauthenticated users to login", async () => {
    authMocks.safeAuth.mockResolvedValue(null);
    authMocks.getFinancialReviewerOrNull.mockResolvedValue(null);

    const adminLayoutModule = await import("@/app/admin/layout");

    await expect(adminLayoutModule.default({ children: null })).rejects.toThrow("redirect:/login");
  });

  it("redirects authenticated non-admin users to dashboard", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", appRole: "USER" },
    });
    authMocks.getFinancialReviewerOrNull.mockResolvedValue(null);

    const adminLayoutModule = await import("@/app/admin/layout");

    await expect(adminLayoutModule.default({ children: null })).rejects.toThrow(
      "redirect:/dashboard",
    );
  });

  it("allows financial reviewers to access admin pages", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: { id: "user-1", email: "reviewer@example.com", appRole: "FINANCIAL_REVIEWER" },
    });
    authMocks.getFinancialReviewerOrNull.mockResolvedValue({
      id: "user-1",
      email: "reviewer@example.com",
      appRole: "FINANCIAL_REVIEWER",
    });

    const adminLayoutModule = await import("@/app/admin/layout");
    const html = renderToStaticMarkup(
      await adminLayoutModule.default({ children: <div>admin child</div> }),
    );

    expect(html).toContain("admin child");
    expect(html).toContain("Control Center");
  });
});
