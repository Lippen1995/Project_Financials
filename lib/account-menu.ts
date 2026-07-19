import { canAccessAdmin } from "@/lib/admin-access";

export type AppViewer = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  appRole?: "USER" | "ADMIN" | "FINANCIAL_REVIEWER";
  currentWorkspaceId?: string;
  currentWorkspaceName?: string;
  currentWorkspaceType?: "PERSONAL" | "TEAM";
  currentWorkspaceStatus?: "ACTIVE" | "ARCHIVED";
  currentWorkspaceRole?: "OWNER" | "ADMIN" | "MEMBER";
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  profileDisplayName?: string;
  profileImage?: string;
  profileJobTitle?: string;
  profileEmployerName?: string;
  profileIsStudent?: boolean;
  profileUniversityName?: string;
  profileDegree?: string;
  profileLinkedinConnected?: boolean;
  profileOnboardingCompleted?: boolean;
  profileCompletenessScore?: number;
  profileCurrentLocation?: string;
  profileCountryOfWork?: string;
};

export type AccountMenuItem = {
  href?: string;
  label: string;
  disabled?: boolean;
};

export type AccountMenuSection = {
  label: string;
  items: AccountMenuItem[];
};

export type ProfileTabId =
  | "profile"
  | "messages"
  | "settings"
  | "notifications"
  | "language"
  | "history";

type ProfileTabDefinition = {
  description: string;
  id: ProfileTabId;
  label: string;
  section: "KONTO" | "ARBEIDSOMRADE";
  title: string;
};

export const PROFILE_TABS: Record<ProfileTabId, ProfileTabDefinition> = {
  profile: {
    id: "profile",
    label: "Profilinnstillinger",
    title: "Profilinnstillinger",
    section: "KONTO",
    description: "Rediger profilen og oppdater hvordan du fremstår i Fjord Insight.",
  },
  messages: {
    id: "messages",
    label: "Meldinger",
    title: "Meldinger",
    section: "KONTO",
    description: "Meldinger blir lagt til i en senere iterasjon.",
  },
  settings: {
    id: "settings",
    label: "Innstillinger og personvern",
    title: "Innstillinger og personvern",
    section: "KONTO",
    description: "Konto- og personvernvalg for brukeren din.",
  },
  notifications: {
    id: "notifications",
    label: "Varsler",
    title: "Varsler",
    section: "KONTO",
    description: "Varsler og oppfølging i produktet.",
  },
  language: {
    id: "language",
    label: "Språk",
    title: "Språk",
    section: "KONTO",
    description: "Språkvalg for konto og arbeidsflate.",
  },
  history: {
    id: "history",
    label: "Søk og analysehistorikk",
    title: "Søk og analysehistorikk",
    section: "ARBEIDSOMRADE",
    description: "Tidligere søk og analysemønstre.",
  },
};

const WORKSPACE_ROLE_LABELS: Record<NonNullable<AppViewer["currentWorkspaceRole"]>, string> = {
  OWNER: "Workspace-eier",
  ADMIN: "Workspace-admin",
  MEMBER: "Workspace-medlem",
};

export function getProfileTabHref(tab: ProfileTabId) {
  if (tab === "profile") {
    return "/onboarding/profile?mode=edit";
  }

  return "/profile";
}

function getEmailPrefix(email?: string | null) {
  if (!email) {
    return "";
  }

  return email.split("@")[0]?.trim() ?? "";
}

export function getViewerDisplayName(viewer?: AppViewer | null) {
  const explicitName = viewer?.profileDisplayName?.trim() || viewer?.name?.trim();
  if (explicitName) {
    return explicitName;
  }

  const emailPrefix = getEmailPrefix(viewer?.email);
  if (emailPrefix) {
    return emailPrefix;
  }

  return "Bruker";
}

export function getViewerInitials(viewer?: AppViewer | null) {
  const base = getViewerDisplayName(viewer);
  const parts = base
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  const compact = parts[0] ?? base;
  return compact.slice(0, Math.min(2, compact.length)).toUpperCase() || "?";
}

export function getViewerHeadline(viewer?: AppViewer | null) {
  if (viewer?.profileIsStudent) {
    if (viewer.profileDegree?.trim() && viewer.profileUniversityName?.trim()) {
      return `${viewer.profileDegree.trim()} ved ${viewer.profileUniversityName.trim()}`;
    }

    if (viewer.profileUniversityName?.trim()) {
      return viewer.profileUniversityName.trim();
    }
  }

  if (viewer?.profileJobTitle?.trim() && viewer.profileEmployerName?.trim()) {
    return `${viewer.profileJobTitle.trim()} · ${viewer.profileEmployerName.trim()}`;
  }

  if (viewer?.profileJobTitle?.trim()) {
    return viewer.profileJobTitle.trim();
  }

  if (viewer?.profileEmployerName?.trim()) {
    return viewer.profileEmployerName.trim();
  }

  const workspaceName = viewer?.currentWorkspaceName?.trim();
  const workspaceRole = viewer?.currentWorkspaceRole
    ? WORKSPACE_ROLE_LABELS[viewer.currentWorkspaceRole]
    : null;

  if (workspaceName && workspaceRole) {
    return `${workspaceRole} i ${workspaceName}`;
  }

  if (workspaceName) {
    return `Tilknyttet ${workspaceName}`;
  }

  return "Fjord Insight-bruker";
}

export function getViewerProfileHref() {
  return "/profile";
}

export function isViewerVerified(_viewer?: AppViewer | null) {
  return false;
}

export function buildAccountMenuSections(viewer?: AppViewer | null): AccountMenuSection[] {
  const sections: AccountMenuSection[] = [
    {
      label: "KONTO",
      items: [
        { label: PROFILE_TABS.profile.label, href: getProfileTabHref("profile") },
        { label: PROFILE_TABS.settings.label, href: "/profile" },
        { label: PROFILE_TABS.notifications.label, href: "/watchlist" },
        { label: PROFILE_TABS.language.label, disabled: true },
      ],
    },
    {
      label: "ARBEIDSOMRADE",
      items: [
        { label: "Overvåkning", href: "/watchlist" },
        {
          label: "Due diligence",
          disabled: true,
        },
        { label: PROFILE_TABS.history.label, href: "/search-history" },
        { label: "Tilganger og abonnement", href: "/pricing" },
      ],
    },
  ];

  if (canAccessAdmin(viewer)) {
    sections.push({
      label: "ADMINISTRER",
      items: [
        { label: "Adminpanel", href: "/admin" },
        { label: "Godkjente årsregnskaper", href: "/admin/published-annual-reports" },
        { label: "Rapporter til manuell kontroll", href: "/admin/annual-report-reviews" },
        ...(viewer?.appRole === "ADMIN"
          ? [{ label: "Brukere og roller", href: "/admin/users" }]
          : []),
        { label: "Datakvalitet", href: "/admin/annual-report-unified-confidence" },
      ],
    });
  }

  return sections;
}
