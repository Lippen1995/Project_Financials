import React from "react";
import Link from "next/link";

import type {
  AdminCoverageStage,
  AdminHubActionItem,
  AdminHubModel,
  AdminHubNavigationItem,
  AdminHubTone,
} from "@/server/services/admin-hub-service";
import type {
  BackgroundJobControlCenterItem,
  BackgroundJobHealth,
} from "@/server/services/background-job-control-center-service";

type AdminHubViewProps = {
  model: AdminHubModel;
  canManageAiEconomics: boolean;
};

function stageToneClasses(tone: AdminHubTone) {
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

function CoverageStageCard({ stage }: { stage: AdminCoverageStage }) {
  const tone = stageToneClasses(stage.tone);
  const body = (
    <>
      <span
        className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone.pill}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        {stage.label}
      </span>
      <span className="editorial-display text-[2rem] leading-none text-[var(--px-text)]">
        {stage.count.toLocaleString("nb-NO")}
      </span>
      <span className="mt-2 text-xs leading-5 text-[var(--px-muted)]">{stage.detail}</span>
    </>
  );

  const className =
    "group flex flex-col items-center rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5 text-center transition-colors hover:bg-[var(--px-subtle)]";

  if (stage.href) {
    return (
      <Link href={stage.href as never} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function ActionCard({ item }: { item: AdminHubActionItem }) {
  const className = `group flex items-center justify-between rounded-2xl border p-5 transition-colors ${
    item.urgent
      ? "border-red-200 bg-red-50 hover:bg-red-100"
      : "border-amber-200 bg-amber-50 hover:bg-amber-100"
  }`;

  const body = (
    <>
      <div>
        <p
          className={`data-label text-[11px] uppercase tracking-widest ${
            item.urgent ? "text-red-600" : "text-amber-700"
          }`}
        >
          {item.title}
        </p>
        <p
          className={`editorial-display mt-1 text-[2rem] leading-none ${
            item.urgent ? "text-red-700" : "text-amber-800"
          }`}
        >
          {item.value.toLocaleString("nb-NO")}
        </p>
        <p className={`mt-1.5 text-sm ${item.urgent ? "text-red-600" : "text-amber-700"}`}>
          {item.detail}
        </p>
      </div>
      {item.href ? (
        <span className={`ml-4 shrink-0 text-lg ${item.urgent ? "text-red-400" : "text-amber-400"}`}>
          →
        </span>
      ) : null}
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href as never} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function NavigationCard({ item }: { item: AdminHubNavigationItem }) {
  const className =
    "group flex flex-col rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 transition-colors";

  const body = (
    <>
      {item.eyebrow ? (
        <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
          {item.eyebrow}
        </p>
      ) : null}
      <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">{item.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-[var(--px-muted)]">{item.description}</p>
      {item.available && item.actionLabel ? (
        <span className="mt-4 inline-flex self-start rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
          {item.actionLabel}
        </span>
      ) : null}
      {!item.available && item.restrictionLabel ? (
        <span className="mt-4 inline-flex self-start rounded-full border border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-2 text-sm font-medium text-[var(--px-muted)]">
          {item.restrictionLabel}
        </span>
      ) : null}
    </>
  );

  if (item.available && item.href) {
    return (
      <Link href={item.href as never} className={`${className} hover:bg-[var(--px-subtle)]`}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function backgroundJobTone(health: BackgroundJobHealth) {
  switch (health) {
    case "healthy":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "active":
      return "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)]";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function formatJobTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString("nb-NO") : "Ikke registrert";
}

function BackgroundJobCard({ job }: { job: BackgroundJobControlCenterItem }) {
  const metrics = [
    ["Kødybde", job.queueDepth],
    ["Forfalt", job.dueCount],
    ["Aktive kjøringer", job.runningCount],
    ["Køfeil", job.errorCount],
    ["Feil sist", job.latestRun?.failedCount ?? 0],
  ] as const;

  return (
    <article className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
            {job.cadenceLabel}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--px-text)]">{job.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">{job.description}</p>
        </div>
        <span
          className={`data-label inline-flex rounded-full border px-4 py-2 text-[10px] uppercase tracking-widest ${backgroundJobTone(job.health)}`}
        >
          {job.statusLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-[var(--px-subtle)] p-4">
            <dt className="data-label text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
              {label}
            </dt>
            <dd className="mt-2 text-2xl font-semibold text-[var(--px-text)]">
              {value.toLocaleString("nb-NO")}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 text-sm text-[var(--px-muted)] sm:grid-cols-2">
        <p>
          <span className="data-label block text-[10px] uppercase tracking-widest">
            Siste kjøring
          </span>
          <span className="mt-2 block text-[var(--px-text)]">
            {formatJobTimestamp(job.latestRun?.startedAt ?? null)}
          </span>
        </p>
        <p>
          <span className="data-label block text-[10px] uppercase tracking-widest">
            Eldste ventende
          </span>
          <span className="mt-2 block text-[var(--px-text)]">
            {formatJobTimestamp(job.oldestQueuedAt)}
          </span>
        </p>
      </div>

      {job.health === "error" && job.latestFailure?.errorMessage ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {job.latestFailure.errorMessage}
        </p>
      ) : null}
    </article>
  );
}

export default function AdminHubView({ model, canManageAiEconomics }: AdminHubViewProps) {
  // AI economics is gated by role in the model, but the caller may withhold it
  // independently; honour the stricter of the two.
  const navigationSections = model.navigationSections.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => canManageAiEconomics || item.key !== "ai-economics",
    ),
  }));

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
      {model.actionItems.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-4">
            <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">Krever tiltak</h2>
            <div className="h-px flex-1 bg-[var(--px-border)]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {model.actionItems.map((item) => (
              <ActionCard key={item.key} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">
              Bakgrunnsjobber
            </h2>
            <p className="mt-2 text-sm text-[var(--px-muted)]">
              Kø, etterslep og siste registrerte kjøring for de kritiske populeringsflytene.
            </p>
          </div>
          <div className="h-px flex-1 bg-[var(--px-border)]" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {model.backgroundJobs.map((job) => (
            <BackgroundJobCard key={job.jobKey} job={job} />
          ))}
        </div>
      </section>

      {/* Ingestion coverage */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">
            Regnskapshenting fra Brreg
          </h2>
          <div className="h-px flex-1 bg-[var(--px-border)]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {model.coverage
            .filter((stage) => stage.count > 0 || stage.tone === "error")
            .map((stage) => (
              <CoverageStageCard key={stage.key} stage={stage} />
            ))}
        </div>
        <div className="flex flex-wrap gap-6 rounded-xl bg-[var(--px-subtle)] px-5 py-4 text-sm text-[var(--px-muted)]">
          <span>
            <strong className="text-[var(--px-text)]">
              {model.coverageTotals.companies.toLocaleString("nb-NO")}
            </strong>{" "}
            virksomheter i basen
          </span>
          <span>
            <strong className="text-green-700">
              {model.coverageTotals.withFinancials.toLocaleString("nb-NO")}
            </strong>{" "}
            med offisielt regnskap
          </span>
          <span>
            <strong className="text-[var(--px-text)]">
              {model.coverageTotals.coveragePercent.toLocaleString("nb-NO", {
                maximumFractionDigits: 1,
              })}{" "}
              %
            </strong>{" "}
            dekning
          </span>
          <span>
            <strong
              className={
                model.coverageTotals.neverFetched ? "text-amber-700" : "text-[var(--px-text)]"
              }
            >
              {model.coverageTotals.neverFetched.toLocaleString("nb-NO")}
            </strong>{" "}
            aldri hentet
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

      {/* Human-in-the-loop steps */}
      {model.humanSteps.length > 0 ? (
        <section id="human-review" className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">
              Steg som krever menneskelig vurdering
            </h2>
            <div className="h-px flex-1 bg-[var(--px-border)]" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {model.humanSteps.map((step) => (
              <Link
                key={step.key}
                href={step.href as never}
                className="group rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5 transition-colors hover:bg-[var(--px-subtle)]"
              >
                <p className="text-sm font-semibold text-[var(--px-text)]">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">{step.description}</p>
                <span className="mt-4 inline-flex rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)]">
                  {step.actionLabel}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Navigation sections */}
      {navigationSections.map((section) => (
        <section key={section.title} className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">{section.title}</h2>
            <div className="h-px flex-1 bg-[var(--px-border)]" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => (
              <NavigationCard key={item.key} item={item} />
            ))}
          </div>
        </section>
      ))}

      {/* Recent activity */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-[1.1rem] font-semibold text-[var(--px-text)]">Siste aktivitet</h2>
          <div className="h-px flex-1 bg-[var(--px-border)]" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {model.recentActivity.map((activity) => (
            <div
              key={activity.key}
              className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5"
            >
              <p className="text-sm font-semibold text-[var(--px-text)]">{activity.title}</p>
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
