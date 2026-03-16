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
      value: company.shareCapital !== null && company.shareCapital !== undefined ? formatCurrency(company.shareCapital) : "Ikke tilgjengelig",
    },
    {
      label: "Antall aksjer",
      value: company.shareCount !== null && company.shareCount !== undefined ? formatNumber(company.shareCount) : "Ikke tilgjengelig",
    },
  ];

  const populated = items.some((item) => item.value !== "Ikke tilgjengelig");

  if (!populated) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-sand/55 p-6 text-sm text-ink/65">
        Ingen apne nokkeltall er tilgjengelige fra verifiserte kilder for denne virksomheten enda.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-[1.5rem] border border-ink/10 bg-white p-5">
          <p className="text-sm text-ink/55">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
