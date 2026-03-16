import { notFound } from "next/navigation";

import { CompanyTabs, isCompanyTab } from "@/components/company/company-tabs";
import { FinancialChart } from "@/components/company/financial-chart";
import { FinancialDocuments } from "@/components/company/financial-documents";
import { FinancialTimeSeriesTable } from "@/components/company/financial-time-series-table";
import { KeyFiguresGrid } from "@/components/company/key-figures-grid";
import { MetricGrid } from "@/components/company/metric-grid";
import { OverviewSidePanel } from "@/components/company/overview-side-panel";
import { RolesList } from "@/components/company/roles-list";
import { PremiumLock } from "@/components/paywall/premium-lock";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/utils";
import { isPremium } from "@/server/billing/subscription";
import { getCompanyProfile } from "@/server/services/company-service";

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

  const session = await auth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);
  let profile = null;

  try {
    profile = await getCompanyProfile(slug);
  } catch {
    profile = null;
  }

  if (!profile) {
    notFound();
  }

  const {
    company,
    roles,
    financialStatements,
    financialDocuments,
    financialsAvailability,
    regulatoryAvailability,
  } = profile;
  const visibleRoles = premium ? roles : roles.slice(0, 5);

  return (
    <main className="space-y-6">
      <Card className="bg-gradient-to-br from-white to-sand">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-tide/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-tide">
              {company.status}
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">{company.name}</h1>
            <div className="mt-3 grid gap-2 text-sm text-ink/70 sm:grid-cols-2">
              <p>Org.nr: {company.orgNumber}</p>
              <p>Organisasjonsform: {company.legalForm ?? "Ikke tilgjengelig"}</p>
              <p>Registrert: {formatDate(company.registeredAt)}</p>
              <p>Stiftet: {formatDate(company.foundedAt)}</p>
              <p>
                Adresse: {company.addresses[0]?.line1 ?? "Ikke tilgjengelig"}
                {company.addresses[0]?.postalCode ? `, ${company.addresses[0].postalCode}` : ""}
                {company.addresses[0]?.city ? ` ${company.addresses[0].city}` : ""}
              </p>
              <p>
                Bransje: {company.industryCode?.code ?? "Ikke tilgjengelig"}
                {company.industryCode?.title ? ` ${company.industryCode.title}` : ""}
              </p>
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-ink p-5 text-white">
            <p className="text-sm text-white/70">Kildesporing</p>
            <p className="mt-2 text-sm">sourceSystem: {company.sourceSystem}</p>
            <p className="text-sm">sourceId: {company.sourceId}</p>
            <p className="text-sm">fetchedAt: {formatDate(company.fetchedAt)}</p>
          </div>
        </div>
      </Card>

      <MetricGrid
        employeeCount={company.employeeCount}
        legalForm={company.legalForm}
        vatRegistered={company.vatRegistered}
        registeredAt={company.registeredAt}
      />

      <CompanyTabs companySlug={company.orgNumber} activeTab={activeTab} />

      {activeTab === "oversikt" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr),340px]">
          <Card className="border-[#E7ECF1] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[1.65rem] font-semibold tracking-tight text-[#101828]">Oversikt</h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#667085]">
                  Historisk utvikling i sum driftsinntekter og driftsresultat (EBIT), bygget fra verifiserte Brreg-regnskap.
                </p>
              </div>
              <div className="rounded-full border border-[#DCE4EB] bg-[#F8FAFC] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667085]">
                BRREG
              </div>
            </div>
            <div className="mt-5">
              <FinancialChart statements={financialStatements} />
            </div>
          </Card>

          <OverviewSidePanel company={company} statements={financialStatements} />
        </div>
      ) : null}

      {activeTab === "regnskap" ? (
        <div className="space-y-6">
          <Card>
            <h2 className="text-2xl font-semibold">Regnskap</h2>
            <p className="mt-1 text-sm text-ink/65">
              Regnskap vises som tidsserie. Bare ar med verifiserte apne Brreg-tall fylles med verdier.
            </p>
            <div className="mt-6">
              <FinancialTimeSeriesTable statements={financialStatements} documents={financialDocuments} />
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">Dokumenttilgang</h3>
            <p className="mt-3 text-sm text-ink/70">
              Disse arene er registrert med kopi av arsregnskap hos Brreg. Kolonner uten tall betyr at den apne regnskaps-API-en ikke leverte en egen verifiserbar arsrespons for det aret.
            </p>
            <div className="mt-6">
              <FinancialDocuments
                documents={financialDocuments}
                latestYear={company.lastSubmittedAnnualReportYear}
              />
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">Status for detaljerte regnskapstall</h3>
            <p className="mt-3 text-sm text-ink/70">{financialsAvailability.message}</p>
          </Card>
        </div>
      ) : null}

      {activeTab === "nokkeltall" ? (
        <div className="space-y-6">
          <Card>
            <h2 className="text-2xl font-semibold">Nokkeltall</h2>
            <p className="mt-1 text-sm text-ink/65">
              ProjectX viser bare nokkeltall som kan spores til apne, offisielle kilder.
            </p>
            <div className="mt-6">
              <KeyFiguresGrid company={company} statements={financialStatements} />
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "organisasjon" ? (
        <div className="grid gap-6 xl:grid-cols-[1.5fr,0.9fr]">
          <Card>
            <h2 className="text-2xl font-semibold">Roller og styre</h2>
            <p className="mt-1 text-sm text-ink/65">
              Roller hentes fra Bronnoysundregistrene og normaliseres for visning i ProjectX.
            </p>
            <div className="mt-5">
              <RolesList roles={visibleRoles} />
            </div>
            {!premium && roles.length > visibleRoles.length ? (
              <div className="mt-5">
                <PremiumLock
                  title="Premium"
                  description="Gratisbrukere ser et utsnitt av roller. Logg inn med premium-plan for full rollevisning nar data finnes i kilden."
                />
              </div>
            ) : null}
          </Card>

          <div className="space-y-6">
            <Card>
              <h3 className="text-lg font-semibold">Registrerte forhold</h3>
              <div className="mt-4 space-y-2 text-sm text-ink/70">
                <p>Ansatte: {formatNumber(company.employeeCount)}</p>
                <p>Kommunenummer/region: {company.municipality ?? "Ikke tilgjengelig"}</p>
                <p>Regulatorisk overlay: {regulatoryAvailability.message}</p>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "kunngjoringer" ? (
        <div className="space-y-6">
          <Card>
            <h2 className="text-2xl font-semibold">Kunngjoringer</h2>
            <p className="mt-1 text-sm text-ink/65">
              ProjectX lenker forelopig videre til Bronnoysundregistrenes offisielle kunngjoringer for denne virksomheten.
            </p>
            <div className="mt-6">
              {company.announcementsUrl ? (
                <a
                  href={company.announcementsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-tide"
                >
                  Apne kunngjoringer hos Brreg
                </a>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
                  Ingen apen kunngjoringslenke er tilgjengelig for denne virksomheten akkurat na.
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
