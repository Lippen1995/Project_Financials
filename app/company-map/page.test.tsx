import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  safeAuth: vi.fn(),
}));

const adminAuthMocks = vi.hoisted(() => ({
  getFinancialReviewerOrNull: vi.fn(),
}));

const adminNotificationMocks = vi.hoisted(() => ({
  countUnreadAdminNotificationsForActor: vi.fn(),
  listAdminNotificationsForActor: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  safeAuth: authMocks.safeAuth,
}));

vi.mock("@/lib/admin-auth", () => ({
  getFinancialReviewerOrNull: adminAuthMocks.getFinancialReviewerOrNull,
}));

vi.mock("@/server/services/admin-notification-service", () => ({
  countUnreadAdminNotificationsForActor:
    adminNotificationMocks.countUnreadAdminNotificationsForActor,
  listAdminNotificationsForActor:
    adminNotificationMocks.listAdminNotificationsForActor,
}));

vi.mock("@/server/actions/auth-actions", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/company-map",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("company-map navigation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    adminAuthMocks.getFinancialReviewerOrNull.mockResolvedValue(null);
    adminNotificationMocks.countUnreadAdminNotificationsForActor.mockResolvedValue(0);
    adminNotificationMocks.listAdminNotificationsForActor.mockResolvedValue([]);
  });

  it("uses the standard app navigation for an authenticated viewer", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: {
        id: "user-1",
        name: "User Example",
        email: "user@example.com",
        appRole: "USER",
      },
    });

    const pageModule = await import("@/app/company-map/page");
    const html = renderToStaticMarkup(await pageModule.default());

    expect(html).toContain(">Enterprise Tier<");
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain('aria-label="Public navigation"');
  });

  it("keeps the public navigation for an anonymous viewer", async () => {
    authMocks.safeAuth.mockResolvedValue(null);

    const pageModule = await import("@/app/company-map/page");
    const html = renderToStaticMarkup(await pageModule.default());

    expect(html).toContain('aria-label="Public navigation"');
    expect(html).not.toContain(">Enterprise Tier<");
  });
});
