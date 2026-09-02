import React from "react";
import Link from "next/link";

import type {
  AdminCoverageStage,
  AdminHubActionItem,
  AdminHubActivity,
  AdminHubMetric,
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

/** Dots, bars and rules: quiet marks that read as chrome, not as figures. */
const STAGE_COLOR: Record<AdminHubTone, string> = {
  neutral: "rgba(15, 23, 42, 0.28)",
  active: "var(--px-accent)",
  success: "var(--px-success)",
  warning: "var(--px-watch)",
  error: "var(--px-error)",
};

/** Figures and their labels: the deeper, text-grade variants of the same tones. */
const FIGURE_COLOR: Record<AdminHubTone, string> = {
  neutral: "var(--px-text)",
  active: "var(--px-accent)",
  success: "var(--px-success)",
  warning: "var(--px-warning)",
  error: "var(--px-error)",
};

function formatCount(value: number) {
  return value.toLocaleString("nb-NO");
}

/**
 * The model hands over an ISO timestamp. Format it in UTC so the string is
 * stable regardless of where it is rendered — this is an audit stamp, not a
 * wall clock.
 */
function formatGeneratedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`material-symbols-outlined ${className ?? ""}`}>
      {name}
    </span>
  );
}

/** Section title with a hairline rule running out to the column edge. */
function SectionHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center gap-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.04em] text-[var(--px-text)]">
        {title}
      </h2>
      {meta ? <span className="data-label text-[9px] text-[var(--px-muted)]">{meta}</span> : null}
      <div className="h-px flex-1 bg-[var(--px-border)]" />
    </div>
  );
}

function ActionItem({ item }: { item: AdminHubActionItem }) {
  const color = item.urgent ? "var(--px-error)" : "var(--px-warning)";

  const body = (
    <>
      <div>
        <span className="data-label text-[10px]" style={{ color }}>
          {item.title}
        </span>
        <p
          className="editorial-display mt-2 whitespace-nowrap text-[32px] leading-none"
          style={{ color }}
        >
          {formatCount(item.value)}
        </p>
        <p className="mt-2 text-[13px] leading-[1.5] text-[var(--px-muted)]">{item.detail}</p>
      </div>
      {item.href ? (
        <MaterialIcon name="arrow_forward" className="text-[18px] opacity-65" />
      ) : null}
    </>
  );

  const className =
    "-ml-px flex items-start justify-between gap-3 border-l border-[var(--px-border-subtle)] py-1 pl-5 pr-6 transition-colors";

  if (item.href) {
    return (
      <Link
        href={item.href as never}
        className={`${className} hover:border-l-[color:currentColor]`}
        style={{ color }}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className={className} style={{ color }}>
      {body}
    </div>
  );
}

function CoverageRow({ stage, share }: { stage: AdminCoverageStage; share: number }) {
  const color = STAGE_COLOR[stage.tone];

  const body = (
    <>
      <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--px-text)]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        {stage.label}
      </span>
      <span className="whitespace-nowrap text-right font-mono text-[15px] tabular-nums text-[var(--px-text)]">
        {formatCount(stage.count)}
      </span>
      <span className="block h-2 overflow-hidden rounded-[var(--radius-sm)] bg-[rgba(15,23,42,0.05)]">
        <span
          className="block h-full rounded-[var(--radius-sm)]"
          style={{ width: `${share}%`, background: color }}
        />
      </span>
      <span className="hidden text-xs leading-[1.45] text-[var(--px-muted)] xl:block">
        {stage.detail}
      </span>
    </>
  );

  const className =
    "grid grid-cols-[minmax(140px,220px)_96px_minmax(60px,1fr)] items-center gap-4 border-b border-[var(--px-border-subtle)] px-2 py-3 xl:grid-cols-[minmax(140px,220px)_96px_minmax(60px,1fr)_minmax(0,190px)]";

  if (stage.href) {
    return (
      <Link
        href={stage.href as never}
        className={`${className} transition-colors hover:bg-[rgba(255,255,255,0.65)]`}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function NavigationItem({ item }: { item: AdminHubNavigationItem }) {
  const label = item.available ? item.actionLabel : item.restrictionLabel;

  const body = (
    <>
      {item.eyebrow ? (
        <span className="data-label text-[9px] text-[var(--px-accent)]">{item.eyebrow}</span>
      ) : null}
      <p className="mt-2 text-[15px] font-semibold text-[var(--px-text)]">{item.title}</p>
      <p className="mt-2 flex-1 text-[13px] leading-[1.55] text-[var(--px-muted)]">
        {item.description}
      </p>
      {label ? (
        <span
          className={`mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-medium ${
            item.available ? "text-[var(--px-accent)]" : "text-[var(--px-muted)]"
          }`}
        >
          {label}
          <MaterialIcon name={item.available ? "arrow_forward" : "lock"} className="text-[16px]" />
        </span>
      ) : null}
    </>
  );

  const className =
    "-ml-px flex flex-col border-l border-[var(--px-border-subtle)] pb-4 pl-5 pr-6 pt-3.5 transition-colors";

  if (item.available && item.href) {
    return (
      <Link href={item.href as never} className={`${className} hover:border-l-[var(--px-accent)]`}>
        {body}
      </Link>
    );
  }

  return <div className={`${className} opacity-[0.72]`}>{body}</div>;
}

function backgroundJobToneClasses(health: BackgroundJobHealth) {
  switch (health) {
    case "healthy":
      return "border-[var(--px-success-border)] bg-[var(--px-success-soft)] text-[var(--px-success)]";
    case "active":
      return "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)]";
    case "error":
      return "border-[var(--px-error-border)] bg-[var(--px-error-soft)] text-[var(--px-error)]";
    default:
      return "border-[var(--px-warning-border)] bg-[var(--px-warning-soft)] text-[var(--px-warning)]";
  }
}

function formatJobTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString("nb-NO") : "Ikke registrert";
}

function BackgroundJobRow({ job }: { job: BackgroundJobControlCenterItem }) {
  const metrics = [
    ["Kødybde", job.queueDepth],
    ["Forfalt", job.dueCount],
    ["Aktive kjøringer", job.runningCount],
    ["Køfeil", job.errorCount],
    ["Feil sist", job.latestRun?.failedCount ?? 0],
  ] as const;

  return (
    <article className="border-b border-[var(--px-border-subtle)] px-2 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="data-label text-[9px] text-[var(--px-muted)]">{job.cadenceLabel}</span>
          <p className="mt-1.5 text-[15px] font-semibold text-[var(--px-text)]">{job.title}</p>
          <p className="mt-1.5 max-w-[70ch] text-[13px] leading-[1.55] text-[var(--px-muted)]">
            {job.description}
          </p>
        </div>
        <span
          className={`data-label shrink-0 rounded-full border px-2.5 py-1 text-[9px] ${backgroundJobToneClasses(job.health)}`}
        >
          {job.statusLabel}
        </span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2">
        {metrics.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="data-label text-[9px] text-[var(--px-muted)]">{label}</dt>
            <dd className="font-mono text-[15px] tabular-nums text-[var(--px-text)]">
              {formatCount(value)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-2.5 flex flex-wrap gap-x-7 gap-y-1 text-xs text-[var(--px-muted)]">
        <span>
          <span className="data-label text-[9px]">Siste kjøring</span>{" "}
          {formatJobTimestamp(job.latestRun?.startedAt ?? null)}
        </span>
        <span>
          <span className="data-label text-[9px]">Eldste ventende</span>{" "}
          {formatJobTimestamp(job.oldestQueuedAt)}
        </span>
      </div>

      {job.health === "error" && job.latestFailure?.errorMessage ? (
        <p className="mt-3 border-l-2 border-[var(--px-error)] bg-[var(--px-error-soft)] px-3 py-2 text-[13px] text-[var(--px-error)]">
          {job.latestFailure.errorMessage}
        </p>
      ) : null}
    </article>
  );
}

function SidebarMetric({ metric }: { metric: AdminHubMetric }) {
  return (
    <div className="border-t border-[var(--px-border-subtle)] pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="data-label text-[10px] text-[var(--px-muted)]">{metric.title}</span>
        <span
          className="whitespace-nowrap font-mono text-[19px] font-medium tabular-nums"
          style={{ color: FIGURE_COLOR[metric.tone ?? "neutral"] }}
        >
          {metric.value}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-[1.5] text-[var(--px-muted)]">{metric.detail}</p>
    </div>
  );
}

function ActivityEntry({ activity }: { activity: AdminHubActivity }) {
  return (
    <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-2.5 pt-3.5">
      <span
        className="mt-1.5 block h-[7px] w-[7px] rounded-full"
        style={{ background: STAGE_COLOR[activity.tone ?? "neutral"] }}
      />
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-[var(--px-text)]">{activity.title}</p>
          {activity.href ? (
            <Link
              href={activity.href as never}
              className="data-label shrink-0 text-[9px] text-[var(--px-accent)] hover:text-[var(--px-action-hover)]"
            >
              Åpne
            </Link>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-[1.5] text-[var(--px-muted)]">{activity.description}</p>
        <p className="data-label mt-1.5 text-[9px] text-[var(--px-muted)]">{activity.timestamp}</p>
      </div>
    </div>
  );
}

export default function AdminHubView({ model, canManageAiEconomics }: AdminHubViewProps) {
  // AI economics is gated by role in the model, but the caller may withhold it
  // independently; honour the stricter of the two.
  const navigationSections = model.navigationSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => canManageAiEconomics || item.key !== "ai-economics"),
  }));

  const { companies, withFinancials, coveragePercent, neverFetched } = model.coverageTotals;
  const coverageStages = model.coverage.filter(
    (stage) => stage.count > 0 || stage.tone === "error",
  );
  const shareOfBase = (count: number) =>
    companies > 0 ? Math.min(100, Math.max(0, (count / companies) * 100)) : 0;
  const coverageBarWidth = Math.min(100, Math.max(0, coveragePercent));
  // One decimal, always — "40,0 %" reads as a measurement, "40 %" as a guess.
  const coveragePercentLabel = coveragePercent.toLocaleString("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  // The sidebar's "administer users" affordance follows the same availability
  // rule as the navigation card, so role gating lives in one place: the model.
  const usersNavItem = model.navigationSections
    .flatMap((section) => section.items)
    .find((item) => item.key === "users");

  return (
    <div className="pb-10">
      {/* Editorial hero — full-bleed dark panel carrying the headline coverage figure */}
      <section className="-mx-4 bg-[var(--px-panel)] text-white sm:-mx-6 lg:-mx-10">
        <div className="grid gap-8 px-4 pb-7 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end lg:gap-12 lg:px-10">
          <div>
            <p className="data-label m-0 text-[10px] text-white/55">Administrator</p>
            <h1 className="editorial-display mt-2.5 text-[clamp(32px,4vw,44px)] leading-[1.1]">
              {model.title}
            </h1>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.6] text-white/70">
              {model.subtitle}
            </p>
            <p className="data-label mt-4 text-[10px] text-white/45">
              Oppdatert {formatGeneratedAt(model.generatedAt)}
            </p>
          </div>

          <div className="pb-1">
            <p className="data-label m-0 text-[10px] text-white/55">Regnskapsdekning</p>
            <div className="mt-2 flex items-baseline gap-2.5">
              <span className="editorial-display text-[40px] leading-none">
                {coveragePercentLabel} %
              </span>
              <span className="text-[13px] text-white/60">
                {formatCount(withFinancials)} av {formatCount(companies)}
              </span>
            </div>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/[0.12]">
              <div
                className="h-full bg-[var(--px-chart-2)]"
                style={{ width: `${coverageBarWidth}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 pt-6 xl:grid-cols-[minmax(0,9fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-7">
          {model.actionItems.length > 0 ? (
            <section>
              <SectionHeading title="Krever tiltak" meta={`${model.actionItems.length} punkter`} />
              <div className="grid gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {model.actionItems.map((item) => (
                  <ActionItem key={item.key} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionHeading title="Regnskapshenting fra Brreg" meta="Andel av basen" />
            <div>
              {coverageStages.map((stage) => (
                <CoverageRow key={stage.key} stage={stage} share={shareOfBase(stage.count)} />
              ))}
              <div className="flex flex-wrap gap-x-7 gap-y-2 px-2 py-3.5 text-[13px] text-[var(--px-muted)]">
                <span>
                  <strong className="font-mono font-medium tabular-nums text-[var(--px-text)]">
                    {formatCount(companies)}
                  </strong>{" "}
                  virksomheter i basen
                </span>
                <span>
                  <strong className="font-mono font-medium tabular-nums text-[var(--px-success)]">
                    {formatCount(withFinancials)}
                  </strong>{" "}
                  med offisielt regnskap
                </span>
                <span>
                  <strong className="font-mono font-medium tabular-nums text-[var(--px-text)]">
                    {coveragePercentLabel} %
                  </strong>{" "}
                  dekning
                </span>
                <span>
                  <strong
                    className={`font-mono font-medium tabular-nums ${
                      neverFetched > 0 ? "text-[var(--px-warning)]" : "text-[var(--px-text)]"
                    }`}
                  >
                    {formatCount(neverFetched)}
                  </strong>{" "}
                  aldri hentet
                </span>
              </div>
            </div>
          </section>

          {model.backgroundJobs.length > 0 ? (
            <section>
              <SectionHeading title="Bakgrunnsjobber" meta="Kø og siste kjøring" />
              <div>
                {model.backgroundJobs.map((job) => (
                  <BackgroundJobRow key={job.jobKey} job={job} />
                ))}
              </div>
            </section>
          ) : null}

          {navigationSections.map((section) => (
            <section key={section.title}>
              <SectionHeading title={section.title} />
              <div className="grid gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <NavigationItem key={item.key} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-8 border-[var(--px-border-subtle)] xl:sticky xl:top-32 xl:border-l xl:pl-7">
          <div>
            <p className="data-label mb-3 text-[10px] text-[var(--px-muted)]">Nøkkeltall</p>
            <div className="flex flex-col gap-3">
              {model.metrics.slice(0, 4).map((metric) => (
                <SidebarMetric key={metric.key} metric={metric} />
              ))}
            </div>
          </div>

          <div>
            <p className="data-label mb-1 text-[10px] text-[var(--px-muted)]">Siste aktivitet</p>
            {model.recentActivity.map((activity) => (
              <ActivityEntry key={activity.key} activity={activity} />
            ))}
          </div>

          <div>
            <p className="data-label mb-3 text-[10px] text-[var(--px-muted)]">Tilgang</p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Brukere", model.userStats.total],
                  ["Admins", model.userStats.admins],
                  ["Reviewere", model.userStats.reviewers],
                  ["Vanlige", model.userStats.regularUsers],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="m-0 font-mono text-[22px] tabular-nums text-[var(--px-text)]">
                    {formatCount(value)}
                  </p>
                  <p className="data-label mt-0.5 text-[9px] text-[var(--px-muted)]">{label}</p>
                </div>
              ))}
            </div>
            {usersNavItem?.available && usersNavItem.href ? (
              <Link
                href={usersNavItem.href as never}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--px-accent)] hover:text-[var(--px-action-hover)]"
              >
                Administrer brukere
                <MaterialIcon name="arrow_forward" className="text-[16px]" />
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
