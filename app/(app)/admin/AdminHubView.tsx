import React from "react";
import Link from "next/link";

import type { AdminHubModel } from "@/server/services/admin-hub-service";

type AdminHubViewProps = {
  model: AdminHubModel;
};

function NavCard({
  item,
}: {
  item: AdminHubModel["navigationSections"][number]["items"][number];
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-[var(--px-text)]">{item.title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">{item.description}</p>
        </div>
        <span className="data-label rounded-full border border-[var(--px-border)] px-3 py-1 text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
          {item.available ? "Tilgjengelig" : item.restrictionLabel ?? "Kommer senere"}
        </span>
      </div>
      <div className="mt-5">
        <span
          className={`inline-flex rounded-full px-4 py-2 text-sm font-medium ${
            item.available
              ? "bg-[var(--px-action)] text-white"
              : "border border-[var(--px-border)] bg-[var(--px-subtle)] text-[var(--px-muted)]"
          }`}
        >
          {item.available ? "Åpne arbeidsflate" : "Ikke tilgjengelig ennå"}
        </span>
      </div>
    </>
  );

  if (!item.available || !item.href) {
    return (
      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href as never}
      className="block rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
    >
      {content}
    </Link>
  );
}

export default function AdminHubView({ model }: AdminHubViewProps) {
  return (
    <div className="space-y-10 pb-14">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
          Admin
        </p>
        <h1 className="editorial-display mt-3 text-[2.5rem] leading-tight text-[var(--px-text)]">
          {model.title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
          {model.subtitle}
        </p>
        <p className="mt-4 data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
          Oppdatert {model.generatedAt.replace("T", " ").slice(0, 16)}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {model.metrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6"
          >
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              {metric.title}
            </p>
            <p className="editorial-display mt-3 text-[2.3rem] leading-none text-[var(--px-text)]">
              {metric.value}
            </p>
            <p className="mt-3 text-sm leading-6 text-[var(--px-muted)]">{metric.detail}</p>
          </div>
        ))}
      </section>

      <section className="space-y-6">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.5rem] font-semibold text-[var(--px-text)]">
            Arbeidsflater i admin
          </h2>
          <div className="h-px flex-1 bg-[var(--px-border)]" />
        </div>

        {model.navigationSections.map((section) => (
          <div key={section.title} className="space-y-4">
            <div>
              <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
                {section.title}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => (
                <NavCard key={item.key} item={item} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section
        id="human-review"
        className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"
      >
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Hva krever menneskelig vurdering?
          </p>
          <div className="mt-5 space-y-4">
            {model.humanSteps.map((step) => (
              <div
                key={step.key}
                className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-5"
              >
                <p className="text-base font-semibold text-[var(--px-text)]">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
                  {step.description}
                </p>
                <Link
                  href={step.href as never}
                  className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
                >
                  {step.actionLabel}
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Siste aktivitet
          </p>
          <div className="mt-5 space-y-4">
            {model.recentActivity.map((activity) => (
              <div
                key={activity.key}
                className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-5"
              >
                <p className="text-base font-semibold text-[var(--px-text)]">{activity.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
                  {activity.description}
                </p>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
                    {activity.timestamp}
                  </span>
                  {activity.href ? (
                    <Link
                      href={activity.href as never}
                      className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
                    >
                      Åpne
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
