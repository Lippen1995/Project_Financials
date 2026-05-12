import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyAnnouncementsTimeline } from "@/components/company/company-announcements-timeline";
import { CompanyFinancialDiscussions } from "@/components/company/company-financial-discussions";
import { CompanyPetroleumTab } from "@/components/company/company-petroleum-tab";
import { CompanyTabId, CompanyTabs, isCompanyTab } from "@/components/company/company-tabs";
import { FinancialDocuments } from "@/components/company/financial-documents";
import { FinancialTimeSeriesTable } from "@/components/company/financial-time-series-table";
import { KeyFiguresGrid } from "@/components/company/key-figures-grid";
import { LegalStructure } from "@/components/company/legal-structure";
import { MetricGrid } from "@/components/company/metric-grid";
import { OrganizationTab } from "@/components/company/organization-tab";
import { OverviewAnalytics } from "@/components/company/overview-analytics";
import { PremiumLock } from "@/components/paywall/premium-lock";
import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { CompanyProfile, NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { isPremium } from "@/server/billing/subscription";
import { getCompanyDdDiscussionContext } from "@/server/services/company-dd-discussion-service";
import {
  getCompanyPetroleumProfile,
  getCompanyPetroleumTabVisibility,
} from "@/server/services/company-petroleum-service";
import {
  getCompanyAnnouncementDetail,
  getCompanyAnnouncements,
  getCompanyProfile,
} from "@/server/services/company-service";
import {
  listFinancialMetricCommentThreads,
  listFinancialStatementCommentThreads,
} from "@/server/services/dd-comment-service";
import { getLegalStructure } from "@/server/services/legal-structure-service";

function sortStatements(statements: NormalizedFinancialStatement[]) {
  return [...statements].sort((a, b) => a.fiscalYear - b.fiscalYear);
}

function ratioLabel(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "Ikke tilgjengelig";
  }

  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} %`;
}

function getLatestStatements(statements: NormalizedFinancialStatement[]) {
  const ordered = sortStatements(statements);
  return {
    latest: ordered.at(-1) ?? null,
    previous: ordered.at(-2) ?? null,
  };
}

function getControlSummary(roles: NormalizedRole[], rolesAvailability?: CompanyProfile["rolesAvailability"]) {
  const managingDirector = roles.find((role) => /daglig leder/i.test(role.title));
  const chair = roles.find((role) => /styreleder/i.test(role.title));

  if (managingDirector && chair) {
    return `${chair.person.fullName} er styreleder, ${managingDirector.person.fullName} er daglig leder`;
  }

  if (chair) {
    return `${chair.person.fullName} er registrert som styreleder`;
  }

  if (managingDirector) {
    return `${managingDirector.person.fullName} er registrert som daglig leder`;
  }

  if (roles.length > 0) {
    return `${roles.length} registrerte roller er tilgjengelige`;
  }

  if (rolesAvailability && !rolesAvailability.available) {
    return rolesAvailability.message ?? "Rolledetaljer er ikke lastet i denne visningen";
  }

  return "Ingen registrerte roller er tilgjengelige";
}

function getExecutiveSignals(profile: CompanyProfile) {
  const { company, financialStatements, roles } = profile;
  const { latest, previous } = getLatestStatements(financialStatements);

  const solidity =
    latest?.equity !== null &&
    latest?.equity !== undefined &&
    latest?.assets !== null &&
    latest?.assets !== undefined &&
    latest.assets !== 0
      ? (latest.equity / latest.assets) * 100
      : null;

  const profitability =
    latest?.operatingProfit !== null &&
    latest?.operatingProfit !== undefined &&
    latest?.revenue !== null &&
    latest?.revenue !== undefined &&
    latest.revenue !== 0
      ? (latest.operatingProfit / latest.revenue) * 100
      : null;

  const revenueChange =
    latest?.revenue !== null &&
    latest?.revenue !== undefined &&
    previous?.revenue !== null &&
    previous?.revenue !== undefined &&
    previous.revenue !== 0
      ? ((latest.revenue - previous.revenue) / previous.revenue) * 100
      : null;

  const investigationNotes = [
    company.status !== "ACTIVE" ? `Foretaket har status ${company.status}.` : null,
    latest?.operatingProfit !== null &&
    latest?.operatingProfit !== undefined &&
    latest.operatingProfit < 0
      ? "Siste tilgjengelige driftsresultat er negativt."
      : null,
    revenueChange !== null && revenueChange < 0 ? "Omsetningen er lavere enn forrige år." : null,
    roles.length <= 2 ? "Styringsstrukturen er kompakt og bør vurderes nærmere." : null,
  ].filter(Boolean) as string[];

  return {
    latestYear: latest?.fiscalYear ?? null,
    revenue: formatCurrency(latest?.revenue ?? null),
    operatingProfit: formatCurrency(latest?.operatingProfit ?? null),
    equity: formatCurrency(latest?.equity ?? null),
    employees: formatNumber(company.employeeCount),
    foundedAt: company.foundedAt ? new Date(company.foundedAt).getFullYear() : null,
    solidity: ratioLabel(solidity),
    profitability: ratioLabel(profitability),
    revenueChange: ratioLabel(revenueChange),
    controlSummary: getControlSummary(roles),
    investigationNotes:
      investigationNotes.length > 0
        ? investigationNotes
        : [
            "Ingen umiddelbare avvik i toppsignalene. Fortsett med regnskap og struktur for dypere analyse.",
          ],
  };
}

function ExecutiveSnapshot({ profile }: { profile: CompanyProfile }) {
  const { company, financialsAvailability, rolesAvailability } = profile;
  const signals = getExecutiveSignals(profile);
  const primarySignals = [
    { label: "Omsetning", value: signals.revenue },
    { label: "EBIT", value: signals.operatingProfit },
    { label: "Egenkapital", value: signals.equity },
    { label: "Ansatte", value: signals.employees },
    { label: "Etablert", value: signals.foundedAt ? String(signals.foundedAt) : "Ikke tilgjengelig" },
    { label: "Status", value: company.status },
  ];
  const secondarySignals = [
    { label: "Soliditet", value: signals.solidity },
    { label: "Lønnsomhet", value: signals.profitability },
    { label: "Utvikling mot forrige år", value: signals.revenueChange },
    { label: "Kontrollsignal", value: signals.controlSummary },
  ];

  return (
    <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.82)] xl:grid-cols-[240px,minmax(0,1fr),340px]">
      <div className="border-b border-[rgba(15,23,42,0.08)] p-6 xl:border-b-0 xl:border-r">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
          Hovedsignaler
        </div>
        <h2 className="mt-3 text-[1.8rem] font-semibold text-slate-950">Rask vurdering</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          De viktigste driftssignalene, kontrollspørsmålene og tilgjengeligheten samlet i ett lag.
        </p>
      </div>

      <div className="p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-4">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Finansielle signaler
            </div>
            <h2 className="mt-2 text-[1.6rem] font-semibold text-slate-950">
              Viktigste signaler for rask vurdering
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">
              Oppsummerer størrelse, drift, kapital og formell kontroll i ett beslutningslag.
            </p>
          </div>
          <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(49,73,95,0.05)] px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            {signals.latestYear ? `Siste år: ${signals.latestYear}` : "Regnskap ikke tilgjengelig"}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {primarySignals.map((signal) => (
            <div
              key={signal.label}
              className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4"
            >
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                {signal.label}
              </div>
              <div className="mt-2 text-[1.45rem] font-semibold tracking-tight text-slate-950 tabular-nums">
                {signal.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 border-t border-[rgba(15,23,42,0.08)] pt-4 md:grid-cols-2">
          {secondarySignals.map((signal) => (
            <div key={signal.label}>
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                {signal.label}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{signal.value}</div>
            </div>
          ))}
        </div>
      </div>

      <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-6 xl:border-l xl:border-t-0">
        <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
          Verdt å undersøke
        </div>
        <div className="mt-4 space-y-2">
          {signals.investigationNotes.map((note) => (
            <div
              key={note}
              className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-white p-3 text-sm leading-6 text-slate-700"
            >
              {note}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
            Tilgjengelighet
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900">
            {financialsAvailability.available
              ? "Regnskap er tilgjengelig."
              : "Regnskap er delvis tilgjengelig."}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{financialsAvailability.message}</p>
          <div className="mt-4 border-t border-[rgba(15,23,42,0.08)] pt-4 text-sm leading-6 text-slate-600">
            <div className="font-semibold text-slate-900">
              {rolesAvailability.available
                ? "Rolledatakilde er tilgjengelig."
                : "Rolledatakilde er ikke bekreftet."}
            </div>
            <p className="mt-1">{rolesAvailability.message}</p>
          </div>
        </div>
      </aside>
    </section>
  );
}

function healthScoreLabel(score: number): string {
  if (score >= 80) return "Utmerket";
  if (score >= 60) return "God";
  if (score >= 40) return "Akseptabel";
  if (score >= 20) return "Svak";
  return "Kritisk";
}

function HealthGaugeCard({ score }: { score: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="hidden items-center gap-6 rounded-xl border border-[rgba(15,23,42,0.08)] bg-slate-50 p-5 md:flex">
      <div className="text-right">
        <p className="data-label mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--px-muted)]">
          Finansiell helse
        </p>
        <div className="flex items-baseline justify-end gap-1.5">
          <span className="text-[2.75rem] font-semibold tabular-nums leading-none text-[var(--px-accent)]">
            {score}
          </span>
          <span className="data-label text-sm text-[var(--px-muted)]">/ 100</span>
        </div>
        <p className="data-label mt-1 text-[10px] text-[var(--px-muted)]">
          {healthScoreLabel(score)}
        </p>
      </div>
      <div className="relative h-20 w-20 shrink-0">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(0,102,138,0.1)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r={r} fill="none" stroke="var(--px-accent)" strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-[28px] text-[var(--px-accent)]">favorite</span>
        </div>
      </div>
    </div>
  );
}

function deriveHealthScore(profile: CompanyProfile): number {
  const { company, financialStatements } = profile;
  const { latest } = getLatestStatements(financialStatements);
  let score = 20;
  if (company.status === "ACTIVE") score += 20;
  if (latest?.operatingProfit != null && latest.operatingProfit > 0) score += 20;
  if (latest?.equity != null && latest.equity > 0) score += 15;
  if (latest?.revenue != null) score += 10;
  if (
    latest?.equity != null && latest?.assets != null && latest.assets > 0 &&
    (latest.equity / latest.assets) * 100 > 30
  ) score += 15;
  return Math.min(100, score);
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const filtered = values.filter((v): v is number => v !== null);
  if (filtered.length < 2) return <div className="h-8 w-20" />;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = max - min || 1;
  const w = 80;
  const h = 32;
  const points = filtered
    .map((v, i) => `${(i / (filtered.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  const isPositive = filtered[filtered.length - 1] >= filtered[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-20 shrink-0" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "#10b981" : "#ef4444"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FinancialTrendsStrip({ statements }: { statements: NormalizedFinancialStatement[] }) {
  const sorted = sortStatements(statements);
  if (sorted.length === 0) return null;
  const latest = sorted.at(-1);
  const equityRatios = sorted.map((s) =>
    s.equity != null && s.assets != null && s.assets !== 0 ? (s.equity / s.assets) * 100 : null,
  );
  const metrics = [
    { label: "Omsetning", value: formatCurrency(latest?.revenue ?? null), values: sorted.map((s) => s.revenue ?? null) },
    { label: "EBIT", value: formatCurrency(latest?.operatingProfit ?? null), values: sorted.map((s) => s.operatingProfit ?? null) },
    { label: "EK-andel", value: ratioLabel(equityRatios.at(-1) ?? null), values: equityRatios },
  ];
  return (
    <div className="grid grid-cols-3 divide-x divide-[rgba(15,23,42,0.08)] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white">
      {metrics.map(({ label, value, values }) => (
        <div key={label} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">{label}</div>
            <div className="mt-1 text-[1.1rem] font-semibold tabular-nums text-slate-950">{value}</div>
          </div>
          <Sparkline values={values} />
        </div>
      ))}
    </div>
  );
}

function CompanyHeader({ profile, healthScore }: { profile: CompanyProfile; healthScore: number }) {
  const { company } = profile;
  const municipality = company.municipality ?? company.addresses[0]?.city ?? null;

  const statusChip =
    company.status === "ACTIVE"
      ? { bg: "bg-[rgba(233,246,238,1)] border-[#a5d6b7] text-[#2e7d42]", icon: "verified", label: "Aktiv" }
      : company.status === "BANKRUPT"
        ? { bg: "bg-red-50 border-red-200 text-red-700", icon: "cancel", label: "Konkurs" }
        : { bg: "bg-slate-100 border-slate-200 text-slate-600", icon: "info", label: company.status };

  return (
    <section className="border-b border-[rgba(15,23,42,0.08)] pb-8">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0 flex-1">
          {company.legalForm ? (
            <div className="inline-flex items-center rounded bg-[var(--px-text)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
              {company.legalForm}
            </div>
          ) : null}
          <h1 className="editorial-display mt-3 text-[3rem] leading-[0.96] text-slate-950 sm:text-[4rem] xl:text-[4.5rem]">
            {company.name}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            Org.nr. {company.orgNumber}
            {company.registeredAt
              ? ` · Registrert ${new Date(company.registeredAt).getFullYear()}`
              : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {/* Status */}
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-[11px] font-semibold uppercase ${statusChip.bg}`}
            >
              <span className="material-symbols-outlined text-[14px]">{statusChip.icon}</span>
              {statusChip.label}
            </span>
            {/* Municipality */}
            {municipality ? (
              <span className="inline-flex items-center gap-1.5 rounded border border-[rgba(15,23,42,0.12)] bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                {municipality}
              </span>
            ) : null}
            {/* Industry */}
            {company.industryCode?.code ? (
              <span className="inline-flex items-center gap-1.5 rounded border border-[rgba(15,23,42,0.12)] bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                <span className="material-symbols-outlined text-[14px]">category</span>
                {company.industryCode.code}
                {company.industryCode.title ? ` · ${company.industryCode.title}` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <HealthGaugeCard score={healthScore} />
      </div>
    </section>
  );
}

function QuickLinksSidebar({ company }: { company: NormalizedCompany }) {
  const orgNr = company.orgNumber.replace(/\s/g, "");
  const brregUrl = `https://www.brreg.no/foretak/oppslag/?orgnr=${orgNr}`;
  const announcementsUrl =
    company.announcementsUrl ?? `https://kunngjoring.brreg.no/?q=${orgNr}`;

  return (
    <aside className="sticky top-[4.5rem] self-start space-y-4">
      <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-5">
        <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
          Snarlenker
        </div>
        <div className="mt-4 space-y-2">
          {[
            { label: "Brønnøysundregistrene", href: brregUrl },
            { label: "Kunngjøringer", href: announcementsUrl },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.08)] bg-[var(--px-subtle)] px-4 py-3 text-sm font-semibold text-[var(--px-text)] transition-colors hover:border-[rgba(15,23,42,0.14)] hover:bg-white"
            >
              {label}
              <span className="material-symbols-outlined ml-auto text-[14px] text-[var(--px-muted)]">
                open_in_new
              </span>
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[rgba(15,23,42,0.06)] bg-[var(--px-subtle)] p-4 text-xs text-[var(--px-muted)]">
        <div className="data-label font-semibold uppercase">Datakilde</div>
        <div className="mt-1">
          {company.sourceSystem} · oppdatert {formatDate(company.fetchedAt)}
        </div>
      </div>
    </aside>
  );
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedTab = typeof query.tab === "string" ? query.tab : undefined;
  const parsedTab = isCompanyTab(requestedTab) ? requestedTab : "oversikt";
  const notice = typeof query.notice === "string" ? query.notice : null;
  const error = typeof query.error === "string" ? query.error : null;
  const requestedDdRoomId = typeof query.ddRoom === "string" ? query.ddRoom : null;

  const session = await safeAuth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);
  const profile = await getCompanyProfile(slug, {
    rolesMode: parsedTab === "oversikt" || parsedTab === "organisasjon" ? "full" : "none",
    financialsMode: parsedTab === "regnskap" ? "full" : "summary",
  });

  if (!profile) {
    notFound();
  }

  const {
    company,
    roles,
    rolesAvailability,
    financialStatements,
    financialDocuments,
    financialsAvailability,
    regulatoryAvailability,
  } = profile;
  const visibleRoles = premium ? roles : roles.slice(0, 5);
  const petroleumVisibility = await getCompanyPetroleumTabVisibility(company);
  const availableTabs: Array<{ id: CompanyTabId; label: string }> = [
    { id: "oversikt", label: "Oversikt" },
    { id: "regnskap", label: "Regnskap" },
    { id: "nokkeltall", label: "Nøkkeltall" },
    { id: "organisasjon", label: "Organisasjon" },
    { id: "kunngjoringer", label: "Kunngjøringer" },
  ];
  if (petroleumVisibility.available) {
    availableTabs.push({ id: "sokkeleksponering", label: "Sokkeleksponering" });
  }
  const activeTab =
    parsedTab === "sokkeleksponering" && !petroleumVisibility.available ? "oversikt" : parsedTab;
  const petroleumProfile =
    activeTab === "sokkeleksponering" && petroleumVisibility.available
      ? await getCompanyPetroleumProfile(company)
      : null;

  const legalStructure = activeTab === "organisasjon" ? await getLegalStructure(company.orgNumber) : null;
  const announcementsData =
    activeTab === "kunngjoringer" ? await getCompanyAnnouncements(company.orgNumber) : null;
  const initialAnnouncementDetail =
    activeTab === "kunngjoringer" && announcementsData?.announcements[0]
      ? await getCompanyAnnouncementDetail(
          company.orgNumber,
          announcementsData.announcements[0].id,
          announcementsData.announcements[0].publishedAt ?? null,
        )
      : null;
  const discussionContext =
    session?.user?.id && (activeTab === "regnskap" || activeTab === "kunngjoringer")
      ? await getCompanyDdDiscussionContext(
          session.user.id,
          company.orgNumber,
          requestedDdRoomId,
        )
      : null;
  const financialDiscussions =
    session?.user?.id && activeTab === "regnskap" && discussionContext?.selectedRoomId
      ? await listFinancialStatementCommentThreads(session.user.id, discussionContext.selectedRoomId)
      : [];
  const financialMetricDiscussions =
    session?.user?.id && activeTab === "regnskap" && discussionContext?.selectedRoomId
      ? await listFinancialMetricCommentThreads(session.user.id, discussionContext.selectedRoomId)
      : [];

  const healthScore = deriveHealthScore(profile);

  return (
    <main className="space-y-6 pb-10">
      <CompanyHeader profile={profile} healthScore={healthScore} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr),minmax(0,1fr)]">
        <div className="space-y-6">
          <CompanyTabs
            companySlug={company.orgNumber}
            activeTab={activeTab}
            activeDdRoomId={discussionContext?.selectedRoomId ?? requestedDdRoomId}
            tabs={availableTabs}
          />

          {notice ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {(activeTab === "regnskap" || activeTab === "kunngjoringer") && discussionContext ? (
            <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                    DD-kontekst
                  </div>
                  <h2 className="mt-2 text-[1.35rem] font-semibold text-slate-950">
                    Kommentarer i DD-rom
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    Kommentarer på kunngjøringer og regnskap vises bare når selskapsprofilen er åpnet fra et aktivt DD-rom.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {discussionContext.rooms.map((room) => (
                    <Link
                      key={room.id}
                      href={`/companies/${company.orgNumber}?tab=${activeTab}&ddRoom=${room.id}`}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                        discussionContext.selectedRoomId === room.id
                          ? "border-[var(--px-action)] bg-[var(--px-action)] text-white"
                          : "border-[rgba(15,23,42,0.1)] bg-white text-slate-700"
                      }`}
                    >
                      {room.name}
                    </Link>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}

          {activeTab === "oversikt" ? (
        <>
          <FinancialTrendsStrip statements={financialStatements} />

          <ExecutiveSnapshot profile={profile} />

          <MetricGrid
            employeeCount={company.employeeCount}
            legalForm={company.legalForm}
            vatRegistered={company.vatRegistered}
            registeredAt={company.registeredAt}
          />

          <OverviewAnalytics company={company} statements={financialStatements} />
        </>
      ) : null}

      {activeTab === "regnskap" ? (
        <div className="space-y-6">
          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Regnskap
              </div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">
                Resultat og balanse over tid
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Vises som tidsserie med eldste år først. Bare verifiserte tall fylles inn.
              </p>
            </div>
            <div className="mt-6">
              <FinancialTimeSeriesTable
                statements={financialStatements}
                documents={financialDocuments}
                discussionRoomId={discussionContext?.selectedRoomId ?? null}
                discussionRoomName={discussionContext?.selectedRoomName ?? null}
                discussionStatements={financialDiscussions}
                discussionThreads={financialMetricDiscussions}
              />
            </div>
          </Card>

          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <h3 className="text-xl font-semibold text-slate-950">Dokumentasjon og dekning</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Årsregnskap og vedlegg vises når dokumentasjon er tilgjengelig.
            </p>
            <div className="mt-6">
              <FinancialDocuments
                documents={financialDocuments}
                latestYear={company.lastSubmittedAnnualReportYear}
              />
            </div>
          </Card>

          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <h3 className="text-xl font-semibold text-slate-950">Tilgjengelighet</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{financialsAvailability.message}</p>
          </Card>

          {discussionContext?.selectedRoomId ? (
            <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
              <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
                <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                  Regnskapsdiskusjon
                </div>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  Kommentarer per lagret regnskapsartefakt
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-500">
                  Denne flaten bruker bare lagrede og sporbare regnskapsartefakter i ProjectX.
                </p>
              </div>
              <div className="mt-6">
                <CompanyFinancialDiscussions
                  companySlug={company.orgNumber}
                  roomId={discussionContext.selectedRoomId}
                  roomName={discussionContext.selectedRoomName}
                  discussions={financialDiscussions}
                />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeTab === "nokkeltall" ? (
        <div className="space-y-6">
          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Nøkkeltall
              </div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">
                Finansielle signaler
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Nøkkeltall vises når de er tilgjengelige for analyse.
              </p>
            </div>
            <div className="mt-6">
              <KeyFiguresGrid company={company} statements={financialStatements} />
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "organisasjon" ? (
        <div className="space-y-6">
          {legalStructure ? <LegalStructure structure={legalStructure} /> : null}

          {!premium && roles.length > visibleRoles.length ? (
            <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
              <PremiumLock
                title="Premium"
                description="Utvidet tilgang gir mer komplett visning av roller og relasjoner."
              />
            </Card>
          ) : null}

          <OrganizationTab
            profile={{
              company,
              roles: visibleRoles,
              rolesAvailability,
              financialStatements,
              financialDocuments,
              financialsAvailability,
              regulatoryAvailability,
            }}
          />
        </div>
      ) : null}

      {activeTab === "kunngjoringer" ? (
        <div className="space-y-6">
          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                Kunngjøringer og historikk
              </div>
              <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">
                Offisielle kunngjøringer
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Her finner du foretakets registrerte kunngjøringer og formelle historikk.
              </p>
            </div>
            <div className="mt-6">
              {announcementsData ? (
                <CompanyAnnouncementsTimeline
                  companyName={company.name}
                  companySlug={company.orgNumber}
                  announcements={announcementsData.announcements}
                  availabilityMessage={
                    announcementsData.availability.message ?? "Kunngjøringer er tilgjengelige."
                  }
                  available={announcementsData.availability.available}
                  allAnnouncementsUrl={announcementsData.allAnnouncementsUrl ?? company.announcementsUrl}
                  initialDetail={initialAnnouncementDetail}
                  discussionRoomId={discussionContext?.selectedRoomId ?? null}
                  discussionRoomName={discussionContext?.selectedRoomName ?? null}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
                  Kunngjøringer kunne ikke lastes akkurat nå.
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

          {activeTab === "sokkeleksponering" && petroleumProfile ? (
            <CompanyPetroleumTab petroleum={petroleumProfile} />
          ) : null}
        </div>

        <QuickLinksSidebar company={company} />
      </div>
    </main>
  );
}
