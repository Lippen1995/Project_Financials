import PdfDecisionAnalyticsClient from "./PdfDecisionAnalyticsClient";

export default async function PdfDecisionAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  return (
    <PdfDecisionAnalyticsClient
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
      }}
    />
  );
}
