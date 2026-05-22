import { redirect } from "next/navigation";

import AdminUsersClient from "@/app/(app)/admin/users/AdminUsersClient";
import { getAdminUserOrNull } from "@/lib/admin-auth";
import { buildAdminUsersPageModel } from "@/server/services/admin-user-management-service";

function asSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await getAdminUserOrNull();

  if (!admin) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const query = asSingle(params.query) ?? "";
  const roleFilter = (asSingle(params.role) as "USER" | "ADMIN" | "FINANCIAL_REVIEWER" | "ALL" | undefined) ?? "ALL";

  const model = await buildAdminUsersPageModel({
    currentUserId: admin.id,
    query,
    roleFilter,
  });

  return <AdminUsersClient model={model} />;
}
