import { CompanyTabsNav } from "./company-tabs-nav";

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

export const defaultCompanyTabs: { id: CompanyTabId; label: string }[] = [
  { id: "oversikt", label: "Oversikt" },
  { id: "regnskap", label: "Regnskap" },
  { id: "nokkeltall", label: "Nøkkeltall" },
  { id: "konsern", label: "Konsern" },
  { id: "aksjonaerer", label: "Aksjonærer" },
  { id: "kunngjoringer", label: "Kunngjøringer" },
  { id: "nyheter", label: "Nyheter" },
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
    <CompanyTabsNav
      companySlug={companySlug}
      activeTab={activeTab}
      activeDdRoomId={activeDdRoomId}
      tabs={tabs}
    />
  );
}
