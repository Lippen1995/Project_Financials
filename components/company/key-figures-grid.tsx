import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

export function KeyFiguresGrid({
  company,
  statements,
}: {
  company: NormalizedCompany;
  statements: NormalizedFinancialStatement[];
}) {
  const latestStatement = statements.slice().sort((left, right) => right.fiscalYear - left.fiscalYear)[0];
  const items = [
    { label: "Omsetning", value: formatCurrency(latestStatement?.revenue) },
    { label: "Driftsresultat (EBIT)", value: formatCurrency(latestStatement?.operatingProfit) },
    { label: "Egenkapital", value: formatCurrency(latestStatement?.equity) },
    { label: "Eiendeler", value: formatCurrency(latestStatement?.assets) },
    {
      label: "Aksjekapital",
      value:
        company.shareCapital !== null && company.shareCapital !== undefined
          ? formatCurrency(company.shareCapital)
          : "Ikke tilgjengelig",
    },
    {
      label: "Antall aksjer",
      value:
        company.shareCount !== null && company.shareCount !== undefined
          ? formatNumber(company.shareCount)
          : "Ikke tilgjengelig",
    },
  ];

  const populated = items.some((item) => item.value !== "Ikke tilgjengelig");

  if (!populated) {
    return (
      <div className="border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-7 text-slate-600">
        Nøkkeltall er ikke tilgjengelige for denne virksomheten ennå.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="border border-[rgba(15,23,42,0.08)] bg-white p-5">
          <p className="data-label text-[11px] font-semibold uppercase text-slate-500">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
