import Link from "next/link";

import { RankedCompanySearchResult } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

function formatStatusLabel(status: string) {
  if (status === "ACTIVE") {
    return "AKTIV";
  }

  if (status === "DISSOLVED") {
    return "AVVIKLET";
  }

  if (status === "BANKRUPT") {
    return "KONKURS";
  }

  return status;
}

export function CompanyTable({ companies }: { companies: RankedCompanySearchResult[] }) {
  if (companies.length === 0) {
    return (
      <div className="border-t border-[rgba(15,23,42,0.12)] pt-6 text-sm leading-7 text-[var(--px-muted)]">
        {"Ingen selskaper matchet s\u00f8ket eller filtrene dine."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-[var(--px-border-subtle)]">
      <table className="min-w-full text-sm">
        <thead className="border-b border-[var(--px-border-subtle)] bg-[rgba(248,249,250,0.62)]">
          <tr className="text-left text-[var(--px-muted)]">
            <th className="data-label px-5 py-4 font-medium">Selskap</th>
            <th className="data-label px-5 py-4 font-medium">Org.nr</th>
            <th className="data-label px-5 py-4 font-medium">Bransje</th>
            <th className="data-label px-5 py-4 font-medium">Sted</th>
            <th className="data-label px-5 py-4 text-right font-medium">Inntekt</th>
            <th className="data-label px-5 py-4 text-right font-medium">Ansatte</th>
            <th className="data-label px-5 py-4 font-medium">Registrert</th>
          </tr>
        </thead>

        <tbody>
          {companies.map(({ company, revenue, revenueFiscalYear, matchReasons }) => (
            <tr
              key={company.orgNumber}
              className="border-b border-[rgba(15,23,42,0.06)] align-top transition-colors hover:bg-[rgba(248,249,250,0.62)] last:border-b-0"
            >
              <td className="px-5 py-5">
                <div className="space-y-2">
                  <div>
                    <Link
                      href={`/companies/${company.orgNumber}`}
                      className="text-[0.98rem] font-semibold text-[var(--px-text)] hover:text-[var(--px-accent)]"
                    >
                      {company.name}
                    </Link>
                    <div className="data-label mt-1 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                      {formatStatusLabel(company.status)}
                    </div>
                  </div>

                  {matchReasons.length > 0 ? (
                    <div className="space-y-1 text-xs leading-5 text-[var(--px-muted)]">
                      {matchReasons.slice(0, 3).map((reason) => (
                        <div key={reason}>{reason}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </td>

              <td className="px-5 py-5 font-mono text-[13px] text-[var(--px-text)]">
                {company.orgNumber}
              </td>

              <td className="px-5 py-5 text-[var(--px-text)]">
                <div className="max-w-[16rem] leading-6">
                  {company.industryCode?.code}
                  {company.industryCode?.title ? ` ${company.industryCode.title}` : ""}
                </div>
              </td>

              <td className="px-5 py-5 text-[var(--px-text)]">
                {company.addresses[0]?.city ?? "Ikke tilgjengelig"}
              </td>

              <td className="px-5 py-5 text-right">
                <div className="tabular-nums text-[var(--px-text)]">{formatCurrency(revenue)}</div>
                {revenueFiscalYear ? (
                  <div className="mt-1 text-xs text-[var(--px-muted)]">
                    {"Siste \u00e5r "} {revenueFiscalYear}
                  </div>
                ) : null}
              </td>

              <td className="px-5 py-5 text-right tabular-nums text-[var(--px-text)]">
                {formatNumber(company.employeeCount)}
              </td>

              <td className="px-5 py-5 text-[var(--px-text)]">{formatDate(company.registeredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
