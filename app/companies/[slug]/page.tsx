import { notFound } from "next/navigation";

import { MetricGrid } from "@/components/company/metric-grid";
import { RolesList } from "@/components/company/roles-list";
import { PremiumLock } from "@/components/paywall/premium-lock";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { isPremium } from "@/server/billing/subscription";
import { getCompanyProfile } from "@/server/services/company-service";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);
  const profile = await getCompanyProfile(slug);

  if (!profile) {
    notFound();
  }

  const { company, roles, financialStatements, financialsAvailability, regulatoryAvailability } = profile;
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

      <div className="grid gap-6 xl:grid-cols-[1.5fr,0.9fr]">
        <Card>
          <h2 className="text-2xl font-semibold">Roller og styre</h2>
          <p className="mt-1 text-sm text-ink/65">
            Roller hentes fra Brønnøysundregistrene og normaliseres før visning i ProjectX.
          </p>
          <div className="mt-5">
            <RolesList roles={visibleRoles} />
          </div>
          {!premium && roles.length > visibleRoles.length ? (
            <div className="mt-5">
              <PremiumLock
                title="Premium"
                description="Gratisbrukere ser et utsnitt av roller. Logg inn med premium-plan for full rollevisning når data finnes i kilden."
              />
            </div>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold">Regnskap</h3>
            {financialsAvailability.available && financialStatements.length > 0 ? (
              <p className="mt-3 text-sm text-ink/70">
                Regnskapsdata er tilgjengelig og koblet til denne virksomheten.
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink/70">
                {financialsAvailability.message ??
                  "Ingen åpne regnskapstall er tilgjengelige for denne virksomheten i MVP-et."}
              </p>
            )}
          </Card>
          <Card>
            <h3 className="text-lg font-semibold">Regulatorisk overlay</h3>
            <p className="mt-3 text-sm text-ink/70">
              {regulatoryAvailability.message ??
                "Ingen regulatorisk informasjon er tilgjengelig for denne virksomheten."}
            </p>
          </Card>
          <Card className="bg-ink text-white">
            <h3 className="text-lg font-semibold">Datakilder</h3>
            <div className="mt-4 space-y-2 text-sm text-white/75">
              <p>Virksomhetsdata: Brønnøysundregistrene</p>
              <p>Næringskodebeskrivelse: SSB Klass</p>
              <p>Regnskap: vises bare når åpen reell kilde er koblet</p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
