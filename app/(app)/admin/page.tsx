import AdminControlCenterView from "@/app/(app)/admin/AdminControlCenterView";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { listAffectedAnnualReportFilingsForRefresh } from "@/server/services/admin-annual-report-refresh-service";
import { buildAdminControlCenterModel } from "@/server/services/admin-control-center-service";

export default async function AdminControlCenterPage() {
  const [model, reviewer, affectedFilings] = await Promise.all([
    buildAdminControlCenterModel(),
    getFinancialReviewerOrNull(),
    listAffectedAnnualReportFilingsForRefresh(),
  ]);

  return (
    <AdminControlCenterView
      model={model}
      currentUserRole={reviewer?.appRole ?? "ADMIN"}
      refreshAffectedCount={affectedFilings.length}
    />
  );
}
