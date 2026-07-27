import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyAnnouncementsTimeline } from "@/components/company/company-announcements-timeline";
import { CompanyFinancialDiscussions } from "@/components/company/company-financial-discussions";
import { CompanyGridConnectionTab } from "@/components/company/company-grid-connection-tab";
import { IpTab } from "@/components/company/ip/ip-tab";
import { IpTabSkeleton } from "@/components/company/ip/ip-skeleton";
import { CompanyNarrativesTab } from "@/components/company/company-narratives-tab";
import { CompanyNewsTab } from "@/components/company/company-news-tab";
import { WatchButton } from "@/components/company/watch-button";
import { CompanyPetroleumTab } from "@/components/company/company-petroleum-tab";
import { CompanyTabId, CompanyTabs, resolveCompanyTab } from "@/components/company/company-tabs";
import { FinancialDocuments } from "@/components/company/financial-documents";
import { FinancialTimeSeriesTable } from "@/components/company/financial-time-series-table";
import { KeyFiguresGrid } from "@/components/company/key-figures-grid";
import { OwnershipTab } from "@/components/company/ownership/ownership-tab";
import { ShareholdersTab } from "@/components/company/ownership/shareholders-tab";
import { OverviewAnalytics } from "@/components/company/overview-analytics";
import { Card } from "@/components/ui/card";
import { safeAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompanyProfile, NormalizedCompany, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";
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
import { getCompanyGridConnectionProfile } from "@/server/services/company-grid-connection-service";
import { getGroupIpOverview } from "@/server/ip/ip-data";
import {
  listFinancialMetricCommentThreads,
  listFinancialStatementCommentThreads,
} from "@/server/services/dd-comment-service";
import {
  getCompanyOwnershipOverview,
  getRegisterBackedCompanyProfile,
  type RegisterBackedProfile,
} from "@/server/ownership/ownership-overview-service";
import { getCompanyShareholdingOverview } from "@/server/shareholdings/shareholding-service";
import { getCompanyRoleActivityOverview } from "@/server/insider-transactions/role-reported-changes-service";
import { CompanyRoles } from "@/components/company/ownership/company-roles";

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
    latest ? null : "Strukturerte regnskapstall er ikke tilgjengelige for virksomheten.",
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
              : "Regnskap er ikke tilgjengelig."}
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

function HealthGauge({ score }: { score: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative h-14 w-14 sm:h-20 sm:w-20">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--px-border)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke="var(--px-accent)" strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="material-symbols-outlined text-[22px] text-[var(--px-accent)]">favorite</span>
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

function CompanyHeader({
  profile,
  healthScore,
  watchInfo,
  slug,
}: {
  profile: CompanyProfile;
  healthScore: number;
  watchInfo: { watchId: string | null; workspaceId: string } | null;
  slug: string;
}) {
  const { company } = profile;
  const municipality = company.municipality ?? company.addresses[0]?.city ?? null;

  return (
    <section className="pb-2">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          {company.legalForm ? (
            <div className="data-label inline-flex items-center rounded-full bg-[var(--px-panel)] px-3 py-1 text-[10px] font-semibold uppercase text-white">
              {company.legalForm}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <h1 className="editorial-display text-4xl leading-none text-[var(--px-text)] sm:text-5xl">
              {company.name}
            </h1>
            {watchInfo ? (
              <WatchButton
                isWatched={watchInfo.watchId !== null}
                watchId={watchInfo.watchId}
                workspaceId={watchInfo.workspaceId}
                orgNumber={company.orgNumber}
                slug={slug}
              />
            ) : null}
          </div>
          <div className="mt-2 text-sm text-[var(--px-muted)]">
            Org.nr. {company.orgNumber}
            {company.registeredAt
              ? ` · Registrert ${new Date(company.registeredAt).getFullYear()}`
              : ""}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${
                company.status === "ACTIVE"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : company.status === "BANKRUPT"
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.8)] text-slate-600"
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">
                {company.status === "ACTIVE" ? "check_circle" : "cancel"}
              </span>
              {company.status === "ACTIVE"
                ? "Aktiv"
                : company.status === "BANKRUPT"
                  ? "Konkurs"
                  : company.status}
            </span>
            {municipality ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                <span className="material-symbols-outlined text-[13px]">location_on</span>
                {municipality}
              </span>
            ) : null}
            {company.industryCode?.code ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                <span className="material-symbols-outlined text-[13px]">category</span>
                {company.industryCode.code}
                {company.industryCode.title ? ` · ${company.industryCode.title}` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-center gap-4 rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 sm:gap-3 sm:px-5 sm:py-4">
            <HealthGauge score={healthScore} />
            <div>
              <div className="text-2xl font-semibold tabular-nums text-[var(--px-text)] sm:text-3xl">{healthScore}</div>
              <div className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                Finansiell helse
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
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
  const parsedTab = resolveCompanyTab(requestedTab);
  const notice = typeof query.notice === "string" ? query.notice : null;
  const error = typeof query.error === "string" ? query.error : null;
  const requestedDdRoomId = typeof query.ddRoom === "string" ? query.ddRoom : null;

  const session = await safeAuth();
  let profile: RegisterBackedProfile | null = await getCompanyProfile(slug, {
    rolesMode: parsedTab === "oversikt" ? "full" : "none",
    financialsMode: parsedTab === "regnskap" ? "full" : "summary",
  });

  // Fall back to a register-backed minimal profile so ownership drill-through resolves any
  // company from the local database, even before the full Company table is populated.
  if (!profile && /^\d{9}$/.test(slug)) {
    profile = await getRegisterBackedCompanyProfile(slug);
  }

  if (!profile) {
    notFound();
  }

  const {
    company,
    rolesAvailability,
    financialStatements,
    financialStatementsAllScopes,
    financialLineItems,
    financialDocuments,
    financialsAvailability,
  } = profile;

  const [petroleumVisibility, ipOverview, watchInfo] = await Promise.all([
    getCompanyPetroleumTabVisibility(company),
    getGroupIpOverview(company.orgNumber),
    session?.user?.id
      ? (async () => {
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { lastWorkspaceId: true },
          });
          if (!user?.lastWorkspaceId) return null;
          const watch = await prisma.workspaceWatch.findFirst({
            where: {
              workspaceId: user.lastWorkspaceId,
              company: { orgNumber: company.orgNumber },
              status: "ACTIVE",
            },
            select: { id: true },
          });
          return { watchId: watch?.id ?? null, workspaceId: user.lastWorkspaceId };
        })()
      : Promise.resolve(null),
  ]);

  const availableTabs: Array<{ id: CompanyTabId; label: string }> = [
    { id: "oversikt", label: "Oversikt" },
    { id: "regnskap", label: "Regnskap" },
    { id: "nokkeltall", label: "Nøkkeltall" },
    { id: "konsern", label: "Konsern" },
    { id: "aksjonaerer", label: "Aksjonærer og roller" },
    { id: "kunngjoringer", label: "Kunngjøringer" },
    { id: "dokumenter", label: "Dokumenter" },
    { id: "nyheter", label: "Nyheter" },
    { id: "nettilknytning", label: "Nettilknytning" },
  ];
  if (petroleumVisibility.available) {
    availableTabs.push({ id: "sokkeleksponering", label: "Sokkeleksponering" });
  }
  if (ipOverview.total > 0) {
    availableTabs.push({ id: "immaterielt", label: "Immaterielle rettigheter" });
  }
  const activeTab =
    (parsedTab === "sokkeleksponering" && !petroleumVisibility.available) ||
    (parsedTab === "immaterielt" && ipOverview.total === 0)
      ? "oversikt"
      : parsedTab;

  const [
    petroleumProfile,
    ownershipOverview,
    shareholdersOverview,
    announcementsData,
    narratives,
    gridConnectionProfile,
    companyRoles,
  ] = await Promise.all([
    activeTab === "sokkeleksponering" && petroleumVisibility.available
      ? getCompanyPetroleumProfile(company)
      : Promise.resolve(null),
    activeTab === "konsern"
      ? getCompanyOwnershipOverview({ orgNumber: company.orgNumber, companyName: company.name })
      : Promise.resolve(null),
    activeTab === "aksjonaerer"
      ? getCompanyShareholdingOverview(company.orgNumber)
      : Promise.resolve(null),
    activeTab === "kunngjoringer" ? getCompanyAnnouncements(company.orgNumber) : Promise.resolve(null),
    activeTab === "dokumenter"
      ? prisma.annualReportNarrative.findMany({
          where: { company: { slug } },
          orderBy: [{ fiscalYear: "desc" }, { sectionKind: "asc" }],
          select: {
            id: true,
            fiscalYear: true,
            sectionKind: true,
            title: true,
            textPreview: true,
            fullText: true,
            pageStart: true,
            pageEnd: true,
            confidence: true,
          },
        })
      : Promise.resolve([]),
    activeTab === "nettilknytning"
      ? getCompanyGridConnectionProfile({ orgNumber: company.orgNumber, companyName: company.name })
      : Promise.resolve(null),
    activeTab === "aksjonaerer"
      ? getCompanyRoleActivityOverview(company.orgNumber)
      : Promise.resolve({ snapshot: null, roles: [] }),
  ]);

  const [initialAnnouncementDetail, discussionContext] = await Promise.all([
    activeTab === "kunngjoringer" && announcementsData?.announcements[0]
      ? getCompanyAnnouncementDetail(
          company.orgNumber,
          announcementsData.announcements[0].id,
          announcementsData.announcements[0].publishedAt ?? null,
        )
      : Promise.resolve(null),
    session?.user?.id && (activeTab === "regnskap" || activeTab === "kunngjoringer")
      ? getCompanyDdDiscussionContext(session.user.id, company.orgNumber, requestedDdRoomId)
      : Promise.resolve(null),
  ]);

  const [financialDiscussions, financialMetricDiscussions] = await Promise.all([
    session?.user?.id && activeTab === "regnskap" && discussionContext?.selectedRoomId
      ? listFinancialStatementCommentThreads(session.user.id, discussionContext.selectedRoomId)
      : Promise.resolve([]),
    session?.user?.id && activeTab === "regnskap" && discussionContext?.selectedRoomId
      ? listFinancialMetricCommentThreads(session.user.id, discussionContext.selectedRoomId)
      : Promise.resolve([]),
  ]);

  const healthScore = deriveHealthScore(profile);

  return (
    <main className="space-y-4 pb-10 sm:space-y-6">
      <CompanyHeader profile={profile} healthScore={healthScore} watchInfo={watchInfo} slug={slug} />

      <div>
        <div className="space-y-4 sm:space-y-6">
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
        <OverviewAnalytics
          company={company}
          roles={profile.roles}
          statements={financialStatements}
          financialsAvailability={financialsAvailability}
        />
      ) : null}

      {activeTab === "regnskap" ? (
        <div className="space-y-6">
          <FinancialTimeSeriesTable
            statements={
              financialStatementsAllScopes.length > 0
                ? financialStatementsAllScopes
                : financialStatements
            }
            documents={financialDocuments}
            lineItems={financialLineItems}
            companySlug={slug}
            discussionRoomId={discussionContext?.selectedRoomId ?? null}
            discussionRoomName={discussionContext?.selectedRoomName ?? null}
            discussionStatements={financialDiscussions}
            discussionThreads={financialMetricDiscussions}
            availability={financialsAvailability}
          />

          {financialDocuments.length > 0 ? (
            <FinancialDocuments
              documents={financialDocuments}
              latestYear={company.lastSubmittedAnnualReportYear}
            />
          ) : null}

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

      {activeTab === "konsern" && ownershipOverview ? (
        <OwnershipTab slug={slug} initial={ownershipOverview} />
      ) : null}

      {activeTab === "aksjonaerer" && shareholdersOverview ? (
        <div className="space-y-8">
          <ShareholdersTab slug={slug} initial={shareholdersOverview} />
          <CompanyRoles overview={companyRoles} />
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

          {activeTab === "dokumenter" ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
                <div className="border-b border-[rgba(15,23,42,0.08)] px-5 py-4">
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                    Dokumenter
                  </div>
                  <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">
                    Styreberetning og revisjonsberetning
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">
                    Narrativt innhold fra årsrapporter, inkludert styrets beretning og revisors
                    beretning.
                  </p>
                </div>
                <CompanyNarrativesTab narratives={narratives} />
              </div>
            </div>
          ) : null}

          {activeTab === "nyheter" ? (
            <div className="overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white">
              <CompanyNewsTab slug={slug} />
            </div>
          ) : null}
          {activeTab === "nettilknytning" && gridConnectionProfile ? (
            <CompanyGridConnectionTab profile={gridConnectionProfile} />
          ) : null}
          {activeTab === "sokkeleksponering" && petroleumProfile ? (
            <CompanyPetroleumTab petroleum={petroleumProfile} />
          ) : null}
          {activeTab === "immaterielt" ? (
            <Suspense fallback={<IpTabSkeleton />}>
              <IpTab orgNumber={company.orgNumber} />
            </Suspense>
          ) : null}
        </div>

      </div>
    </main>
  );
}
