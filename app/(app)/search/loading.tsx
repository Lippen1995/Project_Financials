export default function SearchLoading() {
  return (
    <main className="space-y-6 pb-12" aria-busy="true" aria-label="Laster virksomhetssøk">
      <header className="grid gap-4 border-t-2 border-[var(--px-text)] pt-4">
        <div className="h-3 w-52 rounded-full bg-[var(--px-subtle)]" />
        <div className="h-5 w-36 rounded-full bg-[var(--px-subtle)]" />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="min-h-12 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)]" />
        <div className="h-11 w-20 rounded-full bg-[var(--px-action)] opacity-60" />
        <div className="h-11 w-24 rounded-full border border-[var(--px-border)]" />
        <div className="h-11 w-32 rounded-full border border-[var(--px-border)]" />
      </div>

      <section className="space-y-4 border-y border-[var(--px-border)] py-4">
        <div className="h-3 w-24 rounded-full bg-[var(--px-subtle)]" />
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-6 gap-4 border-b border-[var(--px-border)] py-3"
            >
              {Array.from({ length: 6 }, (_, cellIndex) => (
                <div
                  key={cellIndex}
                  className="h-3 rounded-full bg-[var(--px-subtle)]"
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
