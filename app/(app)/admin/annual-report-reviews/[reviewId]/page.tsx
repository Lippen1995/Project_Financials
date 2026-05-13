import { notFound } from "next/navigation";
import Link from "next/link";

import { getReviewDetail } from "@/server/services/annual-report-review-service";
import { ReviewWorkspace } from "./ReviewWorkspace";

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const review = await getReviewDetail(reviewId);

  if (!review) {
    notFound();
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Link
          href="/admin/annual-report-reviews"
          className="hover:text-slate-800"
        >
          ← Review-kø
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          {review.company.name} — {review.fiscalYear}
        </h1>
        <p className="mt-1 font-mono text-sm text-slate-400">
          {review.company.orgNumber} · Review {review.id}
        </p>
      </div>

      <ReviewWorkspace review={review} />
    </div>
  );
}
