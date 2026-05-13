import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";
import { getDashboardWorkspaceHome } from "@/server/services/workspace-service";

export default async function DistressMarketRedirectPage() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspaceHome = await getDashboardWorkspaceHome(session.user.id, null);
  redirect(`/workspaces/${workspaceHome.currentWorkspace.id}/distress`);
}
