import { redirect } from "next/navigation";

import AdminAiEconomicsClient from "./AdminAiEconomicsClient";
import { getAdminUserOrNull } from "@/lib/admin-auth";
import { buildAdminAiEconomicsDashboard } from "@/server/services/admin-ai-economics-service";

export default async function AdminAiEconomicsPage() {
  const admin = await getAdminUserOrNull();
  if (!admin) redirect("/dashboard");

  const model = await buildAdminAiEconomicsDashboard();
  return <AdminAiEconomicsClient model={model} />;
}
