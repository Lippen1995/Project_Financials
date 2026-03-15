import { notFound } from "next/navigation";

import { MetricGrid } from "@/components/company/metric-grid";
import { FinancialChart } from "@/components/company/financial-chart";
import { RolesList } from "@/components/company/roles-list";
import { PremiumLock } from "@/components/paywall/premium-lock";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { isPremium } from "@/server/billing/subscription";
import { getCompanyFinancials, getCompanyProfile, getCompanyRoles } from "@/server/services/company-service";

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const premium = isPremium(session?.user.subscriptionStatus, session?.user.subscriptionPlan);
  const company = await getCompanyProfile(slug);

  if (!company) {
    notFound();
  }

  const [roles, financials] = await Promise.all([
    getCompanyRoles(company.orgNumber),
    getCompanyFinancials(company.orgNumber),
  ]);

  return (
    <main className="space-y-6">
      <Card className="bg-gradient-to-br from-white to-sand">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-tide/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-tide">{company.status}</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">{company.name}</h1>
            <div className="mt-3 grid gap-2 text-sm text-ink/70 sm:grid-cols-2">
              <p>Org.nr: {company.orgNumber}</p>
              <p>Organisasjonsform: {company.legalForm ?? "Ikke tilgjengelig"}</p>
              <p>Registrert: {formatDate(company.registeredAt)}</p>
              <p>Stiftet: {formatDate(company.foundedAt)}</p>
              <p>Adresse: {company.addresses[0]?.line1}, {company.addresses[0]?.postalCode} {company.addresses[0]?.city}</p>
              <p>Bransje: {company.industryCode?.title ?? "Ikke tilgjengelig"}</p>
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

      <MetricGrid revenue={company.revenue} operatingProfit={company.operatingProfit} netIncome={company.netIncome} employeeCount={company.employeeCount} />

      <div className="grid gap-6 xl:grid-cols-[1.5fr,0.9fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Historiske regnskapstall</h2>
              <p className="mt-1 text-sm text-ink/65">Minst tre ar med omsetning, driftsresultat, arsresultat og egenkapital.</p>
            </div>
            {!premium ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Premium</span> : null}
          </div>
          <div className="mt-6"><FinancialChart statements={financials} premium={premium} /></div>
          <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-ink/10">
            <table className="min-w-full text-sm">
              <thead className="bg-sand">
                <tr className="text-left text-ink/65">
                  <th className="px-4 py-3">Ar</th>
                  <th className="px-4 py-3">Omsetning</th>
                  <th className="px-4 py-3">Driftsresultat</th>
                  <th className="px-4 py-3">Arsresultat</th>
                  <th className="px-4 py-3">Egenkapital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {(premium ? financials : financials.slice(0, 1)).map((statement) => (
                  <tr key={statement.sourceId}>
                    <td className="px-4 py-3">{statement.fiscalYear}</td>
                    <td className="px-4 py-3">{formatCurrency(statement.revenue)}</td>
                    <td className="px-4 py-3">{formatCurrency(statement.operatingProfit)}</td>
                    <td className="px-4 py-3">{formatCurrency(statement.netIncome)}</td>
                    <td className="px-4 py-3">{formatCurrency(statement.equity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-2xl font-semibold">Roller og styre</h2>
            <p className="mt-1 text-sm text-ink/65">Daglig leder, styreleder og styremedlemmer normalisert til intern modell.</p>
            <div className="mt-5"><RolesList roles={premium ? roles : roles.slice(0, 2)} /></div>
          </Card>
          {!premium ? <PremiumLock /> : null}
          <Card>
            <h3 className="text-lg font-semibold">Placeholder-seksjoner</h3>
            <div className="mt-4 space-y-3 text-sm text-ink/65">
              <p>Eierskap: kommende fase med reelle rettighetshavere og konsernstrukturer.</p>
              <p>Relaterte selskaper: klargjort for senere CRM-beriking og nettverksvisning.</p>
              <p>Hendelser og varsler: klargjort for kunngjoringer, konkurs og overvakingssignaler.</p>
            </div>
          </Card>
          <Card className="bg-ink text-white">
            <h3 className="text-lg font-semibold">Nokkeltall</h3>
            <div className="mt-4 space-y-2 text-sm text-white/75">
              <p>Ansatte: {formatNumber(company.employeeCount)}</p>
              <p>Omsetning: {formatCurrency(company.revenue)}</p>
              <p>Egenkapital: {formatCurrency(company.equity)}</p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}