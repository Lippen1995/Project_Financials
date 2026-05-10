import { canAccessAdmin } from "@/lib/admin-access";

export type GlobalNavItem = {
  href: string;
  label: string;
};

export function buildGlobalNavItems(user?: { appRole?: string | null } | null): GlobalNavItem[] {
  const items: GlobalNavItem[] = [
    { href: "/search", label: "Sok" },
    { href: "/market/distress", label: "Distress" },
    { href: "/market/oil-gas", label: "Olje & gass" },
    { href: "/pricing", label: "Tilgang" },
  ];

  if (canAccessAdmin(user)) {
    items.push({ href: "/admin", label: "Admin" });
  }

  return items;
}
