import { describe, expect, it } from "vitest";

import { analyzeApiInputRoute } from "@/lib/api-input-inventory";

describe("analyzeApiInputRoute", () => {
  it("reports unvalidated query-string input on a GET route", () => {
    const result = analyzeApiInputRoute(
      "app/api/widgets/route.ts",
      `
        export async function GET(request) {
          const query = request.nextUrl.searchParams.get("query");
          return findWidgets(query);
        }
      `,
    );

    expect(result.surfaces).toEqual(["query"]);
    expect(result.missingValidation).toEqual(["query"]);
  });

  it("recognizes the shared company-reference parser on a GET path", () => {
    const result = analyzeApiInputRoute(
      "app/api/companies/[slug]/route.ts",
      `
        export async function GET(_request, { params }) {
          const { slug } = await params;
          const companyReference = tryParseCompanyReference(slug);
          return getCompany(companyReference);
        }
      `,
    );

    expect(result.surfaces).toEqual(["path"]);
    expect(result.missingValidation).toEqual([]);
  });

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

  it("reports an unvalidated streamed request body", () => {
    const result = analyzeApiInputRoute(
      "app/api/admin/imports/route.ts",
      `
        export async function POST(request) {
          await pipeline(Readable.fromWeb(request.body), createWriteStream("upload.csv"));
          return Response.json({ ok: true });
        }
      `,
    );

    expect(result.surfaces).toEqual(["body"]);
    expect(result.missingValidation).toEqual(["body"]);
  });

  it("recognizes the size-limited file upload module as streamed-body validation", () => {
    const result = analyzeApiInputRoute(
      "app/api/admin/imports/route.ts",
      `
        export async function POST(request) {
          await writeLimitedCsvUpload({
            body: request.body,
            filePath: "upload.csv",
            maxBytes: MAX_UPLOAD_BYTES,
          });
          return Response.json({ ok: true });
        }
      `,
    );

    expect(result.surfaces).toEqual(["body"]);
    expect(result.missingValidation).toEqual([]);
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

  it("does not mistake parseInt coercion for query-string validation", () => {
    const result = analyzeApiInputRoute(
      "app/api/widgets/route.ts",
      `
        export async function GET(request) {
          const limit = parseInt(request.nextUrl.searchParams.get("limit"), 10);
          return listWidgets(limit);
        }
      `,
    );

    expect(result.missingValidation).toEqual(["query"]);
  });

  it("does not accept an arbitrary query parser as validation evidence", () => {
    const result = analyzeApiInputRoute(
      "app/api/widgets/route.ts",
      `
        export async function GET(request) {
          const filters = parseWidgetFilters(request.nextUrl.searchParams);
          return listWidgets(filters);
        }
      `,
    );

    expect(result.missingValidation).toEqual(["query"]);
  });
});
