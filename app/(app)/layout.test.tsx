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
  usePathname: () => "/dashboard",
}));

describe("app layout navigation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    adminAuthMocks.getFinancialReviewerOrNull.mockResolvedValue(null);
    adminNotificationMocks.countUnreadAdminNotificationsForActor.mockResolvedValue(0);
    adminNotificationMocks.listAdminNotificationsForActor.mockResolvedValue([]);
  });

  it("renders an avatar menu trigger instead of top-level account links", async () => {
    authMocks.safeAuth.mockResolvedValue({
      user: {
        id: "user-1",
        name: "User Example",
        email: "user@example.com",
        appRole: "USER",
      },
    });

    const layoutModule = await import("@/app/(app)/layout");
    const html = renderToStaticMarkup(
      await layoutModule.default({ children: <div>child</div> }),
    );

    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain(">UE<");
    expect(html).not.toContain(">Konto<");
    expect(html).not.toContain(">Logg ut<");
  });
});
