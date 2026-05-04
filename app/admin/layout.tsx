import Link from "next/link";
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
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-widest text-slate-400">
        <Link href={"/admin/annual-report-reviews" as never} className="hover:text-slate-600">
          Annual report reviews
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-decision-analytics" as never} className="hover:text-slate-600">
          PDF Decision Analytics
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-decision-rule-tuning" as never} className="hover:text-slate-600">
          Rule Tuning
        </Link>
      </div>
      {children}
    </div>
  );
}
