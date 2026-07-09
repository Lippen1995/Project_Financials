import Link from "next/link";

import type { CompanyRole } from "@/server/registry/role-search-service";

const numberFormat = new Intl.NumberFormat("nb-NO");
const percentFormat = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function holderTypeLabel(type: CompanyRole["holderType"]) {
  return type === "COMPANY" ? "Selskap" : "Person";
}

function birthYear(birthDate: string | null) {
  if (!birthDate) return null;
  const year = birthDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

/** Effective (weighted look-through) ownership of a person role-holder in the company. */
function ownershipInfo(role: CompanyRole) {
  if (role.holderType !== "PERSON" || role.effectiveShares === null) return null;
  const total = role.effectiveShares;
  const direct = role.directShares ?? 0;
  const indirect = Math.max(total - direct, 0);
  return { total, direct, indirect, percent: role.effectivePercent, via: role.heldVia };
}

/**
 * Registered roles in a company (board, daglig leder, revisor, regnskapsfører, …) and who
 * holds them, from the Enhetsregister roller mirror. Company role-holders (auditors,
 * accountant firms, corporate board members) link through to their own company page.
 */
export function CompanyRoles({ roles }: { roles: CompanyRole[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="editorial-display text-3xl font-semibold text-[var(--px-text)]">Roller</h2>
        <p className="mt-1 text-sm text-[var(--px-muted)]">
          Registrerte roller i Enhetsregisteret og hvem som innehar dem.
        </p>
      </div>

      {roles.length > 0 ? (
        <div className="overflow-x-auto border-y border-[var(--px-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--px-border)] text-left">
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Rolle
                </th>
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Navn
                </th>
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Type
                </th>
                <th className="data-label py-2 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Aksjer i selskapet
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role, index) => {
                const year = birthYear(role.birthDate);
                return (
                  <tr
                    key={`${role.roleType}-${role.holderOrgNumber ?? role.personIdentityKey ?? index}`}
                    className="border-b border-[rgba(15,23,42,0.06)] transition-colors hover:bg-[var(--px-subtle)]"
                  >
                    <td className="py-2 pr-4 font-semibold text-[var(--px-text)]">
                      {role.roleTypeLabel ?? role.roleType}
                    </td>
                    <td className="py-2 pr-4">
                      {role.holderType === "COMPANY" && role.holderOrgNumber ? (
                        <Link
                          href={`/companies/${role.holderOrgNumber}?tab=aksjonaerer`}
                          className="font-medium text-[var(--px-text)] hover:underline"
                        >
                          {role.holderName}
                        </Link>
                      ) : (
                        <span className="font-medium text-[var(--px-text)]">{role.holderName}</span>
                      )}
                      <div className="text-xs text-[var(--px-muted)]">
                        {role.holderType === "COMPANY" && role.holderOrgNumber
                          ? `Org.nr. ${role.holderOrgNumber}`
                          : year
                            ? `Født ${year}`
                            : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-[var(--px-muted)]">
                      {holderTypeLabel(role.holderType)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {(() => {
                        const info = ownershipInfo(role);
                        if (info === null) return <span className="text-[var(--px-muted)]">—</span>;
                        if (info.total === 0)
                          return <span className="text-[var(--px-muted)]">Nei</span>;
                        return (
                          <div>
                            <div className="font-semibold text-[var(--px-text)]">
                              {numberFormat.format(info.total)} aksjer
                              {info.percent !== null
                                ? ` (${percentFormat.format(info.percent)} %)`
                                : ""}
                            </div>
                            {info.indirect > 0 && info.via ? (
                              <div className="text-xs font-normal text-[var(--px-muted)]">
                                herav {numberFormat.format(info.indirect)} indirekte via {info.via}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3 text-sm leading-6 text-[var(--px-muted)]">
          Ingen registrerte roller er tilgjengelige for dette selskapet.
        </p>
      )}

      <p className="border-t border-[var(--px-border)] pt-3 text-xs leading-5 text-[var(--px-muted)]">
        Kilde: Enhetsregisteret (roller). Viser gjeldende registrerte roller.
      </p>
    </section>
  );
}
