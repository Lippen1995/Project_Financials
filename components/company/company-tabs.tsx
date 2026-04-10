import Link from "next/link";

import { cn } from "@/lib/utils";

export type CompanyTabId =
  | "oversikt"
  | "regnskap"
  | "nokkeltall"
  | "organisasjon"
  | "kunngjoringer"
  | "sokkeleksponering"
  | "immaterielle-rettigheter";

export const defaultCompanyTabs: { id: CompanyTabId; label: string }[] = [
  { id: "oversikt", label: "Oversikt" },
  { id: "regnskap", label: "Regnskap" },
  { id: "nokkeltall", label: "Nøkkeltall" },
  { id: "organisasjon", label: "Organisasjon" },
  { id: "kunngjoringer", label: "Kunngjøringer" },
  { id: "sokkeleksponering", label: "Sokkeleksponering" },
  { id: "immaterielle-rettigheter", label: "Immaterielle rettigheter" },
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
    <div className="sticky top-4 z-30 overflow-x-auto rounded-[1rem] border border-[rgba(15,23,42,0.08)] bg-[rgba(247,247,245,0.86)] px-2 py-2 backdrop-blur-sm">
      <div className="inline-flex min-w-full gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/companies/${companySlug}?tab=${tab.id}${activeDdRoomId ? `&ddRoom=${activeDdRoomId}` : ""}`}
            className={cn(
              "rounded-[0.8rem] px-4 py-2.5 text-sm font-medium transition",
              activeTab === tab.id
                ? "bg-[#182535] text-white"
                : "text-slate-600 hover:bg-white hover:text-slate-900",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
