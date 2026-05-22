import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => {
  const userFindMany = vi.fn();
  const userGroupBy = vi.fn();
  const userRoleChangeAuditFindMany = vi.fn();
  const transactionUserFindUnique = vi.fn();
  const transactionUserUpdate = vi.fn();
  const transactionAuditCreate = vi.fn();

  return {
    userFindMany,
    userGroupBy,
    userRoleChangeAuditFindMany,
    transactionUserFindUnique,
    transactionUserUpdate,
    transactionAuditCreate,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: prismaMocks.userFindMany,
      groupBy: prismaMocks.userGroupBy,
    },
    userRoleChangeAudit: {
      findMany: prismaMocks.userRoleChangeAuditFindMany,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: {
          findUnique: prismaMocks.transactionUserFindUnique,
          update: prismaMocks.transactionUserUpdate,
        },
        userRoleChangeAudit: {
          create: prismaMocks.transactionAuditCreate,
        },
      }),
    ),
  },
}));

describe("admin-user-management-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the user overview rows and recent audit items", async () => {
    prismaMocks.userFindMany.mockResolvedValue([
      {
        id: "user-1",
        name: "Ada Admin",
        email: "ada@example.com",
        appRole: "ADMIN",
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        emailVerified: new Date("2026-05-01T10:05:00.000Z"),
        subscription: { plan: "pro", status: "ACTIVE" },
        lastWorkspace: { name: "Nordic Growth", type: "TEAM", status: "ACTIVE" },
      },
    ]);
    prismaMocks.userGroupBy.mockResolvedValue([
      { appRole: "ADMIN", _count: { _all: 1 } },
      { appRole: "USER", _count: { _all: 4 } },
    ]);
    prismaMocks.userRoleChangeAuditFindMany.mockResolvedValue([
      {
        id: "audit-1",
        fromRole: "USER",
        toRole: "ADMIN",
        createdAt: new Date("2026-05-21T10:00:00.000Z"),
        actor: { name: "Ada Admin", email: "ada@example.com" },
        target: { name: "Rune Reviewer", email: "rune@example.com" },
      },
    ]);

    const { buildAdminUsersPageModel } = await import(
      "@/server/services/admin-user-management-service"
    );
    const model = await buildAdminUsersPageModel({
      currentUserId: "user-1",
      query: "ada",
      roleFilter: "ALL",
    });

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.roleLabel).toBe("Admin");
    expect(model.rows[0]?.isCurrentUser).toBe(true);
    expect(model.stats.find((item) => item.role === "ADMIN")?.count).toBe(1);
    expect(model.recentChanges[0]?.toRoleLabel).toBe("Admin");
  });

  it("logs a role change and blocks self-downgrade for admins", async () => {
    prismaMocks.transactionUserFindUnique
      .mockResolvedValueOnce({
        id: "admin-1",
        appRole: "ADMIN",
        email: "admin@example.com",
      })
      .mockResolvedValueOnce({
        id: "user-2",
        appRole: "USER",
        email: "user@example.com",
        name: "User Two",
      });
    prismaMocks.transactionUserUpdate.mockResolvedValue({
      id: "user-2",
      appRole: "FINANCIAL_REVIEWER",
    });
    prismaMocks.transactionAuditCreate.mockResolvedValue({ id: "audit-2" });

    const { updateAdminUserRole } = await import(
      "@/server/services/admin-user-management-service"
    );

    const result = await updateAdminUserRole({
      actorUserId: "admin-1",
      targetUserId: "user-2",
      nextRole: "FINANCIAL_REVIEWER",
    });

    expect(result.appRole).toBe("FINANCIAL_REVIEWER");
    expect(prismaMocks.transactionAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        targetUserId: "user-2",
        fromRole: "USER",
        toRole: "FINANCIAL_REVIEWER",
      }),
    });

    prismaMocks.transactionUserFindUnique.mockReset();
    prismaMocks.transactionUserFindUnique
      .mockResolvedValueOnce({
        id: "admin-1",
        appRole: "ADMIN",
        email: "admin@example.com",
      })
      .mockResolvedValueOnce({
        id: "admin-1",
        appRole: "ADMIN",
        email: "admin@example.com",
        name: "Ada Admin",
      });

    await expect(
      updateAdminUserRole({
        actorUserId: "admin-1",
        targetUserId: "admin-1",
        nextRole: "USER",
      }),
    ).rejects.toThrow("Du kan ikke fjerne din egen adminrolle fra denne siden.");
  });
});
