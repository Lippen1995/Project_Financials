import AdminHubView from "@/app/(app)/admin/AdminHubView";
import { AdminIngestionIndicator } from "@/components/admin-ingestion-indicator";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { buildAdminHubModel } from "@/server/services/admin-hub-service";

export default async function AdminControlCenterPage() {
  const [reviewer] = await Promise.all([
    getFinancialReviewerOrNull(),
  ]);

  const model = await buildAdminHubModel({
    currentUserRole: reviewer?.appRole ?? "ADMIN",
  });

  return (
    <div className="space-y-6">
      <AdminIngestionIndicator />
      <AdminHubView
        model={model}
        canManageAiEconomics={reviewer?.appRole === "ADMIN"}
      />
    </div>
  );
}
