import { NormalizedCompany, NormalizedRole } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

import { CardLabel } from "./earnings-trends";

type Fact = [label: string, value: string | null];

function InfoGroup({ label, items }: { label: string; items: Fact[] }) {
  const present = items.filter(([, value]) => value !== null && value !== "") as Array<[string, string]>;
  if (present.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="data-label mb-1 text-[11px] uppercase text-[var(--px-text)]">{label}</div>
      <div className="grid border-t border-[var(--px-border-subtle)] sm:grid-cols-2 lg:grid-cols-3">
        {present.map(([k, v], i) => (
          <div
            key={k}
            className={[
              "border-t border-[var(--px-border-subtle)] px-0 py-3 sm:px-4",
              i % 2 !== 0 ? "sm:border-l" : "",
              i % 3 !== 0 ? "lg:border-l" : "lg:border-l-0",
              i % 3 === 0 ? "lg:pl-0" : "",
            ].join(" ")}
          >
            <div className="data-label text-[10px] uppercase text-[var(--px-muted)]">{k}</div>
            <div className="mt-1.5 text-[14.5px] font-medium leading-snug text-[var(--px-text)] [text-wrap:pretty]">
              {v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function findRole(roles: NormalizedRole[], pattern: RegExp): string | null {
  const role = roles.find((r) => pattern.test(r.title));
  return role?.person.fullName ?? null;
}

export function CompanyInfo({
  company,
  roles,
}: {
  company: NormalizedCompany;
  roles: NormalizedRole[];
}) {
  const address = company.addresses[0] ?? null;
  const foundedYear = company.foundedAt
    ? new Date(company.foundedAt).getFullYear()
    : company.registeredAt
      ? new Date(company.registeredAt).getFullYear()
      : null;

  const identity: Fact[] = [
    ["Org.nr.", company.orgNumber],
    ["Organisasjonsform", company.legalForm ?? null],
    ["Stiftet", foundedYear ? String(foundedYear) : null],
    ["Aksjekapital", company.shareCapital != null ? formatCurrency(company.shareCapital) : null],
    ["Antall aksjer", company.shareCount != null ? formatNumber(company.shareCount) : null],
    [
      "Merverdiavgift",
      company.vatRegistered == null
        ? null
        : company.vatRegistered
          ? "Registrert i MVA-registeret"
          : "Ikke registrert i MVA-registeret",
    ],
  ];

  const management: Fact[] = [
    ["Daglig leder", findRole(roles, /daglig leder/i)],
    ["Styreleder", findRole(roles, /styre(ts)?\s*leder/i)],
  ];

  const classification: Fact[] = [
    [
      "Næringskode (NACE)",
      company.industryCode?.code
        ? `${company.industryCode.code}${company.industryCode.title ? ` — ${company.industryCode.title}` : ""}`
        : null,
    ],
    ["Antall ansatte", company.employeeCount != null ? formatNumber(company.employeeCount) : null],
  ];

  const location: Fact[] = [
    [
      "Forretningsadresse",
      address
        ? [address.line1, [address.postalCode, address.city].filter(Boolean).join(" ")]
            .filter((part) => part && part.trim() !== "")
            .join(", ")
        : null,
    ],
    ["Kommune", company.municipality ?? address?.city ?? null],
    ["Land", address?.country ?? null],
  ];

  return (
    <section>
      <CardLabel icon="business">Selskapsinformasjon</CardLabel>
      <InfoGroup label="Selskapsidentitet" items={identity} />
      <InfoGroup label="Ledelse" items={management} />
      <InfoGroup label="Klassifisering og drift" items={classification} />
      <InfoGroup label="Beliggenhet" items={location} />
    </section>
  );
}
