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
        <span>/</span>
        <Link href={"/admin/pdf-parser-remediation" as never} className="hover:text-slate-600">
          Parser Remediation
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-parser-route-quality" as never} className="hover:text-slate-600">
          Parser Route Quality
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-route-experiment" as never} className="hover:text-slate-600">
          Route Experiment
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-shadow-model" as never} className="hover:text-slate-600">
          Shadow Model
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-shadow-model-analysis" as never} className="hover:text-slate-600">
          Shadow Analysis
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-shadow-vs-rule-gate" as never} className="hover:text-slate-600">
          Shadow vs Rule Gate
        </Link>
        <span>/</span>
        <Link href={"/admin/pdf-model-candidates" as never} className="hover:text-slate-600">
          Model Candidates
        </Link>
      </div>
      {children}
    </div>
  );
}
