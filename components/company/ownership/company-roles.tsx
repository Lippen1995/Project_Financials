import React from "react";
import Link from "next/link";
import { CircleHelp } from "lucide-react";

import type {
  CompanyRoleActivityOverview,
  CompanyRoleWithReportedChanges,
} from "@/server/insider-transactions/role-reported-changes-service";

const numberFormat = new Intl.NumberFormat("nb-NO");
const percentFormat = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function holderTypeLabel(type: CompanyRoleWithReportedChanges["holderType"]) {
  return type === "COMPANY" ? "Selskap" : "Person";
}

function birthYear(birthDate: string | null) {
  if (!birthDate) return null;
  const year = birthDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function ownershipInfo(role: CompanyRoleWithReportedChanges) {
  if (role.holderType !== "PERSON" || role.effectiveShares === null) return null;
  const total = role.effectiveShares;
  const direct = role.directShares ?? 0;
  const indirect = Math.max(total - direct, 0);
  return { total, indirect, percent: role.effectivePercent, via: role.heldVia };
}

function actionLabel(action: CompanyRoleWithReportedChanges["reportedChanges"][number]["action"]) {
  if (action === "PURCHASE") return { label: "kjøpt", sign: "+", tone: "text-emerald-700" };
  if (action === "SALE") return { label: "solgt", sign: "−", tone: "text-rose-700" };
  if (action === "SUBSCRIPTION") return { label: "tegnet", sign: "+", tone: "text-emerald-700" };
  return { label: "endret", sign: "", tone: "text-amber-700" };
}

export function CompanyRoles({ overview }: { overview: CompanyRoleActivityOverview }) {
  const { roles, snapshot } = overview;
  const snapshotLabel = snapshot
    ? dateFormat.format(new Date(`${snapshot.asOfDate}T00:00:00.000Z`))
    : null;

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
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">Rolle</th>
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">Navn</th>
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">Type</th>
                <th
                  scope="col"
                  aria-label="Rapporterte endringer"
                  className="data-label py-2 pr-4 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]"
                >
                  <span className="group relative inline-flex items-center justify-end gap-1" tabIndex={0} aria-describedby="reported-changes-tooltip">
                    Rapporterte endringer
                    <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
                    <span
                      id="reported-changes-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-80 rounded-xl border border-[var(--px-border)] bg-[var(--px-panel)] p-3 text-left text-[11px] font-normal normal-case leading-5 text-[var(--px-bg)] shadow-[0_8px_24px_rgba(15,23,42,0.14)] group-hover:block group-focus-visible:block"
                    >
                      Viser offentlig rapporterte endringer etter {snapshotLabel ?? "siste tilgjengelige beholdningsdato"}. Indirekte handler vektes med personens dokumenterte eierandel i det handlende selskapet. Endringene er ikke innarbeidet i beholdningen eller eierandelen til høyre.
                    </span>
                  </span>
                </th>
                <th className="data-label py-2 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  {snapshotLabel ? `Aksjer per ${snapshotLabel}` : "Aksjer i selskapet"}
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
                    <td className="py-2 pr-4 font-semibold text-[var(--px-text)]">{role.roleTypeLabel ?? role.roleType}</td>
                    <td className="py-2 pr-4">
                      {role.holderType === "COMPANY" && role.holderOrgNumber ? (
                        <Link href={`/companies/${role.holderOrgNumber}?tab=aksjonaerer`} className="font-medium text-[var(--px-text)] hover:underline">
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
                    <td className="py-2 pr-4 text-[var(--px-muted)]">{holderTypeLabel(role.holderType)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {role.reportedChanges.length === 0 ? (
                        <span className="text-[var(--px-muted)]">—</span>
                      ) : (
                        <div className="space-y-2">
                          {role.reportedChanges.map((change) => {
                            const action = actionLabel(change.action);
                            const indirect = !change.direct;
                            return (
                              <div key={change.transactionId}>
                                <a href={change.sourceUrl} target="_blank" rel="noreferrer" className={`font-semibold hover:underline ${action.tone}`}>
                                  {action.sign}{numberFormat.format(BigInt(change.attributedShares))} {action.label}{indirect ? " (vektet)" : ""}
                                </a>
                                <div className="text-xs font-normal text-[var(--px-muted)]">
                                  {dateFormat.format(new Date(`${change.transactionDate}T00:00:00.000Z`))}{indirect ? ` · via ${change.legalPartyName}` : " · direkte"}
                                </div>
                                {indirect && change.reportedShares !== change.attributedShares ? (
                                  <div className="text-xs font-normal text-[var(--px-muted)]">
                                    {numberFormat.format(BigInt(change.reportedShares))} rapporterte aksjer · {percentFormat.format(Number(change.ownershipFraction) * 100)} % eierbrøk
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {(() => {
                        const info = ownershipInfo(role);
                        if (info === null) return <span className="text-[var(--px-muted)]">—</span>;
                        if (info.total === 0) return <span className="text-[var(--px-muted)]">Ingen registrert beholdning</span>;
                        return (
                          <div>
                            <div className="font-semibold text-[var(--px-text)]">
                              {numberFormat.format(info.total)} aksjer{info.percent !== null ? ` (${percentFormat.format(info.percent)} %)` : ""}
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
        Kilder: Enhetsregisteret (roller), Skatteetatens aksjonærregister (beholdning) og NewsWeb (rapporterte endringer). NewsWeb-endringer påvirker ikke beholdningen eller eierandelen som vises.
      </p>
    </section>
  );
}
