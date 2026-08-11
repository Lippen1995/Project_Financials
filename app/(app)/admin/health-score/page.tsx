import { redirect } from "next/navigation";

import AdminHealthScoreClient from "./AdminHealthScoreClient";
import { getAdminUserOrNull } from "@/lib/admin-auth";
import {
  buildAdminHealthScoreDashboard,
  starterHealthScoreModelInput,
} from "@/server/services/admin-health-score-service";

export default async function AdminHealthScorePage() {
  const admin = await getAdminUserOrNull();
  if (!admin) redirect("/dashboard");

  const dashboard = await buildAdminHealthScoreDashboard();
  return <AdminHealthScoreClient dashboard={dashboard} starter={starterHealthScoreModelInput()} />;
}
