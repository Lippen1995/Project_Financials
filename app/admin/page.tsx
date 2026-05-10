import AdminControlCenterView from "@/app/admin/AdminControlCenterView";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { buildAdminControlCenterModel } from "@/server/services/admin-control-center-service";

export default async function AdminControlCenterPage() {
  const [model, reviewer] = await Promise.all([
    buildAdminControlCenterModel(),
    getFinancialReviewerOrNull(),
  ]);

  return (
    <AdminControlCenterView
      model={model}
      currentUserRole={reviewer?.appRole ?? "ADMIN"}
    />
  );
}
