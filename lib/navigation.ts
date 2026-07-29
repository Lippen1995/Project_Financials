import { canAccessAdmin } from "@/lib/admin-access";

export type GlobalNavItem = {
  href: string;
  label: string;
  icon: string;
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
