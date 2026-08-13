import { canAccessAdmin } from "@/lib/admin-access";

export type GlobalNavItem = {
  href: string;
  label: string;
  icon: string;
};

export type GlobalNavMenuCategoryId = "explore" | "analysis";

export type GlobalNavMenuCategory = {
  id: GlobalNavMenuCategoryId;
  label: string;
  items: GlobalNavItem[];
};

export function isGlobalNavItemActive(item: GlobalNavItem, pathname: string) {
  if (item.href === "/") {
    return pathname === "/";
  }

  if (pathname === item.href) {
    return true;
  }

  return pathname.startsWith(`${item.href}/`);
}

export function buildGlobalNavItems(user?: { appRole?: string | null } | null): GlobalNavItem[] {
  const items: GlobalNavItem[] = [
    { href: "/search", label: "Søk", icon: "search" },
    { href: "/analyses", label: "Analyser", icon: "analytics" },
    { href: "/company-map", label: "Selskapskart", icon: "map" },
    { href: "/people", label: "Personer", icon: "person_search" },
    { href: "/watchlist", label: "Overvåkning", icon: "star" },
    { href: "/market/distress", label: "Distress", icon: "warning" },
    { href: "/market/oil-gas", label: "Olje & gass", icon: "oil_barrel" },
    { href: "/pricing", label: "Tilgang", icon: "key" },
  ];

  if (canAccessAdmin(user)) {
    items.push({ href: "/admin", label: "Admin", icon: "admin_panel_settings" });
  }

  return items;
}

export function buildGlobalNavMenuCategories(
  items: GlobalNavItem[],
): GlobalNavMenuCategory[] {
  const itemsByHref = new Map(items.map((item) => [item.href, item]));

  const pick = (href: string, label?: string) => {
    const item = itemsByHref.get(href);
    return item ? { ...item, label: label ?? item.label } : null;
  };

  return [
    {
      id: "explore",
      label: "Utforsk",
      items: [
        pick("/company-map"),
        pick("/people"),
        pick("/watchlist"),
        pick("/market/distress"),
      ].filter((item): item is GlobalNavItem => item !== null),
    },
    {
      id: "analysis",
      label: "Analyse",
      items: [pick("/analyses", "Analyse"), pick("/market/oil-gas", "Olje og gass")].filter(
        (item): item is GlobalNavItem => item !== null,
      ),
    },
  ];
}
