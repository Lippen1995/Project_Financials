import Link from "next/link";

import { cn } from "@/lib/utils";

export type CompanyTabId =
  | "oversikt"
  | "regnskap"
  | "nokkeltall"
  | "konsern"
  | "aksjonaerer"
  | "kunngjoringer"
  | "dokumenter"
  | "nyheter"
  | "sokkeleksponering";

export const defaultCompanyTabs: { id: CompanyTabId; label: string }[] = [
  { id: "oversikt", label: "Oversikt" },
  { id: "regnskap", label: "Regnskap" },
  { id: "nokkeltall", label: "Nøkkeltall" },
  { id: "konsern", label: "Konsern" },
  { id: "aksjonaerer", label: "Aksjonærer" },
  { id: "kunngjoringer", label: "Kunngjøringer" },
  { id: "dokumenter", label: "Dokumenter" },
  { id: "nyheter", label: "Nyheter" },
  { id: "sokkeleksponering", label: "Sokkeleksponering" },
];

export function isCompanyTab(value: string | undefined): value is CompanyTabId {
  return defaultCompanyTabs.some((tab) => tab.id === value);
}

export function resolveCompanyTab(value: string | undefined): CompanyTabId {
  if (isCompanyTab(value)) return value;
  if (value === "eierskap") return "konsern";
  return "oversikt";
}

export function CompanyTabs({
  companySlug,
  activeTab,
  activeDdRoomId,
  tabs = defaultCompanyTabs,
}: {
  companySlug: string;
  activeTab: CompanyTabId;
  activeDdRoomId?: string | null;
  tabs?: Array<{ id: CompanyTabId; label: string }>;
}) {
  return (
    <div className="sticky top-[4.25rem] z-30 overflow-x-auto rounded-xl border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-4 backdrop-blur-sm">
      <div className="flex min-w-max gap-6">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/companies/${companySlug}?tab=${tab.id}${activeDdRoomId ? `&ddRoom=${activeDdRoomId}` : ""}`}
            className={cn(
              "data-label whitespace-nowrap border-b-2 py-4 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
              activeTab === tab.id
                ? "border-x-transparent border-t-transparent border-b-[var(--px-accent)] text-[var(--px-text)]"
                : "border-transparent text-[var(--px-muted)] hover:text-[var(--px-text)]",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
