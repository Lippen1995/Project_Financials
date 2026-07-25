import { describe, expect, it } from "vitest";

import { analyzeApiInputRoute } from "@/lib/api-input-inventory";

describe("analyzeApiInputRoute", () => {
  it("reports unvalidated body and path inputs on a mutating route", () => {
    const result = analyzeApiInputRoute(
      "app/api/widgets/[widgetId]/route.ts",
      `
        export async function PATCH(request, { params }) {
          const { widgetId } = await params;
          const body = await request.json();
          return updateWidget(widgetId, body);
        }
      `,
    );

    expect(result.mutating).toBe(true);
    expect(result.surfaces).toEqual(["body", "path"]);
    expect(result.missingValidation).toEqual(["body", "path"]);
  });

  it("does not mistake body validation for query-string validation", () => {
    const result = analyzeApiInputRoute(
      "app/api/widgets/route.ts",
      `
        const bodySchema = z.object({ name: z.string() });
        export async function POST(request) {
          const workspace = request.nextUrl.searchParams.get("workspace");
          const body = bodySchema.parse(await request.json());
          return createWidget(workspace, body);
        }
      `,
    );

    expect(result.missingValidation).toEqual(["query"]);
  });
});
