import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";
import { getFinancialReviewerOrNull } from "@/lib/admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-slate-400">
        <span>Admin</span>
        <span>/</span>
        <span>Årsrapport-review</span>
      </div>
      {children}
    </div>
  );
}
