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
  usePathname: () => "/admin",
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

    const adminLayoutModule = await import("@/app/(app)/admin/layout");

    await expect(adminLayoutModule.default({ children: null })).rejects.toThrow("redirect:/login");
  });

  it("redirects authenticated non-admin users to dashboard", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", appRole: "USER" },
    });
    authMocks.getFinancialReviewerOrNull.mockResolvedValue(null);

    const adminLayoutModule = await import("@/app/(app)/admin/layout");

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

    const adminLayoutModule = await import("@/app/(app)/admin/layout");
    const html = renderToStaticMarkup(
      await adminLayoutModule.default({ children: <div>admin child</div> }),
    );

    expect(html).toContain("admin child");
    expect(html).toContain("Oversikt");
    expect(html).toContain("Regnskapsmapping");
    expect(html).toContain("Selskapshendelser");
  });

  it("keeps admin-only surfaces out of the rail for financial reviewers", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: { id: "user-1", email: "reviewer@example.com", appRole: "FINANCIAL_REVIEWER" },
    });
    authMocks.getFinancialReviewerOrNull.mockResolvedValue({
      id: "user-1",
      email: "reviewer@example.com",
      appRole: "FINANCIAL_REVIEWER",
    });

    const adminLayoutModule = await import("@/app/(app)/admin/layout");
    const html = renderToStaticMarkup(
      await adminLayoutModule.default({ children: <div>admin child</div> }),
    );

    expect(html).not.toContain("/admin/users");
    expect(html).not.toContain("/admin/ai-economics");
    expect(html).not.toContain("/admin/health-score");
  });

  it("does not link to retired OCR admin routes", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com", appRole: "ADMIN" },
    });
    authMocks.getFinancialReviewerOrNull.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      appRole: "ADMIN",
    });

    const adminLayoutModule = await import("@/app/(app)/admin/layout");
    const html = renderToStaticMarkup(
      await adminLayoutModule.default({ children: <div>admin child</div> }),
    );

    for (const retired of [
      "/admin/filings",
      "/admin/published-annual-reports",
      "/admin/annual-report-reviews",
      "/admin/annual-report-unified-confidence",
      "/admin/extraction-learning",
    ]) {
      expect(html).not.toContain(retired);
    }
  });
});