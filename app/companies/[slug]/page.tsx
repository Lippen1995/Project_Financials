import Link from "next/link";
import { notFound } from "next/navigation";

import { CompanyAnnouncementsTimeline } from "@/components/company/company-announcements-timeline";
import { CompanyFinancialDiscussions } from "@/components/company/company-financial-discussions";
import { CompanyTabs, isCompanyTab } from "@/components/company/company-tabs";
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
import { CompanyProfile, NormalizedFinancialStatement, NormalizedRole } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { isPremium } from "@/server/billing/subscription";
import { getCompanyDdDiscussionContext } from "@/server/services/company-dd-discussion-service";
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

function getControlSummary(roles: NormalizedRole[]) {
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
              className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.72)] p-4"
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
              className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-3 text-sm leading-6 text-slate-700"
            >
              {note}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
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

function CompanyHeader({ profile }: { profile: CompanyProfile }) {
  const { company, roles } = profile;
  const controlSummary = getControlSummary(roles);
  const municipality = company.municipality ?? company.addresses[0]?.city ?? "Ikke tilgjengelig";

  return (
    <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.5fr),340px]">
      <div className="p-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(49,73,95,0.05)] px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
            {company.status}
          </div>
          <div className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-500">
            {company.industryCode?.code ?? "Næringskode mangler"}
          </div>
        </div>

        <h1 className="editorial-display mt-5 max-w-5xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem] xl:text-[4.75rem]">
          {company.name}
        </h1>

        <div className="mt-6 grid gap-x-6 gap-y-4 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Org.nr.
            </div>
            <div className="mt-1 font-semibold text-slate-900">{company.orgNumber}</div>
          </div>
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Selskapsform
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {company.legalForm ?? "Ikke tilgjengelig"}
            </div>
          </div>
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Kommune
            </div>
            <div className="mt-1 font-semibold text-slate-900">{municipality}</div>
          </div>
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Registrert
            </div>
            <div className="mt-1 font-semibold text-slate-900">{formatDate(company.registeredAt)}</div>
          </div>
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Bransje
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {[company.industryCode?.code, company.industryCode?.title].filter(Boolean).join(" ") ||
                "Ikke tilgjengelig"}
            </div>
          </div>
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Formell kontroll
            </div>
            <div className="mt-1 font-semibold text-slate-900">{controlSummary}</div>
          </div>
        </div>
      </div>

      <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
        <div className="data-label text-[11px] font-semibold uppercase text-white/60">Fakta</div>
        <div className="mt-5 space-y-4 text-sm">
          <div className="border-b border-white/10 pb-4">
            <div className="text-white/60">Datakilde</div>
            <div className="mt-1 font-semibold">{company.sourceSystem}</div>
          </div>
          <div className="border-b border-white/10 pb-4">
            <div className="text-white/60">Referanse</div>
            <div className="mt-1 font-semibold">{company.sourceId}</div>
          </div>
          <div className="border-b border-white/10 pb-4">
            <div className="text-white/60">Sist oppdatert</div>
            <div className="mt-1 font-semibold">{formatDate(company.fetchedAt)}</div>
          </div>
          <div>
            <div className="text-white/60">Forretningsadresse</div>
            <div className="mt-1 leading-7 text-white/82">
              {company.addresses[0]?.line1 ?? "Ikke tilgjengelig"}
              {company.addresses[0]?.postalCode ? `, ${company.addresses[0].postalCode}` : ""}
              {company.addresses[0]?.city ? ` ${company.addresses[0].city}` : ""}
            </div>
          </div>
        </div>
      </aside>
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
  const activeTab = isCompanyTab(requestedTab) ? requestedTab : "oversikt";
  const notice = typeof query.notice === "string" ? query.notice : null;
  const error = typeof query.error === "string" ? query.error : null;
  const requestedDdRoomId = typeof query.ddRoom === "string" ? query.ddRoom : null;

  const session = await safeAuth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);
  const profile = await getCompanyProfile(slug);

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

  return (
    <main className="space-y-6 pb-10">
      <CompanyHeader profile={profile} />

      <CompanyTabs
        companySlug={company.orgNumber}
        activeTab={activeTab}
        activeDdRoomId={discussionContext?.selectedRoomId ?? requestedDdRoomId}
      />

      {notice ? (
        <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
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
                      ? "border-[#162233] bg-[#162233] text-white"
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
                <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
                  Kunngjøringer kunne ikke lastes akkurat nå.
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
