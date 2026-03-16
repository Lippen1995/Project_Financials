import Link from "next/link";

import { cn } from "@/lib/utils";

export type CompanyTabId =
  | "oversikt"
  | "regnskap"
  | "nokkeltall"
  | "organisasjon"
  | "kunngjoringer";

const tabs: { id: CompanyTabId; label: string }[] = [
  { id: "oversikt", label: "Oversikt" },
  { id: "regnskap", label: "Regnskap" },
  { id: "nokkeltall", label: "Nokkeltall" },
  { id: "organisasjon", label: "Organisasjon" },
  { id: "kunngjoringer", label: "Kunngjoringer" },
];

export function isCompanyTab(value: string | undefined): value is CompanyTabId {
  return tabs.some((tab) => tab.id === value);
}

export function CompanyTabs({
  companySlug,
  activeTab,
}: {
  companySlug: string;
  activeTab: CompanyTabId;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-[1.5rem] border border-white/70 bg-white/75 p-2 shadow-panel">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/companies/${companySlug}?tab=${tab.id}`}
            className={cn(
              "rounded-[1.1rem] px-4 py-3 text-sm font-medium transition",
              activeTab === tab.id
                ? "bg-ink text-white"
                : "text-ink/65 hover:bg-sand hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
