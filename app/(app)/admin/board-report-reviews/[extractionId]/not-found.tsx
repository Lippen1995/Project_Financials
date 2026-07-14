import Link from "next/link";

export default function BoardReportReviewNotFound() {
  return (
    <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
      <h1 className="editorial-display text-2xl text-[var(--px-text)]">
        Uttrekket er ikke tilgjengelig
      </h1>
      <p className="mt-2 text-sm text-[var(--px-muted)]">
        Kontrollsaken finnes ikke, eller den er ikke lenger tilgjengelig for denne visningen.
      </p>
      <Link
        href="/admin/board-report-reviews"
        className="mt-4 inline-flex rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-[var(--px-surface)] hover:bg-[var(--px-action-hover)]"
      >
        Til kontrollkøen
      </Link>
    </div>
  );
}
