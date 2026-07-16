export default function BoardReportReviewsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Laster kontroll av styreberetninger">
      <div className="h-10 w-72 animate-pulse rounded-xl bg-[var(--px-subtle)]" />
      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-xl bg-[var(--px-subtle)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
