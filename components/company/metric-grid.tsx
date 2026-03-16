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
