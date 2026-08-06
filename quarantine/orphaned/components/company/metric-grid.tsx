import { Card } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";

export function MetricGrid({
  employeeCount,
  legalForm,
  vatRegistered,
  registeredAt,
}: {
  employeeCount?: number | null;
  legalForm?: string | null;
  vatRegistered?: boolean | null;
  registeredAt?: Date | string | null;
}) {
  const metrics = [
    { label: "Ansatte", value: formatNumber(employeeCount) },
    { label: "Organisasjonsform", value: legalForm ?? "Ikke tilgjengelig" },
    {
      label: "MVA-registrert",
      value:
        vatRegistered === null || vatRegistered === undefined
          ? "Ikke tilgjengelig"
          : vatRegistered
            ? "Ja"
            : "Nei",
    },
    { label: "Registrert", value: formatDate(registeredAt) },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.84)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
          <p className="mt-2 text-[1.45rem] font-semibold tracking-tight text-slate-950">{metric.value}</p>
        </Card>
      ))}
    </div>
  );
}
