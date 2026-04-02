import Link from "next/link";

import { Card } from "@/components/ui/card";
import { DistressCompanyDetail, NormalizedFinancialDocument } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ikke tilgjengelig";
  }

  return `${new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} %`;
}

function formatSignedPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ikke tilgjengelig";
  }

  const formatted = new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(value));

  if (value > 0) {
    return `+${formatted} %`;
  }

  if (value < 0) {
    return `-${formatted} %`;
  }

  return `${formatted} %`;
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-[1.35rem] font-semibold text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function buildFinancialMatrix(detail: DistressCompanyDetail) {
  const years = detail.financials.trends.map((trend) => trend.fiscalYear);

  return {
    years,
    rows: [
      {
        label: "Inntekter",
        values: detail.financials.trends.map((trend) => formatCurrency(trend.revenue)),
      },
      {
        label: "EBIT",
        values: detail.financials.trends.map((trend) => formatCurrency(trend.ebit)),
      },
      {
        label: "Årsresultat",
        values: detail.financials.trends.map((trend) => formatCurrency(trend.netIncome)),
      },
      {
        label: "Egenkapital",
        values: detail.financials.trends.map((trend) => formatCurrency(trend.equity)),
      },
      {
        label: "Eiendeler",
        values: detail.financials.trends.map((trend) => formatCurrency(trend.assets)),
      },
      {
        label: "Egenkapitalandel",
        values: detail.financials.trends.map((trend) => formatPercent(trend.equityRatio)),
      },
    ],
  };
}

function fileTypeLabel(type: string) {
  switch (type) {
    case "aarsregnskap":
      return "Årsregnskap";
    case "baerekraft":
      return "Bærekraftsopplysninger";
    case "mellombalanse":
      return "Mellombalanse";
    default:
      return type;
  }
}

function getDocumentUrl(document: NormalizedFinancialDocument) {
  const annualReportFile = document.files.find((file) => file.type === "aarsregnskap" && file.url);
  if (annualReportFile?.url) {
    return annualReportFile.url;
  }

  return document.files.find((file) => file.url)?.url ?? null;
}

function ExcerptList({
  title,
  status,
  excerpts,
}: {
  title: string;
  status: string;
  excerpts: DistressCompanyDetail["operations"]["annualReportExcerpts"];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 text-sm leading-6 text-slate-700">
        <div className="font-semibold text-slate-950">{title}</div>
        <div className="mt-2">{status}</div>
      </div>

      {excerpts.length > 0 ? (
        <div className="space-y-2">
          {excerpts.map((excerpt) => (
            <div
              key={`${title}-${excerpt.year}-${excerpt.pageNumber ?? "na"}-${excerpt.text.slice(0, 24)}`}
              className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] p-4"
            >
              <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                {excerpt.year}
                {excerpt.pageNumber ? ` · side ${excerpt.pageNumber}` : ""}
              </div>
              <div className="mt-2 text-sm leading-7 text-slate-700">{excerpt.text}</div>
              {excerpt.documentUrl ? (
                <a
                  href={excerpt.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-semibold text-slate-900 underline-offset-4 hover:underline"
                >
                  Åpne kilde
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DistressCompanyOverview({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: DistressCompanyDetail;
}) {
  const latestTrend = detail.financials.trends[0] ?? null;
  const latestFinancialYear = latestTrend?.fiscalYear ?? detail.financials.snapshot?.lastReportedYear ?? null;
  const latestRevenue = latestTrend?.revenue ?? detail.financials.snapshot?.revenue ?? null;
  const latestEbit = latestTrend?.ebit ?? detail.financials.snapshot?.ebit ?? null;
  const latestNetIncome = latestTrend?.netIncome ?? detail.financials.snapshot?.netIncome ?? null;
  const latestEquityRatio = latestTrend?.equityRatio ?? detail.financials.snapshot?.equityRatio ?? null;
  const latestAssets = latestTrend?.assets ?? detail.assetSnapshot.assets ?? detail.financials.snapshot?.assets ?? null;
  const financialMatrix = buildFinancialMatrix(detail);
  const visibleDocuments = [...detail.operations.documents]
    .sort((left, right) => right.year - left.year)
    .slice(0, 6);
  const visibleAnnouncements = [...detail.announcements]
    .sort((left, right) => {
      const leftTime = left.publishedAt ? new Date(left.publishedAt).getTime() : Number.NEGATIVE_INFINITY;
      const rightTime = right.publishedAt ? new Date(right.publishedAt).getTime() : Number.NEGATIVE_INFINITY;
      return rightTime - leftTime;
    })
    .slice(0, 6);

  return (
    <main className="space-y-6 pb-10">
      <section className="grid gap-0 border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.78)] xl:grid-cols-[minmax(0,1.5fr),360px]">
        <div className="p-8">
          <div className="flex flex-wrap items-center gap-2">
            <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
              {detail.distress.label}
            </div>
            <div className="data-label rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-500">
              {detail.company.industryCode?.code ?? "Næringskode mangler"}
            </div>
          </div>

          <h1 className="editorial-display mt-5 max-w-5xl text-[3rem] leading-[0.98] text-slate-950 sm:text-[4rem] xl:text-[4.75rem]">
            {detail.company.name}
          </h1>

          <p className="mt-4 max-w-3xl text-[1.02rem] leading-8 text-slate-600">
            {detail.operations.businessDescription}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/workspaces/${workspaceId}/distress`}
              className="rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[rgba(15,23,42,0.18)] hover:text-slate-950"
            >
              Tilbake til screening
            </Link>
            <Link
              href={`/companies/${detail.company.orgNumber}`}
              className="rounded-full bg-[#162233] px-4 py-2 text-sm font-semibold text-white hover:bg-[#223246]"
            >
              Åpne klassisk selskapsprofil
            </Link>
          </div>
        </div>

        <aside className="border-t border-[rgba(15,23,42,0.08)] bg-[#192536] p-8 text-white xl:border-l xl:border-t-0">
          <div className="data-label text-[11px] font-semibold uppercase text-white/60">Statuskort</div>
          <div className="mt-5 space-y-4 text-sm">
            <div className="border-b border-white/10 pb-4">
              <div className="text-white/60">Status</div>
              <div className="mt-1 font-semibold">{detail.distress.label}</div>
            </div>
            <div className="border-b border-white/10 pb-4">
              <div className="text-white/60">Statusdato</div>
              <div className="mt-1 font-semibold">{formatDate(detail.distress.statusStartedAt)}</div>
            </div>
            <div className="border-b border-white/10 pb-4">
              <div className="text-white/60">Dager i status</div>
              <div className="mt-1 font-semibold">{formatNumber(detail.distress.daysInStatus)}</div>
            </div>
            <div>
              <div className="text-white/60">Siste offisielle hendelse</div>
              <div className="mt-1 font-semibold">{detail.distress.lastAnnouncementTitle ?? "Ikke tilgjengelig"}</div>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Siste rapporterte år"
          value={formatNumber(latestFinancialYear)}
          hint={detail.coverage.dataCoverage ?? null}
        />
        <MetricCard label="Inntekter" value={formatCurrency(latestRevenue)} />
        <MetricCard label="EBIT" value={formatCurrency(latestEbit)} />
        <MetricCard label="Årsresultat" value={formatCurrency(latestNetIncome)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr),360px]">
        <Card className="space-y-5">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Nøkkeltall</div>
            <h2 className="mt-2 text-[1.6rem] font-semibold text-slate-950">Årsregnskap i nøkkeltall</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
              Årene ligger som kolonner, slik at du kan lese utviklingen mer som et årsregnskap enn en liste med kort.
            </p>
          </div>

          {detail.financials.trends.length === 0 ? (
            <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-5 text-sm leading-6 text-slate-600">
              Ingen regnskap er lagret for denne distress-kandidaten ennå.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)]">
              <table className="min-w-full divide-y divide-[rgba(15,23,42,0.08)] text-sm">
                <thead className="bg-white/72">
                  <tr className="text-left">
                    <th className="data-label px-4 py-3 font-semibold uppercase text-slate-500">Linje</th>
                    {financialMatrix.years.map((year) => (
                      <th key={year} className="data-label px-4 py-3 font-semibold uppercase text-slate-500">
                        {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
                  {financialMatrix.rows.map((row) => (
                    <tr key={row.label} className="text-slate-900">
                      <td className="px-4 py-4 font-semibold">{row.label}</td>
                      {row.values.map((value, index) => (
                        <td key={`${row.label}-${financialMatrix.years[index]}`} className="px-4 py-4 font-semibold">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Kapitaltrykk</div>
            <h2 className="mt-2 text-[1.4rem] font-semibold text-slate-950">Nåbilde</h2>
          </div>
          <MetricCard label="Egenkapitalandel" value={formatPercent(latestEquityRatio)} />
          <MetricCard label="Eiendeler" value={formatCurrency(latestAssets)} />
          <MetricCard label="Rentebærende gjeld" value={formatCurrency(detail.assetSnapshot.interestBearingDebt)} />
          <MetricCard label="Siste år med tall" value={formatNumber(latestFinancialYear)} />
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr),420px]">
        <Card className="space-y-5">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Drift</div>
            <h2 className="mt-2 text-[1.6rem] font-semibold text-slate-950">Driftsbilde og dokumentgrunnlag</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
              Denne delen samler det vi faktisk kan si om virksomheten fra Brreg, historiske regnskap og tilgjengelige årsregnskapsdokumenter.
            </p>
          </div>

          <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] p-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Virksomhetsbeskrivelse</div>
            <p className="mt-3 text-sm leading-7 text-slate-700">{detail.operations.businessDescription}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Ansatte" value={formatNumber(detail.operations.employeeCount)} />
            <MetricCard label="Stiftet" value={formatNumber(detail.operations.foundedYear)} />
            <MetricCard
              label="Dokumentår"
              value={formatNumber(detail.operations.documentYears.length)}
              hint={
                detail.operations.documentYears.length > 0
                  ? `${detail.operations.documentYears[0]} er nyeste dokumentår`
                  : "Ingen dokumentår registrert"
              }
            />
          </div>

          <div className="space-y-3">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Driftssignaler</div>
            <div className="space-y-2">
              {detail.operations.operatingSignals.map((signal) => (
                <div
                  key={signal}
                  className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-3 text-sm leading-6 text-slate-700"
                >
                  {signal}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-[rgba(15,23,42,0.08)] pt-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Årsberetning, noter og revisjon</div>
            <div className="grid gap-4 xl:grid-cols-3">
              <ExcerptList
                title="Årsberetning"
                status={detail.operations.annualReportExtractStatus}
                excerpts={detail.operations.annualReportExcerpts}
              />
              <ExcerptList
                title="Noter"
                status={detail.operations.notesExtractStatus}
                excerpts={detail.operations.notesExcerpts}
              />
              <ExcerptList
                title="Revisjon"
                status={detail.operations.auditReportExtractStatus}
                excerpts={detail.operations.auditExcerpts}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-[rgba(15,23,42,0.08)] pt-5">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Dokumentgrunnlag</div>
            <div className="space-y-2">
              {detail.operations.documentNotes.map((note) => (
                <div
                  key={note}
                  className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-3 text-sm leading-6 text-slate-700"
                >
                  {note}
                </div>
              ))}
            </div>

            {visibleDocuments.length === 0 ? (
              <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-5 text-sm leading-6 text-slate-600">
                Ingen regnskapsdokumenter er tilgjengelige for denne virksomheten akkurat nå.
              </div>
            ) : (
              <div className="space-y-3">
                {visibleDocuments.map((document) => {
                  const href = getDocumentUrl(document);
                  const content = (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-950">{document.year}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {document.files.map((file) => fileTypeLabel(file.type)).join(", ")}
                        </div>
                      </div>
                      <div className="data-label rounded-full border border-[rgba(15,23,42,0.1)] bg-[rgba(49,73,95,0.05)] px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                        {href ? "Åpne dokument" : "Registrert"}
                      </div>
                    </div>
                  );

                  if (!href) {
                    return (
                      <div
                        key={`${document.sourceId}-${document.year}`}
                        className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4"
                      >
                        {content}
                      </div>
                    );
                  }

                  return (
                    <a
                      key={`${document.sourceId}-${document.year}`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 transition hover:border-[rgba(15,23,42,0.18)] hover:bg-[rgba(248,249,250,0.9)]"
                    >
                      {content}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Formelle hendelser</div>
            <h2 className="mt-2 text-[1.4rem] font-semibold text-slate-950">Kunngjøringer og signaler</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <MetricCard label="Omsetningsendring" value={formatSignedPercent(detail.operations.latestRevenueChange)} />
            <MetricCard label="EBIT-margin" value={formatPercent(detail.operations.latestEbitMargin)} />
            <MetricCard label="Nettomargin" value={formatPercent(detail.operations.latestNetMargin)} />
            <MetricCard
              label="År med positiv EBIT"
              value={formatNumber(detail.operations.profitableYearsCount)}
              hint={`${formatNumber(detail.operations.lossMakingYearsCount)} år med negativ EBIT`}
            />
          </div>

          {visibleAnnouncements.length === 0 ? (
            <div className="rounded-[0.95rem] border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-5 text-sm leading-6 text-slate-600">
              Ingen kunngjøringer er tilgjengelige for denne virksomheten akkurat nå.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAnnouncements.map((announcement) => (
                <a
                  key={announcement.id}
                  href={announcement.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-4 transition hover:border-[rgba(15,23,42,0.18)] hover:bg-[rgba(248,249,250,0.9)]"
                >
                  <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
                    {formatDate(announcement.publishedAt)}
                  </div>
                  <div className="mt-2 font-semibold text-slate-950">{announcement.title}</div>
                </a>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr),420px]">
        <Card className="space-y-4">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Asset snapshot</div>
            <h2 className="mt-2 text-[1.6rem] font-semibold text-slate-950">Bokførte verdier</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Sum eiendeler" value={formatCurrency(detail.assetSnapshot.assets)} />
            <MetricCard label="Anleggsmidler" value={formatCurrency(detail.assetSnapshot.fixedAssets)} />
            <MetricCard label="Varelager" value={formatCurrency(detail.assetSnapshot.inventory)} />
            <MetricCard label="Fordringer" value={formatCurrency(detail.assetSnapshot.receivables)} />
            <MetricCard label="Kontanter" value={formatCurrency(detail.assetSnapshot.cash)} />
            <MetricCard label="Rentebærende gjeld" value={formatCurrency(detail.assetSnapshot.interestBearingDebt)} />
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Datadekning</div>
            <h2 className="mt-2 text-[1.4rem] font-semibold text-slate-950">Kildegrunnlag</h2>
          </div>
          <div className="rounded-[0.95rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] p-4 text-sm text-slate-700">
            {detail.coverage.dataCoverage}
          </div>
          <div className="space-y-2">
            {detail.coverage.sourceNotes.map((note) => (
              <div
                key={note}
                className="rounded-[0.9rem] border border-[rgba(15,23,42,0.08)] bg-white p-3 text-sm leading-6 text-slate-700"
              >
                {note}
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
