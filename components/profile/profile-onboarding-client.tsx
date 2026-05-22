"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  ChevronDown,
  Link2,
  Pencil,
  School,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_EXPERTISE_PRESETS,
  PROFILE_TOTAL_STEPS,
  calculateProfileCompleteness,
  getProfileDisplayName,
  getProfileHeadline,
  getProfileInitials,
  type ProfileCompanySearchResult,
  type ProfileEducationEntry,
  type UserProfileState,
} from "@/lib/user-profile";

type OnboardingMode = "create" | "edit";

type OnboardingClientProps = {
  email: string;
  initialMatchedCompany: ProfileCompanySearchResult | null;
  initialProfile: UserProfileState;
  initialStep: number;
  mode: OnboardingMode;
  sessionFallbackImage: string | null;
  sessionFallbackName: string | null;
};

type EducationDraft = {
  institution: string;
  degree: string;
  graduationYear: string;
  studyFocus: string;
};

const emptyEducationDraft: EducationDraft = {
  institution: "",
  degree: "",
  graduationYear: "",
  studyFocus: "",
};

const AFFILIATION_SECTOR_OPTIONS = [
  "Financial Services & Asset Management",
  "Technology & Software",
  "Renewable Energy & Infrastructure",
  "Industrials & Manufacturing",
  "Maritime & Logistics",
  "Public Policy & Research",
] as const;

function StepLabel({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-[var(--px-muted)]">
      <span>Step {step} of 5</span>
      <div className="h-1 w-32 overflow-hidden rounded-full bg-[var(--px-border)]/70">
        <div
          className="h-full rounded-full bg-[var(--px-text)] transition-all"
          style={{ width: `${(step / PROFILE_TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

function SurfaceCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function getMonogram(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) {
    return "FI";
  }

  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="data-label mb-2 block text-[11px] uppercase text-[var(--px-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border-b border-[var(--px-border)] bg-transparent px-0 py-3 text-sm text-[var(--px-text)] outline-none transition-colors placeholder:text-[var(--px-muted)] focus:border-[var(--px-text)] ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border-b border-[var(--px-border)] bg-transparent px-0 py-3 text-sm leading-6 text-[var(--px-text)] outline-none transition-colors placeholder:text-[var(--px-muted)] focus:border-[var(--px-text)] ${props.className ?? ""}`}
    />
  );
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-full border border-[var(--px-border)] px-5 py-3 text-sm font-semibold text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)] disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ""}`}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-full bg-[var(--px-text)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60 ${props.className ?? ""}`}
    />
  );
}

function TagButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)]"
          : "border-[var(--px-border)] bg-[var(--px-surface)] text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
      }`}
    >
      {children}
    </button>
  );
}

export function ProfileOnboardingClient({
  email,
  initialMatchedCompany,
  initialProfile,
  initialStep,
  mode,
  sessionFallbackImage,
  sessionFallbackName,
}: OnboardingClientProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfileState>(initialProfile);
  const [matchedCompany, setMatchedCompany] = useState<ProfileCompanySearchResult | null>(
    initialMatchedCompany,
  );
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [companyQuery, setCompanyQuery] = useState(
    initialMatchedCompany?.name ?? initialProfile.employerName ?? "",
  );
  const [companyResults, setCompanyResults] = useState<ProfileCompanySearchResult[]>([]);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [educationDraft, setEducationDraft] = useState<EducationDraft>(emptyEducationDraft);
  const [customExpertise, setCustomExpertise] = useState("");

  const displayName = getProfileDisplayName({
    profileDisplayName: profile.displayName,
    name: sessionFallbackName,
    email,
  });
  const initials = getProfileInitials({
    profileDisplayName: profile.displayName,
    name: sessionFallbackName,
    email,
  });
  const previewHeadline = getProfileHeadline(profile);
  const completeness = useMemo(() => calculateProfileCompleteness(profile), [profile]);
  const isStepOne = step === 1;

  useEffect(() => {
    if (profile.isStudent || companyQuery.trim().length < 2) {
      setCompanyResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/profile/company-search?q=${encodeURIComponent(companyQuery.trim())}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          results?: ProfileCompanySearchResult[];
        };

        setCompanyResults(data.results ?? []);
        setCompanySearchOpen(true);
      } catch {
        // Search is non-blocking during onboarding.
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [companyQuery, profile.isStudent]);

  function patchProfile(partial: Partial<UserProfileState>) {
    setProfile((current) => ({
      ...current,
      ...partial,
    }));
  }

  function toggleExpertise(value: string) {
    patchProfile({
      expertiseAreas: profile.expertiseAreas.includes(value)
        ? profile.expertiseAreas.filter((item) => item !== value)
        : [...profile.expertiseAreas, value],
    });
  }

  function addCustomExpertise() {
    const value = customExpertise.trim();
    if (!value) {
      return;
    }

    if (!profile.expertiseAreas.includes(value)) {
      patchProfile({
        expertiseAreas: [...profile.expertiseAreas, value],
      });
    }

    setCustomExpertise("");
  }

  function buildEducationEntryFromDraft(): ProfileEducationEntry | null {
    const institution = educationDraft.institution.trim();
    if (!institution) {
      return null;
    }

    return {
      institution,
      degree: educationDraft.degree.trim() || null,
      graduationYear: educationDraft.graduationYear
        ? Number(educationDraft.graduationYear)
        : null,
      studyFocus: educationDraft.studyFocus.trim() || null,
    };
  }

  function addEducationEntry() {
    const nextEntry = buildEducationEntryFromDraft();
    if (!nextEntry) {
      return;
    }

    patchProfile({
      education: [...profile.education, nextEntry],
    });
    setEducationDraft(emptyEducationDraft);
  }

  async function persistProfile(
    payload: Record<string, unknown>,
    onSuccess: (result: { profile: UserProfileState; matchedCompany: ProfileCompanySearchResult | null }) => void,
  ) {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as
        | { error?: string }
        | { profile: UserProfileState; matchedCompany: ProfileCompanySearchResult | null };

      if (!response.ok || !("profile" in data)) {
        setError(("error" in data ? data.error : undefined) ?? "Kunne ikke lagre profilen akkurat nÃ¥.");
        return;
      }

      setProfile(data.profile);
      setMatchedCompany(data.matchedCompany ?? matchedCompany);
      onSuccess(data);
    } catch {
      setError("Kunne ikke lagre profilen akkurat nÃ¥.");
    } finally {
      setIsSaving(false);
    }
  }

  function buildSavePayload(extra: Record<string, unknown> = {}) {
    return {
      ...profile,
      workEmail: profile.workEmail ?? email,
      profileCompletenessScore: completeness,
      onboardingStep: step,
      ...extra,
    };
  }

  function handleContinue() {
    const nextStep = Math.min(PROFILE_TOTAL_STEPS, step + 1);
    const draftEducationEntry = step === 3 ? buildEducationEntryFromDraft() : null;
    const nextEducation =
      draftEducationEntry && !profile.education.some((entry) => entry.institution === draftEducationEntry.institution)
        ? [...profile.education, draftEducationEntry]
        : profile.education;

    if (draftEducationEntry && nextEducation !== profile.education) {
      patchProfile({ education: nextEducation });
      setEducationDraft(emptyEducationDraft);
    }

    startTransition(() => {
      void persistProfile(buildSavePayload({ onboardingStep: nextStep, education: nextEducation }), () => {
        setStep(nextStep);
      });
    });
  }

  function handleBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function handleSkip() {
    startTransition(() => {
      void persistProfile(buildSavePayload({ skipOnboarding: true }), () => {
        router.push("/dashboard");
        router.refresh();
      });
    });
  }

  function handleConfirm() {
    startTransition(() => {
      void persistProfile(
        buildSavePayload({
          onboardingCompleted: true,
          onboardingStep: PROFILE_TOTAL_STEPS,
        }),
        () => {
          router.push("/profile");
          router.refresh();
        },
      );
    });
  }

  function handleCloseOnboarding() {
    router.push(mode === "edit" ? "/profile" : "/dashboard");
    router.refresh();
  }

  function selectCompany(company: ProfileCompanySearchResult) {
    setMatchedCompany(company);
    setCompanyQuery(company.name);
    setCompanySearchOpen(false);
    patchProfile({
      employerMatchedCompanyId: company.id,
      employerName: company.name,
      employerOrgNumber: company.orgNumber,
      employerSector: company.sector,
      employerLogoUrl: company.logoUrl,
    });
  }

  function useManualCompanyEntry() {
    setMatchedCompany(null);
    setCompanySearchOpen(false);
    patchProfile({
      employerMatchedCompanyId: null,
      employerName: companyQuery.trim() || profile.employerName,
      employerOrgNumber: null,
      employerLogoUrl: null,
    });
  }

  function renderStepTwo() {
    const sectorOptions = Array.from(
      new Set(
        [
          profile.employerSector,
          matchedCompany?.sector,
          ...AFFILIATION_SECTOR_OPTIONS,
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    return (
      <section className="min-h-[calc(100vh-160px)] py-16">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 flex flex-col justify-center md:col-span-5">
            <span className="mb-4 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--px-accent)]">
              Onboarding Journey
            </span>
            <h1 className="editorial-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--px-text)] sm:text-5xl">
              Professional Affiliation
            </h1>
            <p className="mb-12 mt-6 max-w-[420px] text-base leading-7 text-[var(--px-muted)] sm:text-lg sm:leading-8">
              We tailor your data narrative based on your professional ecosystem. Connect with
              peers and access sector-specific benchmarks by detailing your current role.
            </p>

            <div className="space-y-8">
              <div className="flex items-start gap-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--px-accent)]" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--px-text)]">
                    Verified Network
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
                    Access exclusive institutional datasets upon affiliation verification.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <TrendingUp className="mt-0.5 h-5 w-5 text-[var(--px-accent)]" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--px-text)]">
                    Sector Benchmarking
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--px-muted)]">
                    Compare your performance against anonymized industry leaders.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-12 md:col-span-6 md:col-start-8">
            <div className="space-y-10">
              <div className="flex items-center justify-between rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] px-6 py-4">
                <div className="flex items-center gap-4">
                  <School className="h-5 w-5 text-[var(--px-muted)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--px-text)]">I am a student</p>
                    <p className="mt-1 text-xs text-[var(--px-muted)]">
                      Switch to academic affiliation mode
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile.isStudent}
                  onClick={() => patchProfile({ isStudent: !profile.isStudent })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    profile.isStudent ? "bg-[var(--px-accent)]" : "bg-[var(--px-border)]"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      profile.isStudent ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {!profile.isStudent ? (
                <>
                  <Field label="Current Job Title">
                    <TextInput
                      value={profile.jobTitle ?? ""}
                      onChange={(event) => patchProfile({ jobTitle: event.target.value })}
                      placeholder="e.g. Senior Portfolio Manager"
                      className="py-3 text-base sm:text-lg"
                    />
                  </Field>

                  <Field label="Company / Institution">
                    <div className="space-y-4">
                      <div className="group">
                        <div className="flex items-center gap-4 border-b border-[var(--px-border)] pb-3 transition-colors focus-within:border-[var(--px-text)]">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--px-muted)]">
                            {matchedCompany ? getMonogram(matchedCompany.name) : getMonogram(companyQuery)}
                          </div>
                          <TextInput
                            value={companyQuery}
                            onChange={(event) => {
                              setCompanyQuery(event.target.value);
                              patchProfile({
                                employerName: event.target.value,
                                employerMatchedCompanyId: null,
                              });
                            }}
                            placeholder="Search for your company"
                            className="border-0 py-0 text-base sm:text-lg"
                          />
                          {matchedCompany ? (
                            <BadgeCheck className="h-5 w-5 shrink-0 text-[var(--px-accent)]" />
                          ) : null}
                        </div>
                      </div>

                      {matchedCompany ? (
                        <div className="rounded-xl border border-[var(--px-border)] bg-white p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--px-text)] text-white">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium text-[var(--px-text)]">{matchedCompany.name}</p>
                                <p className="text-xs text-[var(--px-muted)]">
                                  {[matchedCompany.location, matchedCompany.orgNumber, matchedCompany.sector]
                                    .filter(Boolean)
                                    .join(" | ")}
                                </p>
                              </div>
                            </div>
                            <span className="rounded-full bg-[var(--px-accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--px-accent)]">
                              Current Selection
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {companySearchOpen && companyResults.length > 0 ? (
                        <div className="rounded-xl border border-[var(--px-border)] bg-white shadow-sm">
                          {companyResults.map((company) => (
                            <button
                              key={company.id}
                              type="button"
                              onClick={() => selectCompany(company)}
                              className="flex w-full items-start justify-between gap-4 border-b border-[var(--px-border)]/60 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-[var(--px-subtle)]"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--px-border)] bg-[var(--px-subtle)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--px-muted)]">
                                  {getMonogram(company.name)}
                                </div>
                                <div>
                                  <div className="font-medium text-[var(--px-text)]">{company.name}</div>
                                  <div className="mt-1 text-sm text-[var(--px-muted)]">
                                    {[company.location, company.orgNumber, company.sector]
                                      .filter(Boolean)
                                      .join(" | ")}
                                  </div>
                                </div>
                              </div>
                              <span className="text-xs font-medium text-[var(--px-accent)]">Select</span>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <SecondaryButton
                        type="button"
                        onClick={useManualCompanyEntry}
                        className="rounded-xl px-4 py-3 text-[11px] uppercase tracking-[0.12em]"
                      >
                        Enter manually
                      </SecondaryButton>
                    </div>
                  </Field>

                  <Field label="Industry Sector">
                    <div className="relative border-b border-[var(--px-border)]">
                      <select
                        value={profile.employerSector ?? ""}
                        onChange={(event) => patchProfile({ employerSector: event.target.value })}
                        className="w-full appearance-none bg-transparent py-3 pr-8 text-base text-[var(--px-text)] outline-none sm:text-lg"
                      >
                        <option value="">Select sector</option>
                        {sectorOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--px-muted)]" />
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Degree / Program">
                    <TextInput
                      value={profile.degree ?? ""}
                      onChange={(event) => patchProfile({ degree: event.target.value })}
                      placeholder="e.g. MSc in Finance"
                      className="py-3 text-base sm:text-lg"
                    />
                  </Field>

                  <Field label="University / School">
                    <TextInput
                      value={profile.universityName ?? ""}
                      onChange={(event) => patchProfile({ universityName: event.target.value })}
                      placeholder="University or school"
                      className="py-3 text-base sm:text-lg"
                    />
                  </Field>

                  <div className="grid gap-6 md:grid-cols-2">
                    <Field label="Expected graduation year">
                      <TextInput
                        value={profile.graduationYear?.toString() ?? ""}
                        onChange={(event) =>
                          patchProfile({
                            graduationYear: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                        placeholder="2028"
                        className="py-3 text-base sm:text-lg"
                      />
                    </Field>

                    <Field label="Study focus">
                      <TextInput
                        value={profile.studyFocus ?? ""}
                        onChange={(event) => patchProfile({ studyFocus: event.target.value })}
                        placeholder="e.g. quantitative finance"
                        className="py-3 text-base sm:text-lg"
                      />
                    </Field>
                  </div>

                  <Field label="Internship interest">
                    <TextInput
                      value={profile.internshipInterest ?? ""}
                      onChange={(event) => patchProfile({ internshipInterest: event.target.value })}
                      placeholder="e.g. summer internships in renewables"
                      className="py-3 text-base sm:text-lg"
                    />
                  </Field>

                  <Field label="Preferred Sector / Career Interest">
                    <TextInput
                      value={profile.sectorsOfInterest.join(", ")}
                      onChange={(event) =>
                        patchProfile({
                          sectorsOfInterest: event.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Preferred sectors or career interests"
                      className="py-3 text-base sm:text-lg"
                    />
                  </Field>
                </>
              )}

              <div className="flex flex-col gap-5 pt-8 md:flex-row md:items-center md:justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--px-muted)] transition-colors hover:text-[var(--px-text)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to personal info
                </button>

                <PrimaryButton
                  type="button"
                  onClick={handleContinue}
                  disabled={isSaving}
                  className="w-full rounded-xl px-10 py-4 text-[11px] uppercase tracking-[0.12em] md:w-auto"
                >
                  Confirm & Continue
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--px-bg)] text-[var(--px-text)]">
      <header
        className={
          step === 2
            ? "sticky top-0 z-40 w-full border-b border-[var(--px-border)] bg-[var(--px-surface)]"
            : isStepOne
              ? "w-full bg-[var(--px-bg)]"
              : "border-b border-[var(--px-border)] bg-[var(--px-surface)]"
        }
      >
        <div
          className={`mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 ${
            step === 2 ? "py-4" : isStepOne ? "py-6" : "py-5"
          }`}
        >
          <div className="text-lg font-semibold tracking-[-0.03em]">Fjord Insight</div>
          {step === 2 ? (
            <div className="flex items-center gap-6">
              <StepLabel step={step} />
              <button
                type="button"
                onClick={handleCloseOnboarding}
                aria-label="Close onboarding"
                className="rounded-full p-2 text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <StepLabel step={step} />
          )}
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-[1180px] flex-1 px-6 ${
          isStepOne ? "flex items-center justify-center py-16" : "py-12"
        }`}
      >
        {step === 1 ? (
          <section className="mx-auto w-full max-w-[560px]">
            <div className="mb-12 text-center md:text-left">
              <h1 className="editorial-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--px-text)] sm:text-5xl">
                Establish your profile identity
              </h1>
              <p className="mt-4 text-base leading-7 text-[var(--px-muted)] sm:text-lg sm:leading-8">
                Velkommen inn i Fjord Insight. Start med hvordan du Ã¸nsker Ã¥ fremstÃ¥ i det
                analytiske Ã¸kosystemet vÃ¥rt.
              </p>
            </div>

            <div className="space-y-8">
              <div className="border-t border-[var(--px-border)] pt-8">
                <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row md:items-center">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-[var(--px-border)] bg-[var(--px-accent-soft)] text-2xl font-semibold text-[var(--px-text)]">
                        {profile.profileImageUrl || sessionFallbackImage ? (
                          <span
                            role="img"
                            aria-label={displayName}
                            className="h-full w-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url("${profile.profileImageUrl ?? sessionFallbackImage}")`,
                            }}
                          />
                        ) : (
                          initials
                        )}
                      </div>
                      <button
                        type="button"
                        disabled
                        title="Egen bildeopplasting kommer i en senere iterasjon."
                        aria-label="Edit profile picture"
                        className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--px-text)] text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[24px] font-medium leading-8 text-[var(--px-text)]">
                        Profile Picture
                      </div>
                      <p className="max-w-[210px] text-sm leading-6 text-[var(--px-muted)]">
                        Upload a professional headshot
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    title={
                      profile.linkedinConnected
                        ? "LinkedIn-bildet og profildataene dine er allerede koblet."
                        : "LinkedIn-import aktiveres nÃ¥r kontoen din er koblet til LinkedIn."
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--px-border)] px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Link2 className="h-4 w-4" />
                    <span>Import from LinkedIn</span>
                  </button>
                </div>

                <div className="space-y-8">
                  <Field label="Full Name">
                    <TextInput
                      value={profile.displayName ?? ""}
                      onChange={(event) => patchProfile({ displayName: event.target.value })}
                      placeholder="e.g. Erik Nordquist"
                      className="py-2 text-base placeholder:text-[var(--px-muted)] sm:text-lg"
                    />
                  </Field>

                  <Field label="Professional Bio">
                    <TextArea
                      value={profile.professionalBio ?? ""}
                      onChange={(event) =>
                        patchProfile({ professionalBio: event.target.value.slice(0, PROFILE_BIO_MAX_LENGTH) })
                      }
                      rows={3}
                      placeholder="Briefly describe your analytical focus or investment philosophy..."
                      className="resize-none py-2 text-base placeholder:text-[var(--px-muted)]"
                    />
                    <div className="mt-2 text-right text-[10px] uppercase tracking-[0.12em] text-[var(--px-muted)]">
                      {(profile.professionalBio ?? "").length} / {PROFILE_BIO_MAX_LENGTH} Characters
                    </div>
                  </Field>
                </div>
              </div>

              <div className="border-t border-[var(--px-border)] pt-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <PrimaryButton
                    type="button"
                    onClick={handleContinue}
                    disabled={isSaving}
                    className="w-full rounded-xl px-10 py-4 text-[11px] uppercase tracking-[0.12em] md:w-auto"
                  >
                    Continue to Professional Affiliation
                  </PrimaryButton>

                  {mode === "create" ? (
                    <SecondaryButton
                      type="button"
                      onClick={handleSkip}
                      disabled={isSaving}
                      className="w-full rounded-xl px-10 py-4 text-[11px] uppercase tracking-[0.12em] text-[var(--px-muted)] md:w-auto"
                    >
                      Skip for now
                    </SecondaryButton>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? renderStepTwo() : null}

        {step === 3 ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr),360px]">
            <SurfaceCard className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-semibold tracking-[-0.04em]">Utdanning &amp; Ekspertise</h1>
                <p className="text-base leading-7 text-[var(--px-muted)]">
                  Legg til utdanning og faglige spesialiseringer slik at profilen blir mer
                  relevant i analyseflaten.
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-[minmax(0,1fr),180px]">
                  <Field label="University / Institution">
                    <TextInput
                      value={educationDraft.institution}
                      onChange={(event) =>
                        setEducationDraft((current) => ({ ...current, institution: event.target.value }))
                      }
                      placeholder="f.eks. Universitetet i Oslo"
                    />
                  </Field>

                  <Field label="Graduation year">
                    <TextInput
                      value={educationDraft.graduationYear}
                      onChange={(event) =>
                        setEducationDraft((current) => ({
                          ...current,
                          graduationYear: event.target.value,
                        }))
                      }
                      placeholder="2024"
                    />
                  </Field>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <Field label="Degree">
                    <TextInput
                      value={educationDraft.degree}
                      onChange={(event) =>
                        setEducationDraft((current) => ({ ...current, degree: event.target.value }))
                      }
                      placeholder="f.eks. MSc in Finance"
                    />
                  </Field>
                  <Field label="Study focus">
                    <TextInput
                      value={educationDraft.studyFocus}
                      onChange={(event) =>
                        setEducationDraft((current) => ({ ...current, studyFocus: event.target.value }))
                      }
                      placeholder="Faglig fokus"
                    />
                  </Field>
                </div>

                <SecondaryButton type="button" onClick={addEducationEntry}>
                  Legg til utdanning
                </SecondaryButton>

                {profile.education.length > 0 ? (
                  <div className="space-y-3">
                    {profile.education.map((entry, index) => (
                      <div
                        key={`${entry.institution}-${index}`}
                        className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-4"
                      >
                        <div className="font-semibold">{entry.institution}</div>
                        <div className="mt-1 text-sm text-[var(--px-muted)]">
                          {[entry.degree, entry.studyFocus, entry.graduationYear?.toString()]
                            .filter(Boolean)
                            .join(" Â· ")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">
                  FagomrÃ¥der &amp; Ekspertise
                </div>
                <div className="flex flex-wrap gap-3">
                  {PROFILE_EXPERTISE_PRESETS.map((option) => (
                    <TagButton
                      key={option}
                      active={profile.expertiseAreas.includes(option)}
                      onClick={() => toggleExpertise(option)}
                    >
                      {option}
                    </TagButton>
                  ))}
                </div>

                {profile.expertiseAreas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.expertiseAreas.map((area) => (
                      <span
                        key={area}
                        className="rounded-full bg-[var(--px-accent-soft)] px-3 py-2 text-xs text-[var(--px-accent)]"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <TextInput
                    value={customExpertise}
                    onChange={(event) => setCustomExpertise(event.target.value)}
                    placeholder="SÃ¸k eller legg til annet felt..."
                  />
                  <SecondaryButton type="button" onClick={addCustomExpertise}>
                    Legg til
                  </SecondaryButton>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard className="bg-[rgba(255,255,255,0.9)]">
              <div className="flex h-full min-h-[420px] flex-col justify-between rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-6">
                <div>
                  <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">
                    Profilsignal
                  </div>
                  <div className="mt-4 text-2xl font-semibold">{completeness}% complete</div>
                  <p className="mt-3 text-sm leading-6 text-[var(--px-muted)]">
                    Kompetansefelt, utdanning og sektorpreferanser gjÃ¸r anbefalinger og
                    analysearbeidsflater mer presise.
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
                  <div className="text-sm font-semibold">Current expertise footprint</div>
                  <div className="mt-3 text-sm text-[var(--px-muted)]">
                    {profile.expertiseAreas.length > 0
                      ? profile.expertiseAreas.join(", ")
                      : "Ingen ekspertiseomrÃ¥der lagt til ennÃ¥."}
                  </div>
                </div>
              </div>
            </SurfaceCard>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr),460px]">
            <SurfaceCard className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl font-semibold tracking-[-0.04em]">Kontakt &amp; Sted</h1>
                <p className="text-base leading-7 text-[var(--px-muted)]">
                  Kontakt- og stedsinformasjon brukes privat for Ã¥ personalisere arbeidsflaten din.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Work Email">
                  <TextInput
                    value={profile.workEmail ?? email}
                    onChange={(event) => patchProfile({ workEmail: event.target.value })}
                    placeholder="name@company.com"
                  />
                </Field>
                <Field label="Phone Number">
                  <TextInput
                    value={profile.phoneNumber ?? ""}
                    onChange={(event) => patchProfile({ phoneNumber: event.target.value })}
                    placeholder="+47 000 00 000"
                  />
                </Field>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Country of Origin">
                  <TextInput
                    value={profile.countryOfOrigin ?? ""}
                    onChange={(event) => patchProfile({ countryOfOrigin: event.target.value })}
                    placeholder="Velg land"
                  />
                </Field>
                <Field label="Country of Work">
                  <TextInput
                    value={profile.countryOfWork ?? ""}
                    onChange={(event) => patchProfile({ countryOfWork: event.target.value })}
                    placeholder="Velg land"
                  />
                </Field>
              </div>

              <Field label="Current Location">
                <TextInput
                  value={profile.currentLocation ?? ""}
                  onChange={(event) => patchProfile({ currentLocation: event.target.value })}
                  placeholder="f.eks. Oslo, Norway"
                />
              </Field>
            </SurfaceCard>

            <SurfaceCard>
              <div className="overflow-hidden rounded-xl border border-[var(--px-border)] bg-[var(--px-panel)]">
                <div className="h-72 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6 text-white">
                  <div className="data-label text-[11px] uppercase text-white/70">Selected region</div>
                  <div className="mt-32 text-3xl font-semibold">
                    {profile.currentLocation || profile.countryOfWork || "Norge"}
                  </div>
                </div>
                <div className="border-t border-white/10 bg-[var(--px-surface)] px-6 py-5">
                  <p className="text-sm leading-6 text-[var(--px-muted)]">
                    Regionkortet er en lettvektsplaceholder i denne PR-en. Tung kartintegrasjon er
                    bevisst utsatt til det finnes et etablert behov og datagrunnlag.
                  </p>
                </div>
              </div>
            </SurfaceCard>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="mx-auto max-w-[960px] space-y-6">
            <div className="space-y-4">
              <h1 className="text-5xl font-semibold tracking-[-0.04em]">ForhÃ¥ndsvisning av profil</h1>
              <p className="text-base leading-7 text-[var(--px-muted)]">
                GÃ¥ gjennom opplysningene fÃ¸r du lagrer den private Fjord Insight-profilen din.
              </p>
            </div>

            <SurfaceCard className="space-y-8">
              <section className="grid gap-6 border-b border-[var(--px-border-subtle)] pb-6 md:grid-cols-[180px,minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">Identity</div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-sm text-[var(--px-accent)]"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[var(--px-accent-soft)] text-xl font-semibold">
                    {profile.profileImageUrl || sessionFallbackImage ? (
                      <span
                        role="img"
                        aria-label={displayName}
                        className="h-full w-full bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${profile.profileImageUrl ?? sessionFallbackImage}")`,
                        }}
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{displayName}</div>
                    <div className="mt-2 text-sm text-[var(--px-muted)]">{previewHeadline}</div>
                    <div className="mt-1 text-sm text-[var(--px-muted)]">
                      {profile.currentLocation ?? profile.countryOfWork ?? "Sted ikke lagt til"}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 border-b border-[var(--px-border-subtle)] pb-6 md:grid-cols-[180px,minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">
                    Professional affiliation
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-sm text-[var(--px-accent)]"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--px-muted)]">
                      Organization
                    </div>
                    <div className="mt-2 text-sm text-[var(--px-text)]">
                      {profile.isStudent
                        ? profile.universityName ?? "Ikke oppgitt"
                        : profile.employerName ?? "Ikke oppgitt"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--px-muted)]">
                      Role
                    </div>
                    <div className="mt-2 text-sm text-[var(--px-text)]">
                      {profile.isStudent
                        ? profile.degree ?? "Student"
                        : profile.jobTitle ?? "Ikke oppgitt"}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 border-b border-[var(--px-border-subtle)] pb-6 md:grid-cols-[180px,minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">Education</div>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-sm text-[var(--px-accent)]"
                  >
                    Edit
                  </button>
                </div>
                <div className="space-y-4">
                  {profile.education.length > 0 ? (
                    profile.education.map((entry, index) => (
                      <div key={`${entry.institution}-${index}`} className="rounded-xl border border-[var(--px-border)] p-4">
                        <div className="font-semibold">{entry.institution}</div>
                        <div className="mt-1 text-sm text-[var(--px-muted)]">
                          {[entry.degree, entry.studyFocus, entry.graduationYear?.toString()]
                            .filter(Boolean)
                            .join(" Â· ")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[var(--px-muted)]">Ingen utdanning lagt til ennÃ¥.</div>
                  )}
                </div>
              </section>

              <section className="grid gap-6 border-b border-[var(--px-border-subtle)] pb-6 md:grid-cols-[180px,minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">Expertise</div>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-sm text-[var(--px-accent)]"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.expertiseAreas.length > 0 ? (
                    profile.expertiseAreas.map((area) => (
                      <span
                        key={area}
                        className="rounded-full bg-[var(--px-accent-soft)] px-3 py-2 text-xs text-[var(--px-accent)]"
                      >
                        {area}
                      </span>
                    ))
                  ) : (
                    <div className="text-sm text-[var(--px-muted)]">Ingen ekspertise valgt ennÃ¥.</div>
                  )}
                </div>
              </section>

              <section className="grid gap-6 md:grid-cols-[180px,minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="data-label text-[11px] uppercase text-[var(--px-muted)]">Contact</div>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="text-sm text-[var(--px-accent)]"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--px-muted)]">
                      E-post
                    </div>
                    <div className="mt-2 text-sm">{profile.workEmail ?? email}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.14em] text-[var(--px-muted)]">
                      Telefon
                    </div>
                    <div className="mt-2 text-sm">{profile.phoneNumber ?? "Ikke oppgitt"}</div>
                  </div>
                </div>
              </section>
            </SurfaceCard>
          </div>
        ) : null}

        {error ? <p className="mt-6 text-sm text-rose-700">{error}</p> : null}

        {!isStepOne && step !== 2 ? (
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-[var(--px-muted)]">
              Profilen er {completeness}% komplett akkurat nÃ¥.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {step > 1 ? (
                <SecondaryButton type="button" onClick={handleBack} disabled={isSaving}>
                  Back
                </SecondaryButton>
              ) : null}

              {step < PROFILE_TOTAL_STEPS ? (
                <PrimaryButton type="button" onClick={handleContinue} disabled={isSaving}>
                  Confirm & Continue
                </PrimaryButton>
              ) : (
                <PrimaryButton type="button" onClick={handleConfirm} disabled={isSaving}>
                  Confirm & Continue
                </PrimaryButton>
              )}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-[var(--px-border)] bg-[var(--px-surface)]">
        {step === 2 ? (
          <>
            <div className="mx-auto flex max-w-[1180px] flex-col justify-between gap-6 px-6 py-12 md:flex-row md:items-center">
              <div className="flex flex-col gap-2">
                <span className="text-lg font-medium tracking-[-0.03em] text-[var(--px-text)]">
                  Fjord Insight
                </span>
                <p className="max-w-xs text-sm leading-6 text-[var(--px-muted)]">
                  Precision analytics for the modern institutional landscape.
                </p>
              </div>
              <div className="flex flex-wrap gap-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--px-muted)]">
                <span>Privacy Policy</span>
                <span>Terms of Service</span>
                <span>Help Center</span>
                <span>API Documentation</span>
              </div>
            </div>
            <div className="mx-auto max-w-[1180px] px-6 pb-12 text-[10px] uppercase tracking-[0.14em] text-[var(--px-muted)]">
              {"\u00A9"} 2024 Fjord Insight. All rights reserved.
            </div>
          </>
        ) : null}
        {step !== 2 ? (
          <div
            className={`mx-auto flex max-w-[1180px] flex-col justify-between gap-4 px-6 text-[10px] uppercase tracking-[0.14em] text-[var(--px-muted)] md:flex-row md:items-center ${
              isStepOne ? "py-8" : "py-5"
            }`}
          >
            <span>{"\u00A9"} 2024 Fjord Insight. All rights reserved.</span>
            <div className="flex flex-wrap gap-5">
              <span>Privacy Policy</span>
              <span>Terms of Service</span>
              <span>Help Center</span>
            </div>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
