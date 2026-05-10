export type AdminAccessSubject =
  | { appRole?: string | null | undefined }
  | { user?: { appRole?: string | null | undefined } | null | undefined }
  | null
  | undefined;

export function isFinancialReviewerRole(
  appRole: string | undefined,
): appRole is "ADMIN" | "FINANCIAL_REVIEWER" {
  return appRole === "ADMIN" || appRole === "FINANCIAL_REVIEWER";
}

export function canAccessAdmin(subject: AdminAccessSubject): boolean {
  if (!subject) {
    return false;
  }

  const appRole =
    "user" in subject
      ? subject.user?.appRole
      : "appRole" in subject
        ? subject.appRole
        : undefined;

  return isFinancialReviewerRole(appRole ?? undefined);
}
