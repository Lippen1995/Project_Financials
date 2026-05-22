import { z } from "zod";

export const PROFILE_TOTAL_STEPS = 5;
export const PROFILE_BIO_MAX_LENGTH = 240;

export const PROFILE_EXPERTISE_PRESETS = [
  "Renewable Energy",
  "FinTech",
  "Risk Modeling",
  "Data Analysis",
  "Maritime Logistics",
  "Climate Policy",
  "Venture Capital",
  "Arctic Ecology",
] as const;

export type ProfileEducationEntry = {
  institution: string;
  degree?: string | null;
  graduationYear?: number | null;
  studyFocus?: string | null;
};

export type ProfileCareerEntry = {
  organization: string;
  role?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  summary?: string | null;
};

export type ProfileCompanySearchResult = {
  id: string;
  slug: string;
  name: string;
  orgNumber: string;
  location: string | null;
  sector: string | null;
  logoUrl: string | null;
};

export type UserProfileState = {
  displayName: string | null;
  profileImageUrl: string | null;
  professionalBio: string | null;
  jobTitle: string | null;
  employerName: string | null;
  employerOrgNumber: string | null;
  employerLogoUrl: string | null;
  employerSector: string | null;
  employerMatchedCompanyId: string | null;
  isStudent: boolean;
  universityName: string | null;
  degree: string | null;
  studyFocus: string | null;
  graduationYear: number | null;
  internshipInterest: string | null;
  workEmail: string | null;
  phoneNumber: string | null;
  countryOfOrigin: string | null;
  countryOfWork: string | null;
  currentLocation: string | null;
  linkedinProfileUrl: string | null;
  linkedinConnected: boolean;
  linkedinProviderAccountId: string | null;
  profileCompletenessScore: number;
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  onboardingStep: number;
  expertiseAreas: string[];
  sectorsOfInterest: string[];
  education: ProfileEducationEntry[];
  careerHistory: ProfileCareerEntry[];
};

const educationEntrySchema = z.object({
  institution: z.string().trim().min(1).max(120),
  degree: z.string().trim().max(120).nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
  studyFocus: z.string().trim().max(120).nullable().optional(),
});

const careerEntrySchema = z.object({
  organization: z.string().trim().min(1).max(120),
  role: z.string().trim().max(120).nullable().optional(),
  startYear: z.number().int().min(1900).max(2100).nullable().optional(),
  endYear: z.number().int().min(1900).max(2100).nullable().optional(),
  summary: z.string().trim().max(300).nullable().optional(),
});

export const userProfilePatchSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  profileImageUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  professionalBio: z.string().trim().max(PROFILE_BIO_MAX_LENGTH).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  employerName: z.string().trim().max(160).nullable().optional(),
  employerOrgNumber: z.string().trim().max(32).nullable().optional(),
  employerLogoUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  employerSector: z.string().trim().max(120).nullable().optional(),
  employerMatchedCompanyId: z.string().trim().nullable().optional(),
  isStudent: z.boolean().optional(),
  universityName: z.string().trim().max(160).nullable().optional(),
  degree: z.string().trim().max(160).nullable().optional(),
  studyFocus: z.string().trim().max(160).nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
  internshipInterest: z.string().trim().max(160).nullable().optional(),
  workEmail: z.string().trim().email().nullable().optional().or(z.literal("")),
  phoneNumber: z.string().trim().max(40).nullable().optional(),
  countryOfOrigin: z.string().trim().max(120).nullable().optional(),
  countryOfWork: z.string().trim().max(120).nullable().optional(),
  currentLocation: z.string().trim().max(120).nullable().optional(),
  linkedinProfileUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  onboardingCompleted: z.boolean().optional(),
  skipOnboarding: z.boolean().optional(),
  onboardingStep: z.number().int().min(1).max(PROFILE_TOTAL_STEPS).optional(),
  expertiseAreas: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  sectorsOfInterest: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  education: z.array(educationEntrySchema).max(12).optional(),
  careerHistory: z.array(careerEntrySchema).max(20).optional(),
});

export type UserProfilePatchInput = z.infer<typeof userProfilePatchSchema>;

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export function normalizeEducationEntries(value: unknown): ProfileEducationEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => educationEntrySchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => ({
      institution: result.data.institution,
      degree: normalizeNullableString(result.data.degree),
      graduationYear: result.data.graduationYear ?? null,
      studyFocus: normalizeNullableString(result.data.studyFocus),
    }));
}

export function normalizeCareerEntries(value: unknown): ProfileCareerEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => careerEntrySchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => ({
      organization: result.data.organization,
      role: normalizeNullableString(result.data.role),
      startYear: result.data.startYear ?? null,
      endYear: result.data.endYear ?? null,
      summary: normalizeNullableString(result.data.summary),
    }));
}

function hasValue(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (hasValue(value)) {
      return value!.trim();
    }
  }

  return null;
}

function hasEducationProfile(profile: {
  education?: ProfileEducationEntry[];
  universityName?: string | null;
  degree?: string | null;
  graduationYear?: number | null;
}) {
  return (
    (profile.education?.length ?? 0) > 0 ||
    hasValue(profile.universityName) ||
    hasValue(profile.degree) ||
    typeof profile.graduationYear === "number"
  );
}

export function calculateProfileCompleteness(profile: {
  displayName?: string | null;
  profileImageUrl?: string | null;
  professionalBio?: string | null;
  jobTitle?: string | null;
  employerName?: string | null;
  employerSector?: string | null;
  isStudent?: boolean;
  universityName?: string | null;
  degree?: string | null;
  studyFocus?: string | null;
  graduationYear?: number | null;
  internshipInterest?: string | null;
  workEmail?: string | null;
  countryOfWork?: string | null;
  education?: ProfileEducationEntry[];
  expertiseAreas?: string[];
  sectorsOfInterest?: string[];
}) {
  const isStudent = Boolean(profile.isStudent);
  const checks = [
    hasValue(profile.displayName),
    hasValue(profile.profileImageUrl),
    hasValue(profile.professionalBio),
    isStudent ? hasValue(profile.degree) || hasValue(profile.studyFocus) : hasValue(profile.jobTitle),
    isStudent ? hasValue(profile.universityName) : hasValue(profile.employerName),
    isStudent
      ? hasValue(profile.studyFocus) || (profile.sectorsOfInterest?.length ?? 0) > 0
      : hasValue(profile.employerSector) || (profile.sectorsOfInterest?.length ?? 0) > 0,
    hasValue(profile.workEmail),
    hasValue(profile.countryOfWork),
    hasEducationProfile(profile),
    (profile.expertiseAreas?.length ?? 0) > 0,
    (profile.sectorsOfInterest?.length ?? 0) > 0 || hasValue(profile.internshipInterest),
  ];

  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

export function getProfileDisplayName(input: {
  profileDisplayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const explicit = input.profileDisplayName?.trim() || input.name?.trim();
  if (explicit) {
    return explicit;
  }

  const emailPrefix = input.email?.split("@")[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return "Bruker";
}

export function getProfileInitials(input: {
  profileDisplayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  const base = getProfileDisplayName(input);
  const parts = base
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  return (parts[0] ?? base).slice(0, 2).toUpperCase() || "?";
}

export function getProfileHeadline(profile: {
  isStudent?: boolean;
  jobTitle?: string | null;
  employerName?: string | null;
  universityName?: string | null;
  degree?: string | null;
}) {
  if (profile.isStudent) {
    if (hasValue(profile.degree) && hasValue(profile.universityName)) {
      return `${profile.degree} ved ${profile.universityName}`;
    }

    if (hasValue(profile.universityName)) {
      return `${profile.universityName}`;
    }

    return "Student i Fjord Insight";
  }

  if (hasValue(profile.jobTitle) && hasValue(profile.employerName)) {
    return `${profile.jobTitle} - ${profile.employerName}`;
  }

  if (hasValue(profile.jobTitle)) {
    return profile.jobTitle!.trim();
  }

  if (hasValue(profile.employerName)) {
    return profile.employerName!.trim();
  }

  return "Fjord Insight user";
}

export function getProfileAffiliationSubtitle(profile: {
  isStudent?: boolean;
  jobTitle?: string | null;
  employerSector?: string | null;
  employerName?: string | null;
  universityName?: string | null;
  degree?: string | null;
  studyFocus?: string | null;
}) {
  if (profile.isStudent) {
    const focus = firstNonEmpty(profile.degree, profile.studyFocus);
    const university = firstNonEmpty(profile.universityName);

    if (focus && university) {
      return `Student • ${focus} at ${university}`;
    }

    if (focus) {
      return `Student • ${focus}`;
    }

    if (university) {
      return `Student at ${university}`;
    }

    return "Fjord Insight user";
  }

  const roleAndSector = [firstNonEmpty(profile.jobTitle), firstNonEmpty(profile.employerSector)]
    .filter(Boolean)
    .join(" • ");
  const employer = firstNonEmpty(profile.employerName);

  if (roleAndSector && employer) {
    return `${roleAndSector} at ${employer}`;
  }

  if (roleAndSector) {
    return roleAndSector;
  }

  if (employer) {
    return employer;
  }

  return "Fjord Insight user";
}

export function getProfileCompletenessHint(profile: {
  profileCompletenessScore?: number | null;
  profileImageUrl?: string | null;
  professionalBio?: string | null;
  isStudent?: boolean;
  jobTitle?: string | null;
  employerName?: string | null;
  employerSector?: string | null;
  universityName?: string | null;
  degree?: string | null;
  studyFocus?: string | null;
  workEmail?: string | null;
  countryOfWork?: string | null;
  education?: ProfileEducationEntry[];
  expertiseAreas?: string[];
  sectorsOfInterest?: string[];
  internshipInterest?: string | null;
}) {
  const score = typeof profile.profileCompletenessScore === "number" ? profile.profileCompletenessScore : 0;
  if (score >= 100) {
    return "Your profile is complete.";
  }

  const isStudent = Boolean(profile.isStudent);
  const missingChecks = [
    { missing: !hasValue(profile.profileImageUrl), label: "a profile image" },
    { missing: !hasValue(profile.professionalBio), label: "a professional bio" },
    { missing: isStudent ? !hasValue(profile.degree) && !hasValue(profile.studyFocus) : !hasValue(profile.jobTitle), label: isStudent ? "your degree or study focus" : "your current job title" },
    { missing: isStudent ? !hasValue(profile.universityName) : !hasValue(profile.employerName), label: isStudent ? "your university" : "your company affiliation" },
    {
      missing: isStudent
        ? !hasValue(profile.studyFocus) && (profile.sectorsOfInterest?.length ?? 0) === 0
        : !hasValue(profile.employerSector) && (profile.sectorsOfInterest?.length ?? 0) === 0,
      label: isStudent ? "your preferred sectors" : "your industry sector",
    },
    { missing: !hasValue(profile.workEmail), label: "your work email" },
    { missing: !hasValue(profile.countryOfWork), label: "your work location" },
    {
      missing:
        (profile.education?.length ?? 0) === 0 &&
        !hasValue(profile.universityName) &&
        !hasValue(profile.degree),
      label: "your education history",
    },
    { missing: (profile.expertiseAreas?.length ?? 0) === 0, label: "your expertise areas" },
    {
      missing: (profile.sectorsOfInterest?.length ?? 0) === 0 && !hasValue(profile.internshipInterest),
      label: isStudent ? "your career interests" : "your sectors of interest",
    },
  ];

  const nextMissing = missingChecks.find((item) => item.missing)?.label;
  if (!nextMissing) {
    return "Complete your profile to improve personalization.";
  }

  return `Add ${nextMissing} to improve your profile.`;
}

export function getProfileLocationLabel(profile: {
  currentLocation?: string | null;
  countryOfWork?: string | null;
  countryOfOrigin?: string | null;
}) {
  if (hasValue(profile.currentLocation)) {
    return profile.currentLocation!.trim();
  }

  if (hasValue(profile.countryOfWork)) {
    return profile.countryOfWork!.trim();
  }

  if (hasValue(profile.countryOfOrigin)) {
    return profile.countryOfOrigin!.trim();
  }

  return null;
}

export function toSerializableUserProfile(
  profile: Record<string, unknown> | null | undefined,
): UserProfileState {
  const data = profile ?? {};
  const expertiseAreas = normalizeStringArray(data.expertiseAreas);
  const sectorsOfInterest = normalizeStringArray(data.sectorsOfInterest);
  const education = normalizeEducationEntries(data.education);
  const careerHistory = normalizeCareerEntries(data.careerHistory);

  return {
    displayName: normalizeNullableString(typeof data.displayName === "string" ? data.displayName : null),
    profileImageUrl: normalizeNullableString(
      typeof data.profileImageUrl === "string" ? data.profileImageUrl : null,
    ),
    professionalBio: normalizeNullableString(
      typeof data.professionalBio === "string" ? data.professionalBio : null,
    ),
    jobTitle: normalizeNullableString(typeof data.jobTitle === "string" ? data.jobTitle : null),
    employerName: normalizeNullableString(
      typeof data.employerName === "string" ? data.employerName : null,
    ),
    employerOrgNumber: normalizeNullableString(
      typeof data.employerOrgNumber === "string" ? data.employerOrgNumber : null,
    ),
    employerLogoUrl: normalizeNullableString(
      typeof data.employerLogoUrl === "string" ? data.employerLogoUrl : null,
    ),
    employerSector: normalizeNullableString(
      typeof data.employerSector === "string" ? data.employerSector : null,
    ),
    employerMatchedCompanyId: normalizeNullableString(
      typeof data.employerMatchedCompanyId === "string" ? data.employerMatchedCompanyId : null,
    ),
    isStudent: Boolean(data.isStudent),
    universityName: normalizeNullableString(
      typeof data.universityName === "string" ? data.universityName : null,
    ),
    degree: normalizeNullableString(typeof data.degree === "string" ? data.degree : null),
    studyFocus: normalizeNullableString(
      typeof data.studyFocus === "string" ? data.studyFocus : null,
    ),
    graduationYear: typeof data.graduationYear === "number" ? data.graduationYear : null,
    internshipInterest: normalizeNullableString(
      typeof data.internshipInterest === "string" ? data.internshipInterest : null,
    ),
    workEmail: normalizeNullableString(typeof data.workEmail === "string" ? data.workEmail : null),
    phoneNumber: normalizeNullableString(
      typeof data.phoneNumber === "string" ? data.phoneNumber : null,
    ),
    countryOfOrigin: normalizeNullableString(
      typeof data.countryOfOrigin === "string" ? data.countryOfOrigin : null,
    ),
    countryOfWork: normalizeNullableString(
      typeof data.countryOfWork === "string" ? data.countryOfWork : null,
    ),
    currentLocation: normalizeNullableString(
      typeof data.currentLocation === "string" ? data.currentLocation : null,
    ),
    linkedinProfileUrl: normalizeNullableString(
      typeof data.linkedinProfileUrl === "string" ? data.linkedinProfileUrl : null,
    ),
    linkedinConnected: Boolean(data.linkedinConnected),
    linkedinProviderAccountId: normalizeNullableString(
      typeof data.linkedinProviderAccountId === "string" ? data.linkedinProviderAccountId : null,
    ),
    profileCompletenessScore:
      typeof data.profileCompletenessScore === "number"
        ? data.profileCompletenessScore
        : calculateProfileCompleteness({
            ...data,
            education,
            expertiseAreas,
            sectorsOfInterest,
          }),
    onboardingCompleted: Boolean(data.onboardingCompleted),
    onboardingCompletedAt:
      typeof data.onboardingCompletedAt === "string" ? data.onboardingCompletedAt : null,
    onboardingStep:
      typeof data.onboardingStep === "number"
        ? Math.min(PROFILE_TOTAL_STEPS, Math.max(1, Math.trunc(data.onboardingStep)))
        : 1,
    expertiseAreas,
    sectorsOfInterest,
    education,
    careerHistory,
  };
}
