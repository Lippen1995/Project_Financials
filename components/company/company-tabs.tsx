import Link from "next/link";

import { cn } from "@/lib/utils";

export type CompanyTabId =
  | "oversikt"
  | "regnskap"
  | "nokkeltall"
  | "eierskap"
  | "organisasjon"
  | "kunngjoringer"
  | "dokumenter"
  | "nyheter"
  | "sokkeleksponering";

export const defaultCompanyTabs: { id: CompanyTabId; label: string }[] = [
  { id: "oversikt", label: "Oversikt" },
  { id: "regnskap", label: "Regnskap" },
  { id: "nokkeltall", label: "Nøkkeltall" },
  { id: "eierskap", label: "Eierskap" },
  { id: "organisasjon", label: "Organisasjon" },
  { id: "kunngjoringer", label: "Kunngjøringer" },
  { id: "dokumenter", label: "Dokumenter" },
  { id: "nyheter", label: "Nyheter" },
  { id: "sokkeleksponering", label: "Sokkeleksponering" },
];

export function isCompanyTab(value: string | undefined): value is CompanyTabId {
  return defaultCompanyTabs.some((tab) => tab.id === value);
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
    <div className="sticky top-[4.25rem] z-30 -mx-1 overflow-x-auto bg-[var(--px-bg)] pb-px backdrop-blur-sm">
      <div className="flex gap-6 border-b border-[rgba(15,23,42,0.1)] px-1">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/companies/${companySlug}?tab=${tab.id}${activeDdRoomId ? `&ddRoom=${activeDdRoomId}` : ""}`}
            className={cn(
              "data-label whitespace-nowrap pb-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
              activeTab === tab.id
                ? "border-b-2 border-[var(--px-accent)] text-[var(--px-text)]"
                : "text-[var(--px-muted)] hover:text-[var(--px-text)]",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
