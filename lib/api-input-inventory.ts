export type ApiInputSurface = "body" | "path" | "query";

export type ApiInputRouteInventory = {
  route: string;
  mutating: boolean;
  readOnly: boolean;
  surfaces: ApiInputSurface[];
  missingValidation: ApiInputSurface[];
};

const mutatingExportPattern =
  /export\s+(?:async\s+function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/;
const readOnlyExportPattern =
  /export\s+(?:async\s+function|const)\s+GET\b/;
const bodyInputPattern =
  /await\s+[\w.]+\.json\s*\(|\b(?:request|req)\.body\b/;
const bodyValidationPattern =
  /\.(?:safeParse|parse)\s*\(|\bwriteLimitedCsvUpload\s*\(/;
const pathValidationPattern =
  /\b(?:parseRouteIds|tryParseRouteIds|tryParseCompanyReference)\s*\(|\bparamsSchema\.(?:safeParse|parse)\s*\(/;
const queryValidationPattern =
  /\b(?:query|list|limit|searchParams)\w*Schema\.(?:safeParse|parse)\s*\(/;

export function analyzeApiInputRoute(
  route: string,
  source: string,
): ApiInputRouteInventory {
  const mutating = mutatingExportPattern.test(source);
  const readOnly = readOnlyExportPattern.test(source);
  const surfaces: ApiInputSurface[] = [];
  const missingValidation: ApiInputSurface[] = [];

  if (!mutating && !readOnly) {
    return { route, mutating, readOnly, surfaces, missingValidation };
  }

  if (bodyInputPattern.test(source)) {
    surfaces.push("body");
    if (!bodyValidationPattern.test(source)) {
      missingValidation.push("body");
    }
  }

  if (route.includes("[")) {
    surfaces.push("path");
    if (!pathValidationPattern.test(source)) {
      missingValidation.push("path");
    }
  }

  if (source.includes("searchParams")) {
    surfaces.push("query");
    if (!queryValidationPattern.test(source)) {
      missingValidation.push("query");
    }
  }

  return { route, mutating, readOnly, surfaces, missingValidation };
}
