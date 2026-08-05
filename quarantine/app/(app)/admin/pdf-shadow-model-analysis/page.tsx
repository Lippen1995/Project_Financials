import PdfShadowModelAnalysisClient from "./PdfShadowModelAnalysisClient";

export default async function PdfShadowModelAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <PdfShadowModelAnalysisClient
      initialFilters={{
        limit: typeof sp.limit === "string" ? sp.limit : "100",
        fiscalYear: typeof sp.fiscalYear === "string" ? sp.fiscalYear : "",
        orgNumber: typeof sp.orgNumber === "string" ? sp.orgNumber : "",
        split: typeof sp.split === "string" ? sp.split : "all",
        threshold: typeof sp.threshold === "string" ? sp.threshold : "0.5",
        maxExamples: typeof sp.maxExamples === "string" ? sp.maxExamples : "50",
      }}
    />
  );
}
