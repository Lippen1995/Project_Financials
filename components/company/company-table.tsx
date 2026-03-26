import Link from "next/link";

import { NormalizedCompany } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

export function CompanyTable({ companies }: { companies: NormalizedCompany[] }) {
  if (companies.length === 0) {
    return (
      <div className="border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(255,255,255,0.7)] p-8 text-center text-sm text-slate-600">
        Ingen selskaper matchet søket eller filtrene dine.
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-[rgba(15,23,42,0.08)] bg-white">
      <table className="min-w-full divide-y divide-[rgba(15,23,42,0.08)] text-sm">
        <thead className="bg-[rgba(248,249,250,0.72)]">
          <tr className="text-left text-slate-600">
            <th className="data-label px-5 py-4 font-medium">Selskap</th>
            <th className="data-label px-5 py-4 font-medium">Org.nr</th>
            <th className="data-label px-5 py-4 font-medium">Bransje</th>
            <th className="data-label px-5 py-4 font-medium">Sted</th>
            <th className="data-label px-5 py-4 font-medium">Ansatte</th>
            <th className="data-label px-5 py-4 font-medium">Registrert</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgba(15,23,42,0.06)]">
          {companies.map((company) => (
            <tr key={company.orgNumber} className="hover:bg-[rgba(248,249,250,0.72)]">
              <td className="px-5 py-4">
                <Link
                  href={`/companies/${company.orgNumber}`}
                  className="font-semibold text-[#162233] hover:text-[#31495f]"
                >
                  {company.name}
                </Link>
                <div className="text-xs text-slate-500">{company.status}</div>
              </td>
              <td className="px-5 py-4">{company.orgNumber}</td>
              <td className="px-5 py-4">
                {company.industryCode?.code}
                {company.industryCode?.title ? ` ${company.industryCode.title}` : ""}
              </td>
              <td className="px-5 py-4">{company.addresses[0]?.city ?? "Ikke tilgjengelig"}</td>
              <td className="px-5 py-4">{formatNumber(company.employeeCount)}</td>
              <td className="px-5 py-4">{formatDate(company.registeredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
