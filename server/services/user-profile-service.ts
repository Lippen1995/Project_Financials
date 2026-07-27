import type { Prisma } from "@prisma/client";

import { resolvePostLoginDestination } from "@/lib/auth-flow";
import { prisma } from "@/lib/prisma";
import {
  calculateProfileCompleteness,
  normalizeCareerEntries,
  normalizeEducationEntries,
  normalizeStringArray,
  toSerializableUserProfile,
  type ProfileCompanySearchResult,
  type UserProfilePatchInput,
  type UserProfileState,
} from "@/lib/user-profile";
import { ensureUserWorkspaceState } from "@/server/services/workspace-service";

type ProfileSeedInput = {
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
  linkedinConnected?: boolean;
  linkedinProviderAccountId?: string | null;
  requireOnboarding?: boolean;
};

type PrivateUserProfileView = {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    appRole: "USER" | "ADMIN" | "FINANCIAL_REVIEWER";
    subscriptionPlan: string;
    subscriptionStatus: "FREE" | "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  };
  profile: UserProfileState;
  matchedCompany: ProfileCompanySearchResult | null;
};

const privateProfileInclude = {
  employerMatchedCompany: {
    select: {
      id: true,
      slug: true,
      name: true,
      orgNumber: true,
      industryCode: {
        select: {
          title: true,
          description: true,
        },
      },
      addresses: {
        take: 1,
        select: {
          city: true,
          region: true,
        },
      },
    },
  },
} satisfies Prisma.UserProfileInclude;

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildLocationLabel(input: { city?: string | null; region?: string | null }) {
  const parts = [input.city?.trim(), input.region?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function toCompanySearchResult(company: {
  id: string;
  slug: string;
  name: string;
  orgNumber: string;
  industryCode?: { title?: string | null; description?: string | null } | null;
  addresses?: Array<{ city?: string | null; region?: string | null }>;
}): ProfileCompanySearchResult {
  return {
    id: company.id,
    slug: company.slug,
    name: company.name,
    orgNumber: company.orgNumber,
    location: buildLocationLabel(company.addresses?.[0] ?? {}),
    sector: company.industryCode?.title ?? company.industryCode?.description ?? null,
    logoUrl: null,
  };
}

function mergeFieldSources(
  currentValue: Prisma.JsonValue | null | undefined,
  updates: Record<string, "LINKEDIN">,
): Prisma.InputJsonValue {
  const base =
    currentValue && typeof currentValue === "object" && !Array.isArray(currentValue)
      ? { ...(currentValue as Record<string, unknown>) }
      : {};

  for (const [field, source] of Object.entries(updates)) {
    base[field] = source;
  }

  return base as Prisma.InputJsonValue;
}

async function syncUserDisplayFields(userId: string, profile: UserProfileState) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: profile.displayName,
      image: profile.profileImageUrl,
    },
  });
}

function serializeProfile(
  profile: Prisma.UserProfileGetPayload<{ include: typeof privateProfileInclude }>,
) {
  return {
    profile: toSerializableUserProfile({
      ...profile,
      onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
    }),
    matchedCompany: profile.employerMatchedCompany ? toCompanySearchResult(profile.employerMatchedCompany) : null,
  };
}

export async function ensureUserBaselineState(userId: string, seed?: ProfileSeedInput) {
  await ensureUserWorkspaceState(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  if (!user) {
    throw new Error("Could not initialize profile state for a missing user.");
  }

  await prisma.subscription.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      plan: "free",
      status: "FREE",
    },
  });

  const existingProfile = await prisma.userProfile.findUnique({
    where: { userId },
  });

  const seedDisplayName = normalizeNullableString(seed?.displayName ?? user.name);
  const seedProfileImage = normalizeNullableString(seed?.profileImageUrl ?? user.image);
  const seedWorkEmail = normalizeNullableString(seed?.email ?? user.email);

  if (!existingProfile) {
    const createdProfile = toSerializableUserProfile({
      displayName: seedDisplayName,
      profileImageUrl: seedProfileImage,
      workEmail: seedWorkEmail,
      linkedinConnected: Boolean(seed?.linkedinConnected),
      linkedinProviderAccountId: normalizeNullableString(seed?.linkedinProviderAccountId),
      onboardingStep: seed?.requireOnboarding ? 1 : 0,
      onboardingCompleted: false,
    });

    await prisma.userProfile.create({
      data: {
        userId,
        displayName: createdProfile.displayName,
        profileImageUrl: createdProfile.profileImageUrl,
        workEmail: createdProfile.workEmail,
        linkedinConnected: createdProfile.linkedinConnected,
        linkedinProviderAccountId: createdProfile.linkedinProviderAccountId,
        profileCompletenessScore: createdProfile.profileCompletenessScore,
        onboardingCompleted: false,
        onboardingStep: createdProfile.onboardingStep,
        fieldSources: seed?.linkedinConnected
          ? mergeFieldSources(null, {
              ...(seedDisplayName ? { displayName: "LINKEDIN" } : {}),
              ...(seedProfileImage ? { profileImageUrl: "LINKEDIN" } : {}),
              ...(seedWorkEmail ? { workEmail: "LINKEDIN" } : {}),
            })
          : undefined,
      },
    });

    await syncUserDisplayFields(userId, createdProfile);
    return;
  }

  const updateData: Partial<UserProfileState> & {
    fieldSources?: Prisma.InputJsonValue;
  } = {};
  const fieldSources: Record<string, "LINKEDIN"> = {};

  if (!normalizeNullableString(existingProfile.displayName) && seedDisplayName) {
    updateData.displayName = seedDisplayName;
    if (seed?.linkedinConnected) {
      fieldSources.displayName = "LINKEDIN";
    }
  }

  if (!normalizeNullableString(existingProfile.profileImageUrl) && seedProfileImage) {
    updateData.profileImageUrl = seedProfileImage;
    if (seed?.linkedinConnected) {
      fieldSources.profileImageUrl = "LINKEDIN";
    }
  }

  if (!normalizeNullableString(existingProfile.workEmail) && seedWorkEmail) {
    updateData.workEmail = seedWorkEmail;
    if (seed?.linkedinConnected) {
      fieldSources.workEmail = "LINKEDIN";
    }
  }

  if (seed?.linkedinConnected && !existingProfile.linkedinConnected) {
    updateData.linkedinConnected = true;
  }

  if (!normalizeNullableString(existingProfile.linkedinProviderAccountId) && seed?.linkedinProviderAccountId) {
    updateData.linkedinProviderAccountId = seed.linkedinProviderAccountId;
  }

  const mergedProfile = toSerializableUserProfile({
    ...existingProfile,
    ...updateData,
  });

  updateData.profileCompletenessScore = calculateProfileCompleteness(mergedProfile);

  if (Object.keys(fieldSources).length > 0) {
    updateData.fieldSources = mergeFieldSources(existingProfile.fieldSources, fieldSources);
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.userProfile.update({
      where: { userId },
      data: updateData,
    });
    await syncUserDisplayFields(userId, mergedProfile);
  }
}

export async function getPrivateUserProfileView(userId: string): Promise<PrivateUserProfileView> {
  await ensureUserBaselineState(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      appRole: true,
      subscription: {
        select: {
          plan: true,
          status: true,
        },
      },
      profile: {
        include: privateProfileInclude,
      },
    },
  });

  if (!user?.profile) {
    throw new Error("Profile state could not be loaded for the current user.");
  }

  const serialized = serializeProfile(user.profile);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      appRole: user.appRole,
      subscriptionPlan: user.subscription?.plan ?? "free",
      subscriptionStatus: user.subscription?.status ?? "FREE",
    },
    profile: serialized.profile,
    matchedCompany: serialized.matchedCompany,
  };
}

export async function saveUserProfile(userId: string, input: UserProfilePatchInput) {
  await ensureUserBaselineState(userId);

  const current = await prisma.userProfile.findUnique({
    where: { userId },
  });

  if (!current) {
    throw new Error("Profile could not be found for update.");
  }

  const currentProfile = toSerializableUserProfile({
    ...current,
    onboardingCompletedAt: current.onboardingCompletedAt?.toISOString() ?? null,
  });

  const nextProfile: UserProfileState = {
    ...currentProfile,
    displayName:
      input.displayName !== undefined ? normalizeNullableString(input.displayName) : currentProfile.displayName,
    profileImageUrl:
      input.profileImageUrl !== undefined
        ? normalizeNullableString(input.profileImageUrl)
        : currentProfile.profileImageUrl,
    professionalBio:
      input.professionalBio !== undefined
        ? normalizeNullableString(input.professionalBio)
        : currentProfile.professionalBio,
    jobTitle: input.jobTitle !== undefined ? normalizeNullableString(input.jobTitle) : currentProfile.jobTitle,
    employerName:
      input.employerName !== undefined ? normalizeNullableString(input.employerName) : currentProfile.employerName,
    // Derive the organization number from the matched local Brreg-backed company below.
    // Never persist the client-supplied value as company master data.
    employerOrgNumber: currentProfile.employerOrgNumber,
    employerLogoUrl:
      input.employerLogoUrl !== undefined
        ? normalizeNullableString(input.employerLogoUrl)
        : currentProfile.employerLogoUrl,
    employerSector:
      input.employerSector !== undefined
        ? normalizeNullableString(input.employerSector)
        : currentProfile.employerSector,
    employerMatchedCompanyId:
      input.employerMatchedCompanyId !== undefined
        ? normalizeNullableString(input.employerMatchedCompanyId)
        : currentProfile.employerMatchedCompanyId,
    isStudent: input.isStudent ?? currentProfile.isStudent,
    universityName:
      input.universityName !== undefined
        ? normalizeNullableString(input.universityName)
        : currentProfile.universityName,
    degree: input.degree !== undefined ? normalizeNullableString(input.degree) : currentProfile.degree,
    studyFocus:
      input.studyFocus !== undefined ? normalizeNullableString(input.studyFocus) : currentProfile.studyFocus,
    graduationYear:
      input.graduationYear !== undefined ? input.graduationYear ?? null : currentProfile.graduationYear,
    internshipInterest:
      input.internshipInterest !== undefined
        ? normalizeNullableString(input.internshipInterest)
        : currentProfile.internshipInterest,
    workEmail:
      input.workEmail !== undefined ? normalizeNullableString(input.workEmail) : currentProfile.workEmail,
    phoneNumber:
      input.phoneNumber !== undefined ? normalizeNullableString(input.phoneNumber) : currentProfile.phoneNumber,
    countryOfOrigin:
      input.countryOfOrigin !== undefined
        ? normalizeNullableString(input.countryOfOrigin)
        : currentProfile.countryOfOrigin,
    countryOfWork:
      input.countryOfWork !== undefined
        ? normalizeNullableString(input.countryOfWork)
        : currentProfile.countryOfWork,
    currentLocation:
      input.currentLocation !== undefined
        ? normalizeNullableString(input.currentLocation)
        : currentProfile.currentLocation,
    linkedinProfileUrl:
      input.linkedinProfileUrl !== undefined
        ? normalizeNullableString(input.linkedinProfileUrl)
        : currentProfile.linkedinProfileUrl,
    linkedinConnected: currentProfile.linkedinConnected,
    linkedinProviderAccountId: currentProfile.linkedinProviderAccountId,
    profileCompletenessScore: currentProfile.profileCompletenessScore,
    onboardingCompleted: currentProfile.onboardingCompleted,
    onboardingCompletedAt: currentProfile.onboardingCompletedAt,
    onboardingStep:
      input.onboardingStep !== undefined ? input.onboardingStep : currentProfile.onboardingStep,
    expertiseAreas:
      input.expertiseAreas !== undefined ? normalizeStringArray(input.expertiseAreas) : currentProfile.expertiseAreas,
    sectorsOfInterest:
      input.sectorsOfInterest !== undefined
        ? normalizeStringArray(input.sectorsOfInterest)
        : currentProfile.sectorsOfInterest,
    education:
      input.education !== undefined ? normalizeEducationEntries(input.education) : currentProfile.education,
    careerHistory:
      input.careerHistory !== undefined
        ? normalizeCareerEntries(input.careerHistory)
        : currentProfile.careerHistory,
  };

  if (nextProfile.isStudent) {
    nextProfile.employerMatchedCompanyId = null;
    nextProfile.employerName = null;
    nextProfile.employerOrgNumber = null;
    nextProfile.employerLogoUrl = null;
    nextProfile.employerSector = null;
    nextProfile.jobTitle = null;
  } else {
    nextProfile.universityName = nextProfile.universityName;
  }

  let matchedCompany: ProfileCompanySearchResult | null = null;

  if (nextProfile.employerMatchedCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: nextProfile.employerMatchedCompanyId },
      select: {
        id: true,
        slug: true,
        name: true,
        orgNumber: true,
        industryCode: {
          select: {
            title: true,
            description: true,
          },
        },
        addresses: {
          take: 1,
          select: {
            city: true,
            region: true,
          },
        },
      },
    });

    if (company) {
      matchedCompany = toCompanySearchResult(company);
      nextProfile.employerName = company.name;
      nextProfile.employerOrgNumber = company.orgNumber;
      nextProfile.employerSector = matchedCompany.sector;
      nextProfile.employerLogoUrl = null;
    }
  } else if (input.employerMatchedCompanyId !== undefined) {
    nextProfile.employerOrgNumber = null;
    nextProfile.employerLogoUrl = null;
  }

  nextProfile.profileCompletenessScore = calculateProfileCompleteness(nextProfile);

  const completedAt =
    input.onboardingCompleted === true ? new Date() : input.skipOnboarding ? null : current.onboardingCompletedAt;

  nextProfile.onboardingCompleted =
    input.onboardingCompleted === true ? true : input.skipOnboarding ? false : current.onboardingCompleted;
  nextProfile.onboardingCompletedAt = completedAt ? completedAt.toISOString() : null;
  nextProfile.onboardingStep = input.onboardingCompleted
    ? 5
    : input.skipOnboarding
      ? 0
      : Math.min(5, Math.max(1, input.onboardingStep ?? currentProfile.onboardingStep));

  await prisma.userProfile.update({
    where: { userId },
    data: {
      displayName: nextProfile.displayName,
      profileImageUrl: nextProfile.profileImageUrl,
      professionalBio: nextProfile.professionalBio,
      jobTitle: nextProfile.jobTitle,
      employerName: nextProfile.employerName,
      employerOrgNumber: nextProfile.employerOrgNumber,
      employerLogoUrl: nextProfile.employerLogoUrl,
      employerSector: nextProfile.employerSector,
      employerMatchedCompanyId: nextProfile.employerMatchedCompanyId,
      isStudent: nextProfile.isStudent,
      universityName: nextProfile.universityName,
      degree: nextProfile.degree,
      studyFocus: nextProfile.studyFocus,
      graduationYear: nextProfile.graduationYear,
      internshipInterest: nextProfile.internshipInterest,
      workEmail: nextProfile.workEmail,
      phoneNumber: nextProfile.phoneNumber,
      countryOfOrigin: nextProfile.countryOfOrigin,
      countryOfWork: nextProfile.countryOfWork,
      currentLocation: nextProfile.currentLocation,
      linkedinProfileUrl: nextProfile.linkedinProfileUrl,
      profileCompletenessScore: nextProfile.profileCompletenessScore,
      onboardingCompleted: nextProfile.onboardingCompleted,
      onboardingCompletedAt: completedAt,
      onboardingStep: nextProfile.onboardingStep,
      expertiseAreas: nextProfile.expertiseAreas,
      sectorsOfInterest: nextProfile.sectorsOfInterest,
      education: nextProfile.education,
      careerHistory: nextProfile.careerHistory,
    },
  });

  await syncUserDisplayFields(userId, nextProfile);

  return {
    profile: nextProfile,
    matchedCompany,
  };
}

export async function resolveUserPostLoginDestination(userId: string, preferredPath?: string | null) {
  await ensureUserBaselineState(userId);

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      onboardingCompleted: true,
      onboardingStep: true,
    },
  });

  return resolvePostLoginDestination({
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    onboardingRequired: (profile?.onboardingStep ?? 0) > 0,
    preferredPath,
  });
}

export async function searchCompaniesForProfile(query: string) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const companies = await prisma.company.findMany({
    where: {
      OR: [
        {
          name: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
        {
          orgNumber: {
            contains: normalizedQuery,
          },
        },
        {
          slug: {
            contains: normalizedQuery.toLowerCase(),
          },
        },
      ],
    },
    take: 8,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      orgNumber: true,
      industryCode: {
        select: {
          title: true,
          description: true,
        },
      },
      addresses: {
        take: 1,
        select: {
          city: true,
          region: true,
        },
      },
    },
  });

  return companies.map((company) => toCompanySearchResult(company));
}
