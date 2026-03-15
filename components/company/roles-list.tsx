import { NormalizedRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function RolesList({ roles }: { roles: NormalizedRole[] }) {
  if (roles.length === 0) {
    return <p className="text-sm text-ink/60">Ingen roller registrert.</p>;
  }

  return (
    <div className="space-y-3">
      {roles.map((role) => (
        <div key={role.sourceId} className="rounded-2xl border border-ink/10 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">{role.person.fullName}</p>
              <p className="text-sm text-ink/60">{role.title}</p>
            </div>
            <div className="text-xs text-ink/55">{role.fromDate ? `${formatDate(role.fromDate)} - ${role.toDate ? formatDate(role.toDate) : "na"}` : "Periode ikke oppgitt"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}