import AdminHubView from "@/app/(app)/admin/AdminHubView";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { buildAdminHubModel } from "@/server/services/admin-hub-service";

export default async function AdminControlCenterPage() {
  const reviewer = await getFinancialReviewerOrNull();

  const model = await buildAdminHubModel({
    currentUserRole: reviewer?.appRole ?? "ADMIN",
  });

  return (
    <AdminHubView model={model} canManageAiEconomics={reviewer?.appRole === "ADMIN"} />
  );
}
