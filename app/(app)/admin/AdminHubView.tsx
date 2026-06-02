import React from "react";
import Link from "next/link";

import type { AdminHubModel, AdminPipelineStage } from "@/server/services/admin-hub-service";

type AdminHubViewProps = {
  model: AdminHubModel;
};

function stageToneClasses(tone: AdminPipelineStage["tone"]) {
  switch (tone) {
    case "success":
      return { pill: "bg-green-50 border-green-200 text-green-700", dot: "bg-green-500" };
    case "warning":
      return { pill: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-400" };
    case "error":
      return { pill: "bg-red-50 border-red-200 text-red-700", dot: "bg-red-500" };
    case "active":
      return { pill: "bg-blue-50 border-blue-200 text-blue-700", dot: "bg-blue-400" };
    default:
      return { pill: "bg-slate-50 border-slate-200 text-slate-500", dot: "bg-slate-300" };
  }
}

function PipelineStageCard({ stage }: { stage: AdminPipelineStage }) {
  const tone = stageToneClasses(stage.tone);
  return (
    <Link
      href={stage.href as never}
      className="group flex flex-col items-center rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5 text-center transition-colors hover:bg-[var(--px-subtle)]"
    >
      <span className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone.pill}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        {stage.label}
      </span>
      <span className="editorial-display text-[2rem] leading-none text-[var(--px-text)]">
        {stage.count.toLocaleString("nb-NO")}
      </span>
    </Link>
  );
}

function ActionCard({
  title,
  value,
  detail,
  href,
  urgent,
}: {
  title: string;
  value: string | number;
  detail: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href as never}
      className={`group flex items-center justify-between rounded-2xl border p-5 transition-colors ${
        urgent
          ? "border-red-200 bg-red-50 hover:bg-red-100"
          : "border-amber-200 bg-amber-50 hover:bg-amber-100"
      }`}
    >
      <div>
        <p className={`data-label text-[11px] uppercase tracking-widest ${urgent ? "text-red-600" : "text-amber-700"}`}>
          {title}
        </p>
        <p className={`editorial-display mt-1 text-[2rem] leading-none ${urgent ? "text-red-700" : "text-amber-800"}`}>
          {typeof value === "number" ? value.toLocaleString("nb-NO") : value}
        </p>
        <p className={`mt-1.5 text-sm ${urgent ? "text-red-600" : "text-amber-700"}`}>{detail}</p>
      </div>
      <span className={`ml-4 shrink-0 text-lg ${urgent ? "text-red-400" : "text-amber-400"}`}>
        →
      </span>
    </Link>
  );
}

export default function AdminHubView({ model }: AdminHubViewProps) {
  const pendingReview = model.pipeline.find((s) => s.status === "MANUAL_REVIEW");
  const failed = model.pipeline.find((s) => s.status === "FAILED");
  const processing = model.pipeline.reduce(
    (sum, s) =>
      ["PROCESSING", "PREFLIGHTED", "EXTRACTED", "VALIDATED"].includes(s.status as string)
        ? sum + s.count
        : sum,
    0,
  );
  const published = model.pipeline.find((s) => s.status === "PUBLISHED");

  const hasActionItems = (pendingReview?.count ?? 0) > 0 || (failed?.count ?? 0) > 0;

  return (
    <div className="space-y-10 pb-14">
      {/* Header */}
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

      {/* Action items */}
      {hasActionItems ? (
        <section className="space-y-3">
          <div className="flex items-center gap-4">
            <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">Krever tiltak</h2>
            <div className="h-px flex-1 bg-[var(--px-border)]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(pendingReview?.count ?? 0) > 0 ? (
              <ActionCard
                title="Manuell kontroll"
                value={pendingReview!.count}
                detail="Rapporter venter på manuell gjennomgang"
                href="/admin/annual-report-reviews"
              />
            ) : null}
            {(failed?.count ?? 0) > 0 ? (
              <ActionCard
                title="Feilet"
                value={failed!.count}
                detail="Rapporter har stoppet og må følges opp"
                href="/admin/filings?status=FAILED"
                urgent
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Pipeline overview */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">Pipeline-status</h2>
          <div className="h-px flex-1 bg-[var(--px-border)]" />
          <Link
            href="/admin/filings"
            className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)] hover:underline"
          >
            Se alle rapporter →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {model.pipeline.filter((s) => s.count > 0 || s.tone === "error").map((stage) => (
            <PipelineStageCard key={stage.status} stage={stage} />
          ))}
        </div>
        <div className="flex flex-wrap gap-6 rounded-xl bg-[var(--px-subtle)] px-5 py-4 text-sm text-[var(--px-muted)]">
          <span>
            <strong className="text-[var(--px-text)]">
              {model.pipeline.reduce((sum, s) => sum + s.count, 0).toLocaleString("nb-NO")}
            </strong>{" "}
            totalt skannet
          </span>
          <span>
            <strong className="text-blue-700">{processing.toLocaleString("nb-NO")}</strong>{" "}
            under behandling
          </span>
          <span>
            <strong className="text-green-700">
              {published?.count.toLocaleString("nb-NO") ?? "0"}
            </strong>{" "}
            publisert
          </span>
          <span>
            <strong className={failed?.count ? "text-red-700" : "text-[var(--px-text)]"}>
              {failed?.count.toLocaleString("nb-NO") ?? "0"}
            </strong>{" "}
            feilet
          </span>
        </div>
      </section>

      {/* Quick stats */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {model.metrics.slice(0, 4).map((metric) => (
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

      {/* Section links */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Manual review */}
        <Link
          href="/admin/annual-report-reviews"
          className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
        >
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Arbeidsflate
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Manuell kontroll</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
            Sammenlign PDF mot systemets forslag og ta beslutning.
          </p>
          <span className="mt-4 inline-flex rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-medium text-white">
            Åpne kontrollkø
          </span>
        </Link>

        {/* Published */}
        <Link
          href="/admin/published-annual-reports"
          className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
        >
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Resultater
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Godkjente årsregnskaper</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
            Se alle publiserte regnskaper og publiseringsmåte.
          </p>
          <span className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
            Åpne liste
          </span>
        </Link>

        {/* All filings */}
        <Link
          href="/admin/filings"
          className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
        >
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Pipeline
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Alle rapporter</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
            Komplett liste over alle innleste rapporter med status.
          </p>
          <span className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
            Åpne liste
          </span>
        </Link>

        {/* AI model */}
        <Link
          href="/admin/extraction-learning"
          className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
        >
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Modell
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">AI-modellen</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
            Følg læring, kalibrering og modellrelaterte vurderinger.
          </p>
          <span className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
            Åpne modell
          </span>
        </Link>

        {/* Metric mapping */}
        <Link
          href="/admin/metric-mapping"
          className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
        >
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Modell
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Regnskapsmapping</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
            Koble norske kildelabels til de standardiserte regnskapsnøklene.
          </p>
          <span className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
            Åpne mapping
          </span>
        </Link>

        {/* Data quality */}
        <Link
          href="/admin/annual-report-unified-confidence"
          className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors hover:bg-[var(--px-subtle)]"
        >
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Kvalitet
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Datakvalitet</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
            Se hvilke rapporter og kontroller som krever oppfølging.
          </p>
          <span className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
            Åpne oversikt
          </span>
        </Link>

        {/* Users */}
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
            Brukere
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">Brukere og roller</h3>
          <div className="mt-3 space-y-1 text-sm text-[var(--px-muted)]">
            <p>
              <strong className="text-[var(--px-text)]">{model.userStats.total}</strong> brukere totalt
            </p>
            <p>
              <strong className="text-[var(--px-text)]">{model.userStats.reviewers}</strong> finansreviewere ·{" "}
              <strong className="text-[var(--px-text)]">{model.userStats.admins}</strong> admins
            </p>
          </div>
          {model.userStats.admins > 0 ? (
            <Link
              href="/admin/users"
              className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
            >
              Administrer brukere
            </Link>
          ) : null}
        </div>
      </section>

      {/* Recent activity */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">Siste aktivitet</h2>
          <div className="h-px flex-1 bg-[var(--px-border)]" />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {model.recentActivity.map((activity) => (
            <div
              key={activity.key}
              className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5"
            >
              <p className="text-sm font-semibold text-[var(--px-text)]">{activity.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">{activity.description}</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
                  {activity.timestamp}
                </span>
                {activity.href ? (
                  <Link
                    href={activity.href as never}
                    className="rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-1.5 text-xs font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
                  >
                    Åpne
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
