import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";

export function MetricGrid({ revenue, operatingProfit, netIncome, employeeCount }: { revenue?: number | null; operatingProfit?: number | null; netIncome?: number | null; employeeCount?: number | null }) {
  const metrics = [
    { label: "Siste omsetning", value: formatCurrency(revenue) },
    { label: "Driftsresultat", value: formatCurrency(operatingProfit) },
    { label: "Arsresultat", value: formatCurrency(netIncome) },
    { label: "Ansatte", value: formatNumber(employeeCount) },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-5">
          <p className="text-sm text-ink/55">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{metric.value}</p>
        </Card>
      ))}
    </div>
  );
}