import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateAdminUserRole: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/server/services/admin-user-management-service", () => ({
  updateAdminUserRole: mocks.updateAdminUserRole,
}));

describe("POST /api/admin/users/[userId]/role", () => {
  it("updates a user role for admins", async () => {
    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", appRole: "ADMIN" },
      error: null,
    });
    mocks.updateAdminUserRole.mockResolvedValue({
      userId: "user-2",
      appRole: "ADMIN",
    });

    const { POST } = await import("@/app/api/admin/users/[userId]/role/route");
    const response = await POST(
      new Request("http://localhost/api/admin/users/user-2/role", {
        method: "POST",
        body: JSON.stringify({ nextRole: "ADMIN" }),
        headers: { "Content-Type": "application/json" },
      }) as never,
      { params: Promise.resolve({ userId: "user-2" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateAdminUserRole).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      targetUserId: "user-2",
      nextRole: "ADMIN",
    });
  });

  it("rejects invalid role payloads", async () => {
    mocks.requireAdmin.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", appRole: "ADMIN" },
      error: null,
    });

    const { POST } = await import("@/app/api/admin/users/[userId]/role/route");
    const response = await POST(
      new Request("http://localhost/api/admin/users/user-2/role", {
        method: "POST",
        body: JSON.stringify({ nextRole: "OWNER" }),
        headers: { "Content-Type": "application/json" },
      }) as never,
      { params: Promise.resolve({ userId: "user-2" }) },
    );

    expect(response.status).toBe(400);
  });
});
