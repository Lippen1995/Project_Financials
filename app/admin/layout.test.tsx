import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`redirect:${target}`);
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  safeAuth: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  getFinancialReviewerOrNull: vi.fn(),
}));

describe("app/admin/layout", () => {
  it("redirects unauthenticated users to login", async () => {
    const { safeAuth } = await import("@/lib/auth");
    const { getFinancialReviewerOrNull } = await import("@/lib/admin-auth");
    vi.mocked(safeAuth).mockResolvedValueOnce(null as never);
    vi.mocked(getFinancialReviewerOrNull).mockResolvedValueOnce(null);

    const adminLayoutModule = await import("@/app/admin/layout");

    await expect(adminLayoutModule.default({ children: null })).rejects.toThrow("redirect:/login");
  });

  it("redirects authenticated non-admin users to dashboard", async () => {
    const { safeAuth } = await import("@/lib/auth");
    const { getFinancialReviewerOrNull } = await import("@/lib/admin-auth");
    vi.mocked(safeAuth).mockResolvedValueOnce({
      user: { id: "user-1", email: "user@example.com", appRole: "USER" },
    } as never);
    vi.mocked(getFinancialReviewerOrNull).mockResolvedValueOnce(null);

    const adminLayoutModule = await import("@/app/admin/layout");

    await expect(adminLayoutModule.default({ children: null })).rejects.toThrow(
      "redirect:/dashboard",
    );
  });
});
