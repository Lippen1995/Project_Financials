import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, Building2, Link2, MapPin, School } from "lucide-react";

import { safeAuth } from "@/lib/auth";
import {
  getProfileAffiliationSubtitle,
  getProfileCompletenessHint,
  getProfileDisplayName,
  getProfileInitials,
  getProfileLocationLabel,
  type ProfileCareerEntry,
  type ProfileEducationEntry,
} from "@/lib/user-profile";
import { getPrivateUserProfileView } from "@/server/services/user-profile-service";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="data-label text-[11px] uppercase tracking-[0.2em] text-[var(--px-muted)]">
      {children}
    </h2>
  );
}

function SurfaceBadge({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--px-text)]">
      <span className="text-[var(--px-accent)]">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

function PrimaryInfoItem({
  label,
  value,
  mono = false,
  withStatusDot = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  withStatusDot?: boolean;
}) {
  return (
    <div className="border-t border-[var(--px-border-subtle)] pt-4">
      <div className="data-label text-[11px] uppercase tracking-[0.16em] text-[var(--px-muted)]">
        {label}
      </div>
      <div
        className={`mt-2 text-sm text-[var(--px-text)] ${mono ? "font-mono" : "font-medium"}`}
      >
        {withStatusDot ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--px-accent)]" />
            <span>{value}</span>
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function formatTier(plan?: string | null) {
  const normalized = plan?.trim();
  return normalized ? normalized.toUpperCase() : "FREE";
}

function joinReadable(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" • ");
}

function getDisplayValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || "Not provided";
}

function buildEducationEntries(profile: {
  education: ProfileEducationEntry[];
  universityName?: string | null;
  degree?: string | null;
  studyFocus?: string | null;
  graduationYear?: number | null;
}) {
  if (profile.education.length > 0) {
    return profile.education;
  }

  if (!profile.universityName && !profile.degree && !profile.studyFocus && !profile.graduationYear) {
    return [];
  }

  return [
    {
      institution: profile.universityName ?? "Education",
      degree: profile.degree,
      studyFocus: profile.studyFocus,
      graduationYear: profile.graduationYear,
    },
  ];
}

function buildCareerEntries(profile: {
  careerHistory: ProfileCareerEntry[];
  employerName?: string | null;
  jobTitle?: string | null;
}) {
  if (profile.careerHistory.length > 0) {
    return profile.careerHistory;
  }

  if (!profile.employerName && !profile.jobTitle) {
    return [];
  }

  return [
    {
      organization: profile.employerName ?? "Current affiliation",
      role: profile.jobTitle,
      summary: null,
      startYear: null,
      endYear: null,
    },
  ];
}

export default async function ProfilePage() {
  const session = await safeAuth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const view = await getPrivateUserProfileView(session.user.id);
  const { profile, matchedCompany } = view;

  const displayName = getProfileDisplayName({
    profileDisplayName: profile.displayName,
    name: view.user.name,
    email: view.user.email,
  });
  const initials = getProfileInitials({
    profileDisplayName: profile.displayName,
    name: view.user.name,
    email: view.user.email,
  });

  const sectorLabel = profile.employerSector ?? matchedCompany?.sector ?? profile.sectorsOfInterest[0] ?? null;
  const subtitle = getProfileAffiliationSubtitle({
    ...profile,
    employerSector: sectorLabel,
  });
  const locationLabel = getProfileLocationLabel(profile);
  const companyLogoUrl = !profile.isStudent ? profile.employerLogoUrl ?? matchedCompany?.logoUrl ?? null : null;
  const tierLabel = formatTier(session.user.subscriptionPlan);
  const completenessScore = profile.profileCompletenessScore;
  const completenessHint = getProfileCompletenessHint({
    ...profile,
    employerSector: sectorLabel,
    profileCompletenessScore: completenessScore,
    workEmail: profile.workEmail ?? view.user.email,
  });

  const directEmail = profile.workEmail ?? view.user.email ?? "Not provided";
  const phoneValue = profile.phoneNumber ?? "Not provided";
  const affiliationLabel = profile.isStudent ? "Academic Affiliation" : "Corporate Office / Affiliation";
  const affiliationValue = profile.isStudent
    ? profile.universityName ?? locationLabel ?? "Not provided"
    : matchedCompany?.location ?? profile.employerName ?? "Not provided";
  const availabilityValue = locationLabel ?? profile.countryOfWork ?? profile.countryOfOrigin ?? "Not provided";

  const careerEntries = buildCareerEntries(profile);
  const educationEntries = buildEducationEntries(profile);

  return (
    <main className="mx-auto w-full max-w-[1440px] bg-[var(--px-surface)] px-2 py-6 text-[var(--px-text)] sm:px-4 lg:px-8 lg:py-10">
      <section className="mb-16 flex flex-col gap-12 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
          <div className="relative mx-auto lg:mx-0">
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-4 border-[var(--px-subtle)] bg-[var(--px-accent-soft)] text-4xl font-semibold text-[var(--px-text)] shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:h-44 sm:w-44 xl:h-48 xl:w-48">
              {profile.profileImageUrl || view.user.image ? (
                <span
                  role="img"
                  aria-label={displayName}
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url("${profile.profileImageUrl ?? view.user.image}")` }}
                />
              ) : (
                initials
              )}
            </div>
            <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-xl border border-[var(--px-border)] bg-[var(--px-accent-soft)] px-3 py-1.5 shadow-sm">
              <BadgeCheck className="h-4 w-4 text-[var(--px-accent)]" />
              <span className="data-label text-[10px] uppercase tracking-[0.14em] text-[var(--px-text)]">
                {tierLabel}
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-center text-center lg:items-start lg:pt-4 lg:text-left">
            <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <h1 className="editorial-display text-5xl leading-[0.95] tracking-[-0.04em] text-[var(--px-text)] sm:text-6xl">
                {displayName}
              </h1>
              {companyLogoUrl ? (
                <span
                  role="img"
                  aria-label={`${profile.employerName ?? "Company"} logo`}
                  className="h-8 w-20 shrink-0 bg-contain bg-center bg-no-repeat opacity-60 grayscale"
                  style={{ backgroundImage: `url("${companyLogoUrl}")` }}
                />
              ) : null}
            </div>

            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--px-muted)] sm:text-lg">
              {subtitle}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              {profile.linkedinConnected ? (
                <SurfaceBadge icon={<Link2 className="h-4 w-4" />}>LinkedIn Sync Active</SurfaceBadge>
              ) : null}
              {locationLabel ? (
                <SurfaceBadge icon={<MapPin className="h-4 w-4 text-[var(--px-muted)]" />}>
                  {locationLabel}
                </SurfaceBadge>
              ) : null}
              {profile.employerMatchedCompanyId || profile.employerOrgNumber || matchedCompany ? (
                <SurfaceBadge icon={<Building2 className="h-4 w-4" />}>Company matched</SurfaceBadge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="w-full xl:w-64">
          <div className="flex flex-col gap-5 xl:items-end">
            <Link
              href="/onboarding/profile?mode=edit"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--px-text)] px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-opacity hover:opacity-90"
            >
              Edit Profile
            </Link>

            <div className="w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-6">
              <div className="flex items-end justify-between gap-4">
                <span className="data-label text-[11px] uppercase tracking-[0.16em] text-[var(--px-muted)]">
                  Profile Completeness
                </span>
                <span className="font-mono text-sm font-semibold text-[var(--px-text)]">
                  {completenessScore}%
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
                <div
                  className="h-full rounded-full bg-[var(--px-accent)]"
                  style={{ width: `${completenessScore}%` }}
                />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-[var(--px-muted)]">{completenessHint}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-16 border-t border-[var(--px-border)] pt-12 xl:grid-cols-12">
        <div className="space-y-12 xl:col-span-8">
          <section>
            <SectionLabel>Primary Information</SectionLabel>
            <div className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-2">
              <PrimaryInfoItem label="Direct Email" value={directEmail} />
              <PrimaryInfoItem label="Phone Terminal" value={phoneValue} mono />
              <PrimaryInfoItem label={affiliationLabel} value={affiliationValue} />
              <PrimaryInfoItem label="Availability / Location" value={availabilityValue} withStatusDot />
            </div>
          </section>

          <section>
            <SectionLabel>Areas of Expertise</SectionLabel>
            <div className="mt-6 flex flex-wrap gap-3">
              {profile.expertiseAreas.length > 0 ? (
                profile.expertiseAreas.map((area) => (
                  <span
                    key={area}
                    className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--px-text)]"
                  >
                    {area}
                  </span>
                ))
              ) : (
                <p className="text-sm text-[var(--px-muted)]">
                  No expertise areas added yet.{" "}
                  <Link href="/onboarding/profile?mode=edit" className="text-[var(--px-accent)]">
                    Edit profile
                  </Link>
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] p-8">
            <SectionLabel>{profile.isStudent ? "Internship Interest" : "Career"}</SectionLabel>

            {profile.isStudent ? (
              <div className="mt-6 space-y-5">
                <div className="border-l border-[var(--px-border)] pl-5">
                  <div className="text-lg font-semibold text-[var(--px-text)]">
                    {getDisplayValue(profile.internshipInterest)}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
                    {profile.sectorsOfInterest.length > 0
                      ? `Career interests: ${profile.sectorsOfInterest.join(", ")}`
                      : "No career interest sectors selected yet."}
                  </p>
                </div>

                {careerEntries.length > 0 ? (
                  <div className="space-y-5">
                    {careerEntries.map((entry, index) => {
                      const years = joinReadable([
                        entry.startYear ? String(entry.startYear) : null,
                        entry.endYear ? String(entry.endYear) : null,
                      ]);

                      return (
                        <div key={`${entry.organization}-${index}`} className="relative border-l border-[var(--px-border)] pl-6">
                          <span className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-[var(--px-accent)]" />
                          <div className="text-base font-semibold text-[var(--px-text)]">
                            {entry.role ?? entry.organization}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--px-muted)]">
                            {joinReadable([entry.organization, years])}
                          </div>
                          {entry.summary ? (
                            <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">{entry.summary}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : careerEntries.length > 0 ? (
              <div className="mt-6 space-y-6">
                {careerEntries.map((entry, index) => {
                  const start = entry.startYear ? String(entry.startYear) : null;
                  const end = entry.endYear ? String(entry.endYear) : "Present";

                  return (
                    <div key={`${entry.organization}-${index}`} className="relative border-l border-[var(--px-border)] pl-6">
                      <span
                        className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ${
                          index === 0 ? "bg-[var(--px-accent)]" : "bg-[var(--px-border)]"
                        }`}
                      />
                      <div className="text-base font-semibold leading-tight text-[var(--px-text)]">
                        {entry.role ?? entry.organization}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--px-muted)]">
                        {joinReadable([entry.organization, start && end ? `${start} — ${end}` : null])}
                      </div>
                      {entry.summary ? (
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--px-muted)]">
                          {entry.summary}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-6 text-sm text-[var(--px-muted)]">
                No career history added yet. Edit your profile to add your current role or previous experience.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-12 xl:col-span-4">
          <section className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-8">
            <SectionLabel>Sectors of Interest</SectionLabel>
            <div className="mt-6">
              {profile.sectorsOfInterest.length > 0 ? (
                <ul className="space-y-0">
                  {profile.sectorsOfInterest.map((sector, index) => (
                    <li key={sector} className={index > 0 ? "border-t border-[var(--px-border)]" : ""}>
                      <div className="group flex items-center justify-between py-4 text-sm text-[var(--px-text)]">
                        <span>{sector}</span>
                        <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--px-muted)]">No sectors selected yet.</p>
              )}
            </div>
          </section>

          <section>
            <SectionLabel>Education</SectionLabel>
            <div className="mt-6 space-y-0">
              {educationEntries.length > 0 ? (
                educationEntries.map((entry, index) => {
                  const years = entry.graduationYear ? String(entry.graduationYear) : null;
                  const summary = joinReadable([entry.degree, entry.studyFocus]);

                  return (
                    <div
                      key={`${entry.institution}-${index}`}
                      className={`flex items-start gap-4 py-5 ${index > 0 ? "border-t border-[var(--px-border)]" : ""}`}
                    >
                      <div className="pt-1 text-[var(--px-muted)]">
                        <School className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <h3 className="text-lg font-semibold text-[var(--px-text)]">{entry.institution}</h3>
                          {years ? (
                            <span className="font-mono text-xs uppercase tracking-[0.1em] text-[var(--px-muted)]">
                              {years}
                            </span>
                          ) : null}
                        </div>
                        {summary ? (
                          <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">{summary}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-[var(--px-muted)]">No education added yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <footer className="mt-16 border-t border-[var(--px-border)] pt-12">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div>
            <div className="text-lg font-medium tracking-[-0.03em] text-[var(--px-text)]">
              Fjord Insight
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--px-muted)]">
              {"\u00A9"} 2024 Fjord Insight. All rights reserved.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--px-muted)]">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Help Center</span>
            <span>API Documentation</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
