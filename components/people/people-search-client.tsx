"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 220;

type PersonResult = {
  identityKey: string;
  fullName: string;
  birthDate: string | null;
  isDeceased: boolean;
  roleCount: number;
  companyCount: number;
};

type PersonRole = {
  companyOrgNumber: string;
  companyName: string | null;
  roleType: string;
  roleTypeLabel: string | null;
  isBoardRole: boolean;
  deregistered: boolean;
  groupLastChanged: string | null;
};

type PersonShareholding = {
  issuerOrgNumber: string;
  issuerName: string;
  shares: string;
  ownershipPercent: number | null;
  taxYear: number;
};

const numberFormat = new Intl.NumberFormat("nb-NO");
const percentFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });

function birthYear(birthDate: string | null) {
  if (!birthDate) return null;
  const year = birthDate.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

function formatShares(value: string) {
  try {
    return numberFormat.format(BigInt(value));
  } catch {
    return value;
  }
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${percentFormat.format(value)} %`;
}

export function PeopleSearchClient({
  roleTypes,
  initialQuery = "",
  initialRoleType = "",
  searchScope = "persons",
}: {
  roleTypes: Array<{ code: string; label: string }>;
  initialQuery?: string;
  initialRoleType?: string;
  searchScope?: "persons" | "roles";
}) {
  const [query, setQuery] = useState(initialQuery);
  const [roleType, setRoleType] = useState(
    roleTypes.some((role) => role.code === initialRoleType) ? initialRoleType : "",
  );
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<PersonResult | null>(null);
  const [personRoles, setPersonRoles] = useState<PersonRole[]>([]);
  const [shareholdings, setShareholdings] = useState<PersonShareholding[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [shareholdingsLoading, setShareholdingsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => detailRequestRef.current?.abort();
  }, []);

  // Debounced person search; stale responses dropped via AbortController.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH && !roleType) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query: trimmed, limit: "40" });
        params.set("scope", searchScope);
        if (roleType) params.set("roleType", roleType);
        const response = await fetch(`/api/persons/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const payload = (await response.json()) as { data: PersonResult[] };
        setResults(payload.data);
        setSearched(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setSearched(true);
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, roleType, searchScope]);

  function selectPerson(person: PersonResult) {
    detailRequestRef.current?.abort();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    const identityKey = encodeURIComponent(person.identityKey);

    setSelected(person);
    setRolesLoading(true);
    setShareholdingsLoading(true);
    setPersonRoles([]);
    setShareholdings([]);

    void fetch(`/api/persons/search?identityKey=${identityKey}&section=roles`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("role lookup failed");
        const payload = (await response.json()) as { data: { roles: PersonRole[] } };
        setPersonRoles(payload.data.roles);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPersonRoles([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRolesLoading(false);
      });

    void fetch(`/api/persons/search?identityKey=${identityKey}&section=shareholdings`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("shareholding lookup failed");
        const payload = (await response.json()) as {
          data: { shareholdings: PersonShareholding[] };
        };
        setShareholdings(payload.data.shareholdings);
      })
      .catch(() => {
        if (!controller.signal.aborted) setShareholdings([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setShareholdingsLoading(false);
      });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 focus-within:border-[var(--px-accent)]">
          <span className="material-symbols-outlined text-[20px] text-[var(--px-muted)]">
            person_search
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Søk på navn…"
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
          />
        </div>
        <select
          id="role-filter"
          value={roleType}
          onChange={(event) => setRoleType(event.target.value)}
          className="h-11 rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 text-sm font-semibold text-[var(--px-text)] outline-none transition-colors hover:border-[var(--px-accent)]"
        >
          <option value="">Alle roller</option>
          {roleTypes.map((role) => (
            <option key={role.code} value={role.code}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {query.trim().length < MIN_QUERY_LENGTH && !roleType ? (
            <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-8 text-center text-sm text-[var(--px-muted)]">
              Skriv minst {MIN_QUERY_LENGTH} tegn for å søke etter personer.
            </p>
          ) : loading && results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--px-muted)]">Søker…</p>
          ) : searched && results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-8 text-center text-sm text-[var(--px-muted)]">
              Ingen personer matcher søket.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--px-border)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--px-border)] bg-[var(--px-subtle)] text-left">
                    <th className="data-label px-4 py-2 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                      Navn
                    </th>
                    <th className="data-label px-4 py-2 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                      Roller
                    </th>
                    <th className="data-label px-4 py-2 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                      Selskaper
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((person) => (
                    <tr
                      key={person.identityKey}
                      className={`cursor-pointer border-b border-[rgba(15,23,42,0.06)] transition-colors last:border-b-0 hover:bg-[var(--px-subtle)] ${
                        selected?.identityKey === person.identityKey ? "bg-[var(--px-subtle)]" : ""
                      }`}
                      onClick={() => selectPerson(person)}
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-[var(--px-text)]">{person.fullName}</span>
                        <div className="text-xs text-[var(--px-muted)]">
                          {birthYear(person.birthDate) ? `Født ${birthYear(person.birthDate)}` : "Fødselsår ukjent"}
                          {person.isDeceased ? " · død" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--px-text)]">
                        {person.roleCount}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--px-text)]">
                        {person.companyCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected ? (
          <aside className="h-fit rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5 lg:sticky lg:top-24">
            <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
              Roller på tvers av selskaper
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-tight text-[var(--px-text)]">
              {selected.fullName}
            </h2>
            <p className="text-xs text-[var(--px-muted)]">
              {birthYear(selected.birthDate) ? `Født ${birthYear(selected.birthDate)} · ` : ""}
              {selected.companyCount} selskaper
            </p>

            <div className="mt-4 space-y-2 border-t border-[var(--px-border)] pt-4">
              {rolesLoading ? (
                <p className="text-sm text-[var(--px-muted)]">Laster roller…</p>
              ) : personRoles.length === 0 ? (
                <p className="text-sm text-[var(--px-muted)]">Ingen aktive roller funnet.</p>
              ) : (
                personRoles.map((role, index) => (
                  <div
                    key={`${role.companyOrgNumber}-${role.roleType}-${index}`}
                    className="flex items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.06)] pb-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/companies/${role.companyOrgNumber}?tab=aksjonaerer`}
                        className="block truncate text-sm font-semibold text-[var(--px-text)] hover:underline"
                      >
                        {role.companyName ?? role.companyOrgNumber}
                      </Link>
                      <span className="text-xs text-[var(--px-muted)]">Org.nr. {role.companyOrgNumber}</span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        role.isBoardRole
                          ? "bg-[rgba(49,73,95,0.08)] text-[var(--px-accent)]"
                          : "bg-[var(--px-subtle)] text-[var(--px-muted)]"
                      }`}
                    >
                      {role.roleTypeLabel ?? role.roleType}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 space-y-2 border-t border-[var(--px-border)] pt-4">
              <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
                Aksjer personen eier
              </div>
              {shareholdingsLoading ? (
                <p className="text-sm text-[var(--px-muted)]">Laster aksjer…</p>
              ) : shareholdings.length === 0 ? (
                <p className="text-sm text-[var(--px-muted)]">
                  Ingen registrerte aksjeposter i aksjonærregisteret.
                </p>
              ) : (
                shareholdings.map((holding) => (
                  <div
                    key={holding.issuerOrgNumber}
                    className="flex items-start justify-between gap-3 border-b border-[rgba(15,23,42,0.06)] pb-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/companies/${holding.issuerOrgNumber}?tab=aksjonaerer`}
                        className="block truncate text-sm font-semibold text-[var(--px-text)] hover:underline"
                      >
                        {holding.issuerName}
                      </Link>
                      <span className="text-xs text-[var(--px-muted)]">
                        {formatShares(holding.shares)} aksjer
                      </span>
                    </div>
                    <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--px-text)]">
                      {formatPercent(holding.ownershipPercent)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </aside>
        ) : (
          <aside className="hidden h-fit rounded-2xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-5 text-sm leading-6 text-[var(--px-muted)] lg:block">
            Velg en person for å se alle rollene vedkommende har på tvers av selskaper.
          </aside>
        )}
      </div>
    </div>
  );
}
