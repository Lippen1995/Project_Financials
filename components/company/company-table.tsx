import Link from "next/link";

import { NormalizedCompany } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

export function CompanyTable({ companies }: { companies: NormalizedCompany[] }) {
  if (companies.length === 0) {
    return <div className="rounded-[1.75rem] border border-dashed border-ink/15 bg-white/70 p-8 text-center text-sm text-ink/60">Ingen selskaper matchet soket ditt.</div>;
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/85 shadow-panel">
      <table className="min-w-full divide-y divide-ink/10 text-sm">
        <thead className="bg-sand">
          <tr className="text-left text-ink/60">
            <th className="px-5 py-4 font-medium">Selskap</th>
            <th className="px-5 py-4 font-medium">Org.nr</th>
            <th className="px-5 py-4 font-medium">Bransje</th>
            <th className="px-5 py-4 font-medium">Sted</th>
            <th className="px-5 py-4 font-medium">Omsetning</th>
            <th className="px-5 py-4 font-medium">Ansatte</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {companies.map((company) => (
            <tr key={company.orgNumber} className="hover:bg-sand/50">
              <td className="px-5 py-4">
                <Link href={`/companies/${company.slug}`} className="font-semibold text-tide hover:text-ember">{company.name}</Link>
                <div className="text-xs text-ink/60">{company.status}</div>
              </td>
              <td className="px-5 py-4">{company.orgNumber}</td>
              <td className="px-5 py-4">{company.industryCode?.code} {company.industryCode?.title}</td>
              <td className="px-5 py-4">{company.addresses[0]?.city ?? "Ikke tilgjengelig"}</td>
              <td className="px-5 py-4">{formatCurrency(company.revenue)}</td>
              <td className="px-5 py-4">{formatNumber(company.employeeCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}