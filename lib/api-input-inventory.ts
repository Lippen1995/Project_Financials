export type ApiInputSurface = "body" | "path" | "query";

export type ApiInputRouteInventory = {
  route: string;
  mutating: boolean;
  surfaces: ApiInputSurface[];
  missingValidation: ApiInputSurface[];
};

const mutatingExportPattern =
  /export\s+(?:async\s+function|const)\s+(?:POST|PUT|PATCH|DELETE)\b/;
const bodyInputPattern = /await\s+[\w.]+\.json\s*\(/;
const bodyValidationPattern = /\.(?:safeParse|parse)\s*\(/;
const pathValidationPattern =
  /\b(?:parseRouteIds|tryParseRouteIds)\s*\(|\bparamsSchema\.(?:safeParse|parse)\s*\(/;
const queryValidationPattern =
  /\b(?:query|list|limit|searchParams)\w*Schema\.(?:safeParse|parse)\s*\(|\b(?:parse|validate|bounded)[A-Z]\w*\s*\(|\bSUPPORTED_\w+\.includes\s*\(|Object\.values\([^)]*\)\.includes\s*\(/;

export function analyzeApiInputRoute(
  route: string,
  source: string,
): ApiInputRouteInventory {
  const mutating = mutatingExportPattern.test(source);
  const surfaces: ApiInputSurface[] = [];
  const missingValidation: ApiInputSurface[] = [];

  if (!mutating) {
    return { route, mutating, surfaces, missingValidation };
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

  return { route, mutating, surfaces, missingValidation };
}
