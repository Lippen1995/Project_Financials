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
  | "nettilknytning"
  | "sokkeleksponering"
  | "immaterielt";

/** Material Symbols icon per tab — matches the "5C" company profile design. */
const TAB_ICONS: Record<CompanyTabId, string> = {
  oversikt: "dashboard",
  regnskap: "account_balance",
  nokkeltall: "query_stats",
  konsern: "account_tree",
  aksjonaerer: "groups",
  kunngjoringer: "campaign",
  dokumenter: "folder",
  nyheter: "newspaper",
  nettilknytning: "bolt",
  sokkeleksponering: "oil_barrel",
  immaterielt: "copyright",
};

export const defaultCompanyTabs: { id: CompanyTabId; label: string }[] = [
  { id: "oversikt", label: "Oversikt" },
  { id: "regnskap", label: "Regnskap" },
  { id: "nokkeltall", label: "Nøkkeltall" },
  { id: "konsern", label: "Konsern" },
  { id: "aksjonaerer", label: "Aksjonærer" },
  { id: "kunngjoringer", label: "Kunngjøringer" },
  { id: "dokumenter", label: "Dokumenter" },
  { id: "nyheter", label: "Nyheter" },
  { id: "nettilknytning", label: "Nettilknytning" },
  { id: "sokkeleksponering", label: "Sokkeleksponering" },
  { id: "immaterielt", label: "Immaterielle rettigheter" },
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
    <div className="sticky top-[4.25rem] z-30 -mx-4 overflow-x-auto border-b border-[var(--px-border)] bg-[var(--px-bg)]/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/companies/${companySlug}?tab=${tab.id}${activeDdRoomId ? `&ddRoom=${activeDdRoomId}` : ""}`}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-4 text-sm transition-colors",
                active
                  ? "border-[var(--px-accent)] font-semibold text-[var(--px-text)]"
                  : "border-transparent font-medium text-[var(--px-muted)] hover:text-[var(--px-text)]",
              )}
            >
              <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
                {TAB_ICONS[tab.id]}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
